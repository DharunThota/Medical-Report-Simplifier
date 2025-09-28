import { openai } from "../utils/aiClients.js";
import { extractJSON } from "../utils/helpers.js";
import { getTextFromImage } from "./ocrProcessor.js";

/**
 * Step 1 (cont.): Parse and correct raw text using the Gemini API to make it more generic.
 * This function extracts individual test results from a block of raw OCR text and corrects typos.
 * @param {string} rawText - Text extracted from the report.
 * @returns {Promise<object>} - The raw tests and a confidence score.
 */
export async function parseAndCorrectText(rawText) {
    const systemPrompt = `
        You are a medical report parser.

        Take raw text input containing lab tests and return ONLY a JSON object in this exact format:

        {
        "tests_raw": [
        "Test Name Value Unit (Interpretation)",
        ...
        ],
        "confidence": <number between 0 and 1>
        }

        Rules:
        1. Correct any typos or mistakes in test names or units.
        2. Add the interpretation in parentheses: Low, High, or Normal.
        3. Include all recognized tests in the "tests_raw" array, each as a single string.
        4. Confidence must reflect how certain you are about the correctness of the extracted and normalized results (0 = very uncertain, 1 = fully confident).
        5. Do NOT add extra fields.
        6. Do NOT include any explanations, notes, comments, markdown, or text outside of the JSON.
        7. JSON must be valid and parsable.
        8. The output must be exactly the JSON object with only "tests_raw" and "confidence".

        Example input:
        Hemogloobin: 10.2 g/dL, WBC: 11200 /uL

        Expected output:
        {
        "tests_raw": [
        "Hemoglobin 10.2 g/dL (Low)",
        "WBC 11200 /uL (High)"
        ],
        "confidence": 0.9
        }
    `;
  
  const userQuery = `
    Here is the raw OCR text from a medical report:
    ---
    ${rawText}
    ---
    Please extract and clean the test results based on the rules.
  `;
  
    try {
        console.log(userQuery)
        const response = await openai.chat.completions.create({
            model: "mistral-small", // or "gpt-4o", "gpt-4", etc.
            messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: rawText }
            ],
            temperature: 0 // deterministic output
        });
        console.log("Mistral API Raw Response:", response);

        // const text = result.candidates[0].content;
        const text = response.choices[0].message.content;
        console.log("LLM Parsing Response:", text);

        const resultJson = extractJSON(text);
        return {
            tests_raw: resultJson.tests_raw || [],
            confidence: resultJson.confidence || 0
        };

    } catch (error) {
        console.error("Error calling Gemini API for parsing:", error);
        throw new Error("Failed to parse and correct raw text.");
    }
  };

export async function parseDriver(req){
    let rawText = '';

    // Check if text or image is provided
    if (req.body && req.body.text) {
        rawText = req.body.text;
    } else if (req.file) {
        rawText = await getTextFromImage(req.file.buffer, req.file.mimetype);
        console.log("Extracted OCR Text:", rawText);
    } else {
        return { error: 'Please provide either text or an image file.' };
    }

    // Step 1: Parse and correct raw text using the new AI-powered function
    const result = await parseAndCorrectText(rawText);
    const tests_raw = result.tests_raw
    if (tests_raw.length === 0) {
        return { status: "unprocessed", reason: "No valid test results could be extracted from the input." };
    }

    return result;
}