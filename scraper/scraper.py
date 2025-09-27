import requests
from bs4 import BeautifulSoup
import json
import unicodedata
import re
import json
from collections import defaultdict
from pymongo import MongoClient

# ---------- CONFIG ----------
DB_NAME = "report_simplifier"
COLLECTION_NAME = "reference_ranges"
MONGO_URI = "mongodb://localhost:27017/"   # change if using Atlas or remote
URL = "https://emedicine.medscape.com/article/2172316-overview"

def clean_text(text: str) -> str:
    """Normalize text and remove problematic characters."""
    text = unicodedata.normalize("NFKD", text)
    text = text.replace("\u00a0", " ")    # non-breaking space → space
    text = text.replace("μ", "u")        # micro symbol → u
    text = text.replace("×", "x")        # multiplication symbol → x
    text = text.replace("˂", "<").replace("≥", ">=").replace("≤", "<=")
    return text.strip()

def parse_single_range(part: str, sex=None):
    """
    Parses a single, simple part of a value string that does not contain 'or' or ';'.
    It separates parenthetical values from the main value for individual parsing.
    """
    part = part.strip()
    results = []

    # 1. Find all parenthetical expressions and parse them recursively.
    parenthetical_ranges = []
    parenthetical_matches = re.findall(r"\((.*?)\)", part)
    for p_match in parenthetical_matches:
        # Use parse_range for recursion in case the content has its own delimiters
        parenthetical_ranges.extend(parse_range(p_match, sex))

    # 2. Remove parenthetical content to get a clean main string to parse.
    clean_part = re.sub(r"\s*\([^)]*\)", "", part).strip()

    # 3. Parse the cleaned main string.
    if clean_part:
        # Pattern for a numerical range, e.g., "150-400 units"
        m_range = re.match(r"^(?P<low>-?\d+(\.\d+)?)\s*-\s*(?P<high>-?\d+(\.\d+)?)(?:\s*(?P<unit>.*))?$", clean_part)
        if m_range:
            result = {
                "low": float(m_range.group("low")),
                "high": float(m_range.group("high")),
                "unit": m_range.group("unit").strip() if m_range.group("unit") else "",
            }
            if sex is not None:
                result["sex"] = sex

            results.append(result)
        else:
            # Pattern for an inequality, e.g., "<10 units" or ">=50 units"
            m_ineq = re.match(r"^(?P<ineq>[<>]=?)\s*(?P<num>-?\d+(\.\d+)?)(?:\s*(?P<unit>.*))?$", clean_part)
            if m_ineq:
                num = float(m_ineq.group("num"))
                unit = m_ineq.group("unit").strip() if m_ineq.group("unit") else ""
                if m_ineq.group("ineq") in ("<", "<="):
                    results.append({"low": None, "high": num, "unit": unit, "sex": sex})
                else:  # Handles ">" or ">="
                    results.append({"low": num, "high": None, "unit": unit, "sex": sex})
            else:
                # If no pattern matches, treat it as a non-numeric value.
                results.append({"low": None, "high": None, "unit": clean_part, "sex": sex})

    # 4. Combine the results from the main string and parenthetical strings.
    results.extend(parenthetical_ranges)

    return results

def parse_range(value: str, sex_override=None):
    """
    Parses a full value string, which may include sex-specific ranges,
    delimiters like ';' or 'or', and thousand-separator commas.
    """
    results = []
    value = clean_text(value)

    # Key Fix 1: Remove thousand separators *before* any splitting.
    value = re.sub(r"(?<=\d),(?=\d)", "", value)

    # First, split by semicolons for major sections (e.g., Male vs. Female ranges)
    sections = re.split(r"\s*;\s*", value)

    for sec in sections:
        sex = sex_override
        # Check for sex-specific labels at the start of a section
        if sex is None:
            if sec.lower().startswith(("female", "females")):
                sex = "female"
                sec = re.sub(r"^[Ff]emales?:", "", sec).strip()
            elif sec.lower().startswith(("male", "males")):
                sex = "male"
                sec = re.sub(r"^[Mm]ales?:", "", sec).strip()

        # Key Fix 2: Split by 'or' for alternative ranges. Removed comma splitting.
        parts = re.split(r"\s+or\s+", sec)
        for part in parts:
            if part:
                # The new parse_single_range handles parenthetical parts internally.
                results.extend(parse_single_range(part, sex))

    return results

    """Scrapes the website and parses lab values from list items."""
    try:
        response = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching URL: {e}")
        return {}
        
    soup = BeautifulSoup(response.text, "html.parser")

    data = {}
    for h3 in soup.find_all("h3"):
        section = clean_text(h3.get_text(strip=True))
        ul = h3.find_next_sibling("ul")

        if ul:
            items = []
            for li in ul.find_all("li"):
                raw_text = clean_text(li.get_text(" ", strip=True))
                if ":" in raw_text:
                    test, value = raw_text.split(":", 1)
                    test = test.strip()
                    value = value.strip()
                    ranges = parse_range(value)
                    items.append({"test": test, "ranges": ranges})
                else:
                    # Handle list items without a colon (no value to parse)
                    items.append({"test": raw_text, "ranges": []})
            data[section] = items
    return data
def scrape_lab_values(url):
    """Scrapes the website, parses lab values, and filters out null ranges."""
    try:
        response = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching URL: {e}")
        return {}, set()  # Return empty data and log on error

    soup = BeautifulSoup(response.text, "html.parser")

    data = {}
    # NEW: Initialize a set to log tests with removed ranges
    tests_with_null_ranges = set()

    for h3 in soup.find_all("h3"):
        section = clean_text(h3.get_text(strip=True))
        ul = h3.find_next_sibling("ul")

        if ul:
            items = []
            for li in ul.find_all("li"):
                raw_text = clean_text(li.get_text(" ", strip=True))
                if ":" in raw_text:
                    test, value = raw_text.split(":", 1)
                    test = test.strip()
                    value = value.strip()
                    ranges = parse_range(value)

                    # NEW: Filter out null ranges and log the test name
                    filtered_ranges = []
                    was_filtered = False
                    for r in ranges:
                        # Check if both 'low' and 'high' are None (null in JSON)
                        if r.get("low") is None and r.get("high") is None:
                            was_filtered = True
                        else:
                            filtered_ranges.append(r)

                    if was_filtered:
                        tests_with_null_ranges.add(test)
                    
                    # Append the item with the newly filtered ranges list
                    items.append({"test": test, "ranges": filtered_ranges})
                else:
                    items.append({"test": raw_text, "ranges": []})
            data[section] = items
            
    # NEW: Return the data and the set of logged test names
    return data, tests_with_null_ranges

def insert_into_mongodb(file_name: str):
    # Connect to MongoDB
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    collection = db[COLLECTION_NAME]

    # Load file
    with open(file_name, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Transform and prepare docs
    mongo_ready = []
    for category, tests in data.items():
        for test in tests:
            new_doc = {"type": category, "test": test["test"]}
            unit_indexed = defaultdict(list)
            for r in test.get("ranges", []):
                unit = r.get("unit", "unknown")
                entry = {k: v for k, v in r.items() if k != "unit"}
                unit_indexed[unit].append(entry)
            
            compact_ranges = {}
            for unit, values in unit_indexed.items():
                if len(values) == 1:
                    compact_ranges[unit] = values[0]
                else:
                    compact_ranges[unit] = values

            new_doc["ranges"] = compact_ranges
            mongo_ready.append(new_doc)

    # Insert into MongoDB
    if mongo_ready:
        collection.insert_many(mongo_ready)
        print(f"✅ Inserted {len(mongo_ready)} documents into '{DB_NAME}.{COLLECTION_NAME}'")
    else:
        print("⚠️ No documents to insert")

if __name__ == "__main__":
    # MODIFIED: Unpack both the data and the logged tests from the function call
    lab_values, logged_tests = scrape_lab_values(URL)
    file_name = "lab_values.json"
    
    if lab_values:
        with open(file_name, "w", encoding="utf-8") as f:
            json.dump(lab_values, f, indent=4, ensure_ascii=False)
        print(f"Saved fully parsed lab values to {file_name}")

        # NEW: Print the log of tests that had null ranges removed
        if logged_tests:
            print("\nThe following tests had non-numeric or fallback ranges that were removed:")
            # Sort the set for consistent, alphabetical output
            for test_name in sorted(list(logged_tests)):
                print(f"  - {test_name}")

    insert_into_mongodb(file_name)

    