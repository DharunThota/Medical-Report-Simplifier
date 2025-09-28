# AI-Powered Medical Report Simplifier

## Project Overview

This project is a backend service designed to demystify complex medical reports for patients. It accepts raw or scanned lab reports, intelligently extracts key information, normalizes the data against standard reference ranges, and generates patient-friendly summaries. By leveraging Optical Character Recognition (OCR) and advanced Large Language Models (LLMs), it bridges the gap between clinical jargon and patient understanding, without providing diagnoses.

The core mission is to handle common issues like OCR errors and inconsistent terminology, producing a structured, reliable, and easy-to-understand output.

## Key Features

* **Multi-Format Input:** Accepts both raw text and image-based medical reports (`.png`, `.jpg`, etc.).
* **AI-Powered OCR:** Utilizes Mistral AI's OCR engine to accurately extract text from scanned documents.
* **Intelligent Error Correction:** Employs a Mistral LLM to correct common OCR typos and transcription errors (e.g., "Hemglobin" -> "Hemoglobin").
* **Data Normalization:** Standardizes test names and units using a predefined mapping system to ensure consistency.
* **Reference Range Comparison:** Fetches appropriate reference ranges from a MongoDB database, with support for sex-specific ranges.
* **Patient-Friendly Summaries:** Generates simple, clear explanations for the findings using a Mistral LLM.
* **Anti-Hallucination Guardrails:** Includes a critical safety check to ensure the AI-generated summary only contains information present in the original report.
* **Dockerized Environment:** The entire application is containerized with Docker for easy setup and deployment.

## Architecture & How It Works

The service processes reports through a multi-step pipeline:

1.  **Input:** The API receives a `POST` request containing either `report_text` or an image file (`report_file`), plus an optional `sex` parameter.
2.  **OCR & Extraction:** If an image is provided, the **Mistral OCR** model extracts the raw text.
3.  **Correction & Structuring:** The raw text is sent to the **Mistral-Small LLM**, which corrects typos and formats the data into a structured list of tests.
4.  **Normalization:** The Node.js server parses the list. Using mappings in `server/constants/mapping.js`, it standardizes test names and units.
5.  **Data Enrichment:** The server queries a **MongoDB** database to fetch the correct reference range for each normalized test.
6.  **Summary Generation:** The normalized results are sent to the **Mistral-Small LLM** to generate a simple summary and explanations.
7.  **Guardrail Validation:** The service cross-references the generated summary against the initial extracted tests to prevent any hallucinated or extraneous information.
8.  **Output:** A final, structured JSON object with the normalized tests and validated summary is returned.

### Tech Stack

* **Backend:** Node.js, Express
* **AI / LLM Services:** Mistral AI (`mistral-ocr-latest`, `mistral-small`)
* **Database:** MongoDB
* **Containerization:** Docker
* **File Handling:** Multer
* **Scraper (for data population):** Python, BeautifulSoup, Requests

## Prerequisites

Before you begin, ensure you have the following installed:

* **Node.js** (v18 or higher) & **npm**
* **Python** (v3.6 or higher, for running the scraper)
* **Docker** and **Docker Compose**
* **MongoDB:** A running MongoDB instance (local or remote).

## Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/DharunThota/Medical-Report-Simplifier.git](https://github.com/DharunThota/Medical-Report-Simplifier.git)
    cd Medical-Report-Simplifier
    ```

2.  **Configure Environment Variables:**
    Create a `.env` file in the `server/` directory. Populate it with your credentials:
    ```env
    PORT=3000
    MONGODB_URI=mongodb://localhost:27017/report_simplifier
    MISTRAL_API_KEY=YOUR_MISTRAL_API_KEY_HERE
    ```
    Replace the values with your actual MongoDB connection string and Mistral API key.

3.  **Populate the Database (Optional):**
    The `scraper/` directory contains a Python script to populate your database with reference ranges.
    ```bash
    cd scraper
    pip install -r requirements.txt
    python scraper.py # Ensure your MONGODB_URI is accessible
    cd ..
    ```

4.  **Build and Run with Docker:**
    The recommended way to run the application is with Docker Compose.
    ```bash
    docker-compose up --build
    ```
    This will build the Node.js service image and start the container. The server will be available at `http://localhost:3000`.

## API Documentation

### Process a Medical Report

* **Endpoint:** `POST /report/process`
* **Description:** Processes a medical report from text or an image file.
* **Content-Type:** `multipart/form-data`

**Form Data Fields:**

* `report_file` (File): An image file of the report (e.g., `.png`, `.jpg`).
* `report_text` (String): Raw text from the report.
    *(Note: Provide either `report_file` or `report_text`, not both.)*
* `sex` (String, Optional): The patient's biological sex (`male` or `female`) for more accurate reference ranges.

---

### Example Successful Response (200 OK)

**Request:** `POST /report/process` with an image file containing "Hemglobin 10.2 g/dL (Low), WBC 11200 /uL (Hgh)" and `sex: "female"`.

**Response Body:**
```json
{
  "tests": [
    {
      "name": "Hemoglobin",
      "value": 10.2,
      "unit": "g/dL",
      "status": "low",
      "ref_range": {
        "low": 12.0,
        "high": 15.5
      }
    },
    {
      "name": "WBC",
      "value": 11200,
      "unit": "/uL",
      "status": "high",
      "ref_range": {
        "low": 4000,
        "high": 11000
      }
    }
```
### Example Error Response (400 Bad Request)

**Reason:** The LLM guardrail detected a hallucinated test in the summary.

**Response Body:**

```json
{
  "status": "unprocessed",
  "reason": "Guardrail failed: AI summary contained hallucinated tests not present in the input data."
}
  ],
  "summary": "The report shows a low hemoglobin level and a high white blood cell count.",
  "status": "ok"
}
```

## Database Schema

The service relies on a MongoDB collection (e.g., `reference_ranges`) with documents structured as follows:
```json
{
  "_id": ObjectId("..."),
  "testName": "Hemoglobin", // Standardized test name
  "standardUnit": "g/dL",     // The unit all values are converted to
  "category": "Complete Blood Count",
  "ranges": {
    "male": { "low": 13.5, "high": 17.5 },
    "female": { "low": 12.0, "high": 15.5 },
    "general": { "low": 12.0, "high": 17.5 } // Fallback
  }
}
```
## Database Schema

The service relies on a MongoDB collection (e.g., `referenceranges`) with documents structured as follows:

```json

{
"\_id": ObjectId("..."),
"testName": "Hemoglobin", // Standardized test name
"standardUnit": "g/dL",     // The unit all values are converted to
"category": "Complete Blood Count",
"ranges": {
"male": { "low": 13.5, "high": 17.5 },
"female": { "low": 12.0, "high": 15.5 },
"general": { "low": 12.0, "high": 17.5 } // Fallback
}
}

```
## Acknowledgments

* Reference range data was sourced from [Medscape](https://emedicine.medscape.com/).

* Powered by the [Mistral AI Platform](https://mistral.ai/).
