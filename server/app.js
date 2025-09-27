import express from 'express';
import dotenv from 'dotenv';

import { connectDB } from './database/db.js';
import reportRouter from './router/reportRouter.js';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware for parsing JSON and handling file uploads
app.use(express.json());
app.use('/', reportRouter);

// Connect to MongoDB on startup
connectDB().catch(console.error);

// --- SERVER START ---
app.listen(port, () => {
  console.log(`Medical Report Simplifier listening at http://localhost:${port}`);
});

