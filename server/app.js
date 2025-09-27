import express from 'express';
import axios from 'axios';
import multer from 'multer';
import dotenv from 'dotenv';
import FormData from 'form-data';
import { Mistral } from '@mistralai/mistralai';
import { OpenAI } from 'openai'
import { connectDB, findTestReference } from './db.js';

// Load environment variables
dotenv.config();

const app = express();
const port = 3000;
const mistral = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY,
});
const openai = new OpenAI({
  apiKey: process.env.MISTRAL_API_KEY,
  baseURL: 'https://api.mistral.ai/v1',
});

// Connect to MongoDB on startup
connectDB().catch(console.error);

// Middleware for parsing JSON and handling file uploads
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

const unitConversion = {
        "/uL": { to: "/mm 3", factor: 1 },   // 1 /uL = 1 /mm3
        "/µL": { to: "/mm 3", factor: 1 },
        "x10^9/L": { to: "x 10 9 /L", factor: 1 },
        "10^9/L": { to: "x 10 9 /L", factor: 1 }
        // Add more mappings if needed
    };

const nameMap = {
    "WBC": "White blood cells",
    "RBC": "Red blood cells",
    "Hgb": "Hemoglobin",
    "HCT": "Hematocrit",
    "Haemoglobin": "Hemoglobin",
    "Haematocrit": "Hematocrit",
    // Add more abbreviations or common OCR typos here
};

// --- HELPER FUNCTIONS ---

/**
 * Step 1: Extract text from an image using OCR.space API
 * @param {Buffer} fileBuffer - The image file buffer.
 * @returns {Promise<string>} - The extracted text.
 */
async function getTextFromImage(imageData, mimeType = "image/jpeg") {
//   try {
//     const response = await mistral.vision.ocr.create({
//       model: 'mistral-ocr-latest',
//       file: fileBuffer,
//     });

//     console.log('OCR Response:', response);

//     if (response && response.text) {
//       return response.text;
//     }

//     throw new Error('OCR parsing failed to return results.');
//   } catch (error) {
//     console.error('Error during OCR processing:', error.message);
//     throw new Error('Failed to extract text from image.');
//   }
    try {
    let base64Image;

    if (Buffer.isBuffer(imageData)) {
      base64Image = imageData.toString("base64");
    } else if (typeof imageData === "string") {
      if (imageData.startsWith("data:")) {
        base64Image = imageData.split(",")[1];
        mimeType = imageData.match(/^data:(.*);base64,/)[1];
      } else {
        base64Image = imageData;
      }
    } else {
      throw new Error("Invalid image data. Must be Buffer or Base64 string.");
    }

    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    const ocrResponse = await mistral.ocr.process({
      model: "mistral-ocr-latest",
      document: {
        type: "image_url",
        imageUrl: dataUrl,
      },
      includeImageBase64: true,
    });
    console.log("OCR Response:", ocrResponse);

    // Combine text from all pages
    const combinedText = ocrResponse.pages
      .map((page) => page.markdown || "")
      .join("\n\n");

    return combinedText;
  } catch (err) {
    console.error("OCR failed:", err);
    throw err;
  }
}

function extractJSON(text) {
    // Match the first {...} block
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
        return JSON.parse(match[0]);
    } catch (err) {
        console.error("Failed to parse JSON:", err);
        return null;
    }
}

/**
 * Step 1 (cont.): Parse and correct raw text using the Gemini API to make it more generic.
 * This function extracts individual test results from a block of raw OCR text and corrects typos.
 * @param {string} rawText - Text extracted from the report.
 * @returns {Promise<object>} - The raw tests and a confidence score.
 */
async function parseAndCorrectText(rawText) {
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
        // const response = await mistral.chat.complete({
        //     model: "mistral-small", // or "gpt-4o", "gpt-4", etc.
        //     messages: [
        //         { role: "system", content: systemPrompt },
        //         { role: "user", content: userQuery }
        //     ],
        //     temperature: 0
        // })
        console.log("Mistral API Raw Response:", response);

        // const text = result.candidates[0].content;
        const text = response.choices[0].message.content;
        console.log("LLM Parsing Response:", text);

        const resultJson = extractJSON(text);
        return {
            tests_raw: resultJson.tests_raw || [],
            confidence: 0.90 // Higher confidence as we are using an LLM
        };

    } catch (error) {
        console.error("Error calling Gemini API for parsing:", error);
        throw new Error("Failed to parse and correct raw text.");
    }
  };

function calculateTestConfidence(match, name, unit, reference) {
    let score = 0;
    if (match) score += 0.3;
    if (reference && reference.name === name) score += 0.3;
    if (reference && reference.unit === unit) score += 0.2;
    if (reference?.ref_range) score += 0.2;
    return Math.min(score, 1);
}

/**
 * Step 2: Normalize the extracted raw tests against the MongoDB database.
 * This function is now async to handle database calls.
 * @param {Array<string>} rawTests - Array of raw test strings.
 * @param {string} [sex='female'] - Patient's sex for gender-specific ranges.
 * @returns {Promise<object>} - The normalized tests and a confidence score.
 */
async function normalizeTests(rawTests, sex = 'female') {
    const tests = [];
    let confidence = 0;

    // Use a for...of loop to correctly handle await inside the loop
    for (const testStr of rawTests) {
        const match = testStr.match(/([a-zA-Z\s]+) ([\d.]+) ([a-zA-Z\/\d\^]+)(?: \((Low|High|Normal)\))?/i);
        if (match) {
            console.log("Regex Match:", match);
            const [, rawName, valueStr, rawUnit, status] = match;
            // Await the asynchronous database call
            let value = parseFloat(valueStr.trim());
            let unit = rawUnit.trim();
            let name = rawName.trim();

            // Convert unit if necessary
            if (unitConversion[unit]) {
                value = value * unitConversion[unit].factor;
                unit = unitConversion[unit].to;
            }
            
            if (nameMap[name]) {
                name = nameMap[name];
            }
            console.log(`Converted Test: ${name}, Value: ${value}, Unit: ${unit}`);
            
            // Lookup reference in DB using converted unit
            const reference = await findTestReference(name, unit, sex);

            if (reference) {
                let determinedStatus = status ? status.toLowerCase() : 'normal';

                // Double-check status against reference range if not provided, correct anyway
                console.log(name, value, reference.ref_range.low, reference.ref_range.high)
                if (value < reference.ref_range.low) determinedStatus = 'low';
                else if (value > reference.ref_range.high) determinedStatus = 'high';

                console.log(`Normalized Test: ${name}, Value: ${value}, Unit: ${unit}, Status: ${determinedStatus}`);

                tests.push({
                    name: reference.name,
                    value: value,
                    unit: unit,
                    status: determinedStatus,
                    ref_range: reference.ref_range,
                });
                confidence += calculateTestConfidence(match, rawName, rawUnit, reference)
            }
        }
    }
    confidence = (tests.length > 0 ? confidence / tests.length : 0).toFixed(2);

    return {
        tests: tests,
        normalization_confidence: confidence // Static confidence
    };
}

/**
 * Step 3: Generate a patient-friendly summary using the Gemini API.
 * @param {Array<object>} normalizedTests - The array of normalized test objects.
 * @returns {Promise<object>} - The summary and explanations.
 */
async function getPatientSummary(normalizedTests) {
//   const systemPrompt = `
//     You are a helpful medical assistant. Your role is to explain medical test results in simple, easy-to-understand language for a patient.
//     - DO NOT provide a diagnosis.
//     - DO NOT use complex medical jargon.
//     - Keep explanations brief and clear.
//     - Base your summary ONLY on the provided test data.
//     - Structure your response as a JSON object with "summary" and "explanations" fields. The "explanations" should be an array of strings.
//   `;

    const systemPrompt = `
        You are a helpful medical assistant. Your role is to explain medical test results in simple, easy-to-understand language for a patient.

        Instructions:
        - DO NOT provide a diagnosis.
        - DO NOT use complex medical jargon.
        - Keep explanations brief and clear.
        - Base your output ONLY on the provided test data.
        - Structure your response as a JSON object with:
        {
            "summary": "A short overview that explicitly mentions each test name and whether it is normal, high, or low.",
            "explanations": ["A simple explanation for each test in plain language."]
        }
        - The "summary" MUST mention the test names (e.g., "Hemoglobin is high, WBC is normal, Ammonia is high").
        - The "explanations" array should include one explanation per test.
    `;
  
  const userQuery = `
    Here are the medical test results: ${JSON.stringify(normalizedTests)}.
    Please provide a simplified summary and explanation.
  `;
  
  try {
    const response = await openai.chat.completions.create({
        model: "mistral-small", // or "gpt-4o", "gpt-4", etc.
        messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userQuery }
        ],
        temperature: 0 // deterministic output
    });
    // const response = await mistral.chat.complete({
    //         model: "mistral-small", // or "gpt-4o", "gpt-4", etc.
    //         messages: [
    //         { role: "system", content: systemPrompt },
    //         { role: "user", content: userQuery }
    //         ],
    //         temperature: 0 // deterministic output
    //     });
    console.log("Mistral API Raw Summary Response:", response);

    // const text = result.candidates[0].content;
    const text = response.choices[0].message.content;
    console.log("LLM Summary Response:", text); 

    const resultJson = extractJSON(text);
    console.log("Extracted Summary JSON:", resultJson);
    
    // Step 3 (Guardrail): Check for hallucinated tests
    const llmTestNames = (resultJson.summary + " " + resultJson.explanations.join(" ")).toLowerCase();
    console.log("LLM Test Names:", llmTestNames);
    const originalTestNames = normalizedTests.map(t => {
        const name = nameMap[t.name] || t.name;
        return name.toLowerCase();
    });
    console.log("Original Test Names:", originalTestNames);
    
    for (const testName of originalTestNames) {
        if (!llmTestNames.includes(testName)) {
             return { status: "unprocessed", reason: `Hallucinated results: LLM failed to mention ${testName}` };
        }
    }

    return resultJson;

  } catch (error) {
    console.error("Error calling Gemini API for summary:", error);
    throw new Error("Failed to generate patient summary.");
  }
}


// --- API ENDPOINT ---

app.post('/api/v1/simplify-report', upload.single('reportImage'), async (req, res) => {
  try {
    let rawText = '';
    // Destructure sex from the request body for use in normalization
    const { text, sex } = req.body;

    // Check if text or image is provided
    if (text) {
      rawText = text;
    } else if (req.file) {
      rawText = await getTextFromImage(req.file.buffer, req.file.mimetype);
      console.log("Extracted OCR Text:", rawText);
    } else {
      return res.status(400).json({ error: 'Please provide either text or an image file.' });
    }

    // Step 1: Parse and correct raw text using the new AI-powered function
    const { tests_raw, confidence } = await parseAndCorrectText(rawText);
    if (tests_raw.length === 0) {
        return res.status(400).json({ status: "unprocessed", reason: "No valid test results could be extracted from the input." });
    }
    
    // Step 2: Normalize tests (now an async DB operation)
    // const { tests: normalizedTests } = await normalizeTests(tests_raw, sex);
    const result = await normalizeTests(tests_raw, sex);
    const normalizedTests = result.tests;
     if (normalizedTests.length === 0) {
        return res.status(400).json({ status: "unprocessed", reason: "Could not normalize any of the extracted tests." });
    }
    console.log("Normalized Tests:", result);

    // Step 3: Get patient-friendly summary
    const summaryData = await getPatientSummary(normalizedTests);
    console.log("Summary Data:", summaryData);
    
    // Check guardrail exit condition
    if (summaryData.status === 'unprocessed') {
        return res.status(500).json(summaryData);
    }

    // Step 4: Final Output
    const finalOutput = {
      tests: normalizedTests,
      summary: summaryData.summary,
      status: "ok"
    };

    // res.json(finalOutput);
    res.json(finalOutput)

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// --- SERVER START ---
app.listen(port, () => {
  console.log(`Medical Report Simplifier listening at http://localhost:${port}`);
});

