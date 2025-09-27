import express from 'express';
import multer from 'multer';
import { getTextFromImage } from '../processor/ocrProcessor.js';
import { parseAndCorrectText } from '../processor/parseProcessor.js';
import { normalizeTests } from '../processor/normalizeProcessor.js';
import { getPatientSummary } from '../processor/summaryProcessor.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/api/v1/simplify-report', upload.single('reportImage'), async (req, res) => {
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

export default router;