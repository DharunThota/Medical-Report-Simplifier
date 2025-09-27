import { Mistral } from '@mistralai/mistralai';
import { OpenAI } from 'openai'
import dotenv from 'dotenv';

dotenv.config();

export const mistral = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY,
});

export const openai = new OpenAI({
  apiKey: process.env.MISTRAL_API_KEY,
  baseURL: 'https://api.mistral.ai/v1',
});