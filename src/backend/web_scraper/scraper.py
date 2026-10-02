import requests
from bs4 import BeautifulSoup
import json

url = input("Paste job posting URL: ")

# Get webpage
response = requests.get(
    url,
    headers={"User-Agent": "Mozilla/5.0"},
    timeout=10
)

response.raise_for_status()

# Parse webpage
soup = BeautifulSoup(response.text, "html.parser")


# --------------------------------
# Find the job description
# --------------------------------

description = soup.find(
    "div",
    class_="show-more-less-html__markup"
)

if description:
    job_description = description.get_text("\n", strip=True)
else:
    print("Could not find job description.")
    job_description = ""


# --------------------------------
# Create JSON
# --------------------------------

job_data = {
    "url": url,
    "job_description": job_description
}


# --------------------------------
# Save JSON
# --------------------------------

with open("job_posting.json", "w", encoding="utf-8") as file:
    json.dump(
        job_data,
        file,
        indent=4,
        ensure_ascii=False
    )


print("\nSaved job posting to job_posting.json")

print("\nJob description:\n")
print(job_description)