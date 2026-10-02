import json
import re
import sys

import requests
from bs4 import BeautifulSoup

HEADING = re.compile(
    r"\b(responsibilit|qualification|requirement|about the role|what you.?ll do|who you are|minimum qualification)\b",
    re.I,
)
def from_known_containers(soup: BeautifulSoup):
    selectors = [
        ("div", {"class_": "show-more-less-html__markup"}),
        ("div", {"id": "job-details"}),
        ("div", {"class_": re.compile(r"job__description|posting-page|job-post|ats-description", re.I)}),
        ("section", {"class_": re.compile(r"job-description|posting", re.I)}),
    ]
    for name, attrs in selectors:
        node = soup.find(name, **attrs)
        if not node:
            continue
        text = text_of(node)
        if len(text) >= 200:
            return text
    return None


def text_of(node) -> str:
    return node.get_text("\n", strip=True)


def job_postings(data):
    nodes = data if isinstance(data, list) else [data]
    if isinstance(data, dict) and isinstance(data.get("@graph"), list):
        nodes = data["@graph"]
    for node in nodes:
        if not isinstance(node, dict):
            continue
        kind = node.get("@type", "")
        kinds = kind if isinstance(kind, list) else [kind]
        if any("JobPosting" in str(item) for item in kinds):
            yield node


def from_json_ld(soup: BeautifulSoup):
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw = script.string or script.get_text() or ""
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        for node in job_postings(data):
            description = node.get("description") or ""
            if "<" in description and ">" in description:
                description = BeautifulSoup(description, "html.parser").get_text("\n", strip=True)
            company = node.get("hiringOrganization")
            company_name = company.get("name") if isinstance(company, dict) else None
            if len(description.strip()) >= 80:
                return {
                    "title": node.get("title"),
                    "company": company_name,
                    "job_description": description.strip(),
                    "extraction_method": "json-ld",
                }
    return None


def from_largest_block(soup: BeautifulSoup) -> str:
    for tag in soup(["script", "style", "nav", "footer", "header", "noscript", "svg", "form"]):
        tag.decompose()
    headed = []
    plain = []
    for node in soup.find_all(["article", "main", "section", "div"]):
        text = text_of(node)
        if not 400 <= len(text) <= 40000:
            continue
        if HEADING.search(text):
            headed.append(text)
        else:
            plain.append(text)
    if headed:
        return min(headed, key=len)
    if plain:
        return max(plain, key=len)
    return ""


def extract_job(html: str, url: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    title = None
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    structured = from_json_ld(soup)
    if structured:
        structured["url"] = url
        structured["title"] = structured.get("title") or title
        structured["warning"] = None
        return structured
    description = from_known_containers(soup) or from_largest_block(soup)
    warning = None
    if len(description) < 80:
        warning = "No job description was found. The page may require a login or only render after JavaScript."
        description = ""
    return {
        "url": url,
        "title": title,
        "company": None,
        "job_description": description,
        "extraction_method": "page-text" if description else "none",
        "warning": warning,
    }


def fetch_job(url: str) -> dict:
    response = requests.get(
        url,
        headers={"User-Agent": "Mozilla/5.0"},
        timeout=20,
    )
    response.raise_for_status()
    return extract_job(response.text, url)


def main() -> None:
    url = sys.stdin.readline().strip()
    job = fetch_job(url)
    with open("job_posting.json", "w", encoding="utf-8") as file:
        json.dump(job, file, indent=4, ensure_ascii=False)
    print(job.get("warning") or job.get("extraction_method") or "")


if __name__ == "__main__":
    main()
