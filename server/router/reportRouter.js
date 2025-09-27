import express from 'express';
import multer from 'multer';
import { parseDriver } from '../processor/parseProcessor.js';
import { normalizeDriver } from '../processor/normalizeProcessor.js';
import { summaryDriver, simplifyMedicalReport } from '../processor/summaryProcessor.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/api/v1/extract-text', upload.single('reportImage'), async (req, res) => {
    try {
        const parseResult = await parseDriver(req);
        if (parseResult.status === 'unprocessed') {
            return res.status(400).json(parseResult);
        }
        res.json(parseResult);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/api/v1/normalize-tests', upload.single('reportImage'), async (req, res) => {
    try {
        const normalizeResult = await normalizeDriver(req);
        if (normalizeResult.status === 'unprocessed') {
            return res.status(400).json(normalizeResult);
        }
        res.json(normalizeResult);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/api/v1/simple-summary', upload.single('reportImage'), async (req, res) => {
    try {
        const summaryResult = await summaryDriver(req);
        if (summaryResult.status === 'unprocessed') {
            return res.status(400).json(summaryResult);
        }
        res.json(summaryResult);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


router.post('/api/v1/simplify-report', upload.single('reportImage'), async (req, res) => {
  try {
    const finalOutput = await simplifyMedicalReport(req);
    if (finalOutput.status === 'unprocessed') {
        return res.status(400).json(finalOutput);
    }
    res.json(finalOutput);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;