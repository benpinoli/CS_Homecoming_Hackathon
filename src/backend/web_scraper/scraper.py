"""Scrape a job posting from a job board or company careers page.

Usage:
    python scraper.py <url>        # or run with no argument and paste the URL

Writes job_posting.json to the current directory:
    {url, title, company, location, job_description, source}

Strategies, tried in order:
  1. Public JSON APIs of common applicant tracking systems (Greenhouse, Lever,
     Ashby, Workday, SmartRecruiters). These work even though their pages are
     rendered by JavaScript.
  2. schema.org JobPosting JSON-LD embedded in the page. Most job sites include
     it so Google Jobs can index them.
  3. Known description containers (LinkedIn, Indeed, ...).
  4. Generic fallback: the largest description-like block on the page.

Pages that need a login, block bots (e.g. Cloudflare challenges), or build the
description with JavaScript and have no JSON-LD can't be read this way; the
script exits with an error saying so.
"""
import html
import json
import re
import sys
from urllib.parse import parse_qs, urlparse

import requests
import truststore
from bs4 import BeautifulSoup, NavigableString, Tag

# Verify HTTPS with the OS certificate store, so antivirus HTTPS scanning (e.g. Avast)
# and corporate proxies don't cause certificate errors.
truststore.inject_into_ssl()

TIMEOUT = 15
MIN_DESCRIPTION_CHARS = 200
OUTPUT_FILE = "job_posting.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Site-specific description containers, checked before the generic fallback.
KNOWN_SELECTORS = [
    ".show-more-less-html__markup",  # LinkedIn
    ".description__text",  # LinkedIn
    "#jobDescriptionText",  # Indeed
    "[class*='JobDetails_jobDescription']",  # Glassdoor
    ".job__description",  # Greenhouse (new boards)
    "#content .body",  # Greenhouse (old boards)
    "[data-automation-id='jobPostingDescription']",  # Workday
    ".posting-page .section-wrapper",  # Lever
    "#job-description",
    ".job-description",
]

DESCRIPTION_HINT = re.compile(r"job[-_ ]?desc|description|job[-_ ]?details|posting[-_ ]?body|jobad", re.I)
BLOCK_TAGS = {
    "p", "div", "section", "article", "ul", "ol", "li", "br", "h1", "h2", "h3", "h4",
    "h5", "h6", "table", "tr", "blockquote", "pre", "header", "footer", "main",
}
NOISE_TAGS = ["script", "style", "noscript", "svg", "nav", "header", "footer", "form", "iframe", "button"]


class ScrapeError(Exception):
    pass


# ---------------------------------------------------------------- text helpers

def html_to_text(fragment) -> str:
    """HTML (string or Tag) to plain text: one line per paragraph, '• ' bullets."""
    if isinstance(fragment, str):
        fragment = BeautifulSoup(html.unescape(fragment) if "&lt;" in fragment else fragment, "html.parser")
    lines: list[str] = []
    current: list[str] = []

    def flush():
        line = re.sub(r"\s+", " ", "".join(current)).strip()
        if line:
            lines.append(line)
        current.clear()

    def walk(node):
        for child in node.children:
            if isinstance(child, NavigableString):
                current.append(str(child))
            elif isinstance(child, Tag):
                if child.name in NOISE_TAGS:
                    continue
                block = child.name in BLOCK_TAGS
                if block:
                    flush()
                if child.name == "li":
                    current.append("• ")
                walk(child)
                if block:
                    flush()

    walk(fragment)
    flush()
    return "\n".join(lines)


def clean(value) -> str | None:
    if not value:
        return None
    text = re.sub(r"\s+", " ", html.unescape(str(value))).strip()
    return text or None


def result(url, title, company, location, description, source) -> dict:
    return {
        "url": url,
        "title": clean(title),
        "company": clean(company),
        "location": clean(location),
        "job_description": (description or "").strip(),
        "source": source,
    }


def get(url: str, headers: dict | None = None) -> requests.Response:
    response = requests.get(url, headers={**HEADERS, **(headers or {})}, timeout=TIMEOUT)
    response.raise_for_status()
    return response


# ---------------------------------------------------------------- ATS APIs

def from_greenhouse(url, parsed):
    # boards.greenhouse.io/<board>/jobs/<id>, job-boards(.eu).greenhouse.io/<board>/jobs/<id>
    m = re.match(r"/([^/]+)/jobs/(\d+)", parsed.path)
    if not (parsed.netloc.endswith("greenhouse.io") and m):
        return None
    board, job_id = m.groups()
    data = get(f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{job_id}").json()
    return result(
        url, data.get("title"), data.get("company_name") or board,
        (data.get("location") or {}).get("name"), html_to_text(data.get("content", "")), "greenhouse_api",
    )


def from_lever(url, parsed):
    # jobs.lever.co/<company>/<uuid>
    m = re.match(r"/([^/]+)/([0-9a-f-]{36})", parsed.path)
    if not (parsed.netloc.endswith("lever.co") and m):
        return None
    company, job_id = m.groups()
    api_host = "api.eu.lever.co" if ".eu." in parsed.netloc else "api.lever.co"
    data = get(f"https://{api_host}/v0/postings/{company}/{job_id}").json()
    parts = [html_to_text(data.get("description", ""))]
    for section in data.get("lists", []):
        parts.append(section.get("text", ""))
        parts.append(html_to_text(section.get("content", "")))
    parts.append(html_to_text(data.get("additional", "")))
    categories = data.get("categories") or {}
    return result(
        url, data.get("text"), company, categories.get("location"),
        "\n".join(p for p in parts if p), "lever_api",
    )


def from_ashby(url, parsed):
    # jobs.ashbyhq.com/<org>/<uuid>
    m = re.match(r"/([^/]+)/([0-9a-f-]{36})", parsed.path)
    if not (parsed.netloc == "jobs.ashbyhq.com" and m):
        return None
    org, job_id = m.groups()
    data = get(f"https://api.ashbyhq.com/posting-api/job-board/{org}").json()
    job = next((j for j in data.get("jobs", []) if j.get("id") == job_id), None)
    if not job:
        raise ScrapeError("That Ashby job wasn't found; the posting may have closed.")
    description = html_to_text(job["descriptionHtml"]) if job.get("descriptionHtml") else job.get("descriptionPlain")
    return result(url, job.get("title"), org, job.get("location"), description, "ashby_api")


def from_workday(url, parsed):
    # <tenant>.wd<N>.myworkdayjobs.com/[<locale>/]<site>/job/<location>/<slug>
    if "myworkdayjobs.com" not in parsed.netloc:
        return None
    segments = [s for s in parsed.path.split("/") if s]
    if segments and re.fullmatch(r"[a-z]{2}-[A-Z]{2}", segments[0]):
        segments = segments[1:]
    if len(segments) < 3 or "job" not in segments:
        return None
    tenant = parsed.netloc.split(".")[0]
    site = segments[0]
    rest = "/".join(segments[segments.index("job") + 1:])
    api = f"https://{parsed.netloc}/wday/cxs/{tenant}/{site}/job/{rest}"
    data = get(api, headers={"Accept": "application/json"}).json()
    info = data.get("jobPostingInfo") or {}
    return result(
        url, info.get("title"), (data.get("hiringOrganization") or {}).get("name") or tenant,
        info.get("location"), html_to_text(info.get("jobDescription", "")), "workday_api",
    )


def from_smartrecruiters(url, parsed):
    # jobs.smartrecruiters.com/<company>/<id>-<slug>
    m = re.match(r"/([^/]+)/(\d+)", parsed.path)
    if not (parsed.netloc == "jobs.smartrecruiters.com" and m):
        return None
    company, job_id = m.groups()
    data = get(f"https://api.smartrecruiters.com/v1/companies/{company}/postings/{job_id}").json()
    sections = ((data.get("jobAd") or {}).get("sections")) or {}
    parts = []
    for key in ("companyDescription", "jobDescription", "qualifications", "additionalInformation"):
        section = sections.get(key) or {}
        if section.get("text"):
            parts.append(section.get("title", ""))
            parts.append(html_to_text(section["text"]))
    loc = data.get("location") or {}
    location = ", ".join(x for x in (loc.get("city"), loc.get("region"), loc.get("country")) if x)
    return result(
        url, data.get("name"), (data.get("company") or {}).get("name") or company,
        location, "\n".join(p for p in parts if p), "smartrecruiters_api",
    )


ATS_HANDLERS = [from_greenhouse, from_lever, from_ashby, from_workday, from_smartrecruiters]


# ---------------------------------------------------------------- HTML pages

def iter_json_ld(soup):
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or script.get_text())
        except (json.JSONDecodeError, TypeError):
            continue
        stack = [data]
        while stack:
            item = stack.pop()
            if isinstance(item, list):
                stack.extend(item)
            elif isinstance(item, dict):
                yield item
                if "@graph" in item:
                    stack.append(item["@graph"])


def format_location(job_location) -> str | None:
    locations = job_location if isinstance(job_location, list) else [job_location]
    names = []
    for loc in locations:
        if isinstance(loc, dict):
            addr = loc.get("address") or {}
            if isinstance(addr, dict):
                names.append(", ".join(
                    str(addr[k]) for k in ("addressLocality", "addressRegion", "addressCountry")
                    if isinstance(addr.get(k), str)
                ))
            elif isinstance(addr, str):
                names.append(addr)
        elif isinstance(loc, str):
            names.append(loc)
    return "; ".join(n for n in names if n) or None


def from_json_ld(url, soup):
    for item in iter_json_ld(soup):
        types = item.get("@type")
        types = types if isinstance(types, list) else [types]
        if "JobPosting" not in types or not item.get("description"):
            continue
        org = item.get("hiringOrganization")
        company = org.get("name") if isinstance(org, dict) else org
        location = format_location(item.get("jobLocation"))
        if not location and item.get("jobLocationType") == "TELECOMMUTE":
            location = "Remote"
        return result(url, item.get("title"), company, location, html_to_text(item["description"]), "json_ld")
    return None


def page_title(soup) -> str | None:
    for tag, attrs in (("meta", {"property": "og:title"}), ("meta", {"name": "twitter:title"})):
        el = soup.find(tag, attrs=attrs)
        if el and el.get("content"):
            return el["content"]
    h1 = soup.find("h1")
    if h1 and h1.get_text(strip=True):
        return h1.get_text(" ", strip=True)
    return soup.title.get_text(strip=True) if soup.title else None


def page_company(soup) -> str | None:
    el = soup.find("meta", attrs={"property": "og:site_name"})
    return el["content"] if el and el.get("content") else None


def from_html(url, soup):
    for selector in KNOWN_SELECTORS:
        el = soup.select_one(selector)
        if el:
            text = html_to_text(el)
            if len(text) >= MIN_DESCRIPTION_CHARS:
                return result(url, page_title(soup), page_company(soup), None, text, "html_selector")

    for tag in soup(NOISE_TAGS):
        tag.decompose()

    def hinted(el):
        attrs = " ".join([el.get("id") or "", *el.get("class", [])])
        return bool(DESCRIPTION_HINT.search(attrs))

    candidates = [el for el in soup.find_all(["div", "section", "article"]) if hinted(el)]
    candidates += soup.find_all(["main", "article"])
    best = max(candidates, key=lambda el: len(el.get_text(" ", strip=True)), default=None)
    if best is None or len(best.get_text(strip=True)) < MIN_DESCRIPTION_CHARS:
        best = soup.body or soup
    return result(url, page_title(soup), page_company(soup), None, html_to_text(best), "html_generic")


# ---------------------------------------------------------------- entry point

def normalize_url(url: str) -> str:
    parsed = urlparse(url)
    # LinkedIn search/collection pages carry the job id in ?currentJobId=
    if "linkedin.com" in parsed.netloc and "currentJobId" in parsed.query:
        job_id = parse_qs(parsed.query)["currentJobId"][0]
        return f"https://www.linkedin.com/jobs/view/{job_id}/"
    return url


def scrape(url: str) -> dict:
    url = normalize_url(url.strip())
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ScrapeError("Provide a full http(s) URL.")

    for handler in ATS_HANDLERS:
        try:
            data = handler(url, parsed)
        except ScrapeError:
            raise
        except Exception:
            data = None  # API down, changed shape, or job is private; fall back to the page itself
        if data and len(data["job_description"]) >= MIN_DESCRIPTION_CHARS:
            return data

    try:
        response = get(url)
    except requests.HTTPError as e:
        code = e.response.status_code
        if code in (401, 403, 429, 999):
            raise ScrapeError(f"The site blocked the request (HTTP {code}). Try the company's own careers page or paste the text instead.")
        raise ScrapeError(f"The page returned HTTP {code}.")
    except requests.RequestException as e:
        raise ScrapeError(f"Couldn't load the page: {e.__class__.__name__}.")

    soup = BeautifulSoup(response.text, "html.parser")
    data = from_json_ld(url, soup) or from_html(url, soup)
    if len(data["job_description"]) < MIN_DESCRIPTION_CHARS:
        raise ScrapeError(
            "Couldn't find a job description on that page. It may need a login or load its content "
            "with JavaScript. Try the company's own careers page or paste the text instead."
        )
    return data


def main() -> int:
    # Windows consoles default to cp1252, which can't print bullets and most non-English text.
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")
    url = sys.argv[1] if len(sys.argv) > 1 else input("Paste job posting URL: ")
    try:
        data = scrape(url)
    except ScrapeError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    with open(OUTPUT_FILE, "w", encoding="utf-8") as file:
        json.dump(data, file, indent=4, ensure_ascii=False)

    print(f"Saved job posting to {OUTPUT_FILE} (via {data['source']})")
    print(f"{data['title']} | {data['company']} | {data['location']}")
    print(f"\n{data['job_description'][:1500]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
