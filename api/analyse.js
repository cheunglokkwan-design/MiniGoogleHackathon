import { analyse } from '../lib/engine.js';

const MAX_TEXT_CHARS = 8000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid request body' }); }
  }

  const { text, imageBase64, mimeType } = body || {};
  if (!text && !imageBase64) return res.status(400).json({ error: 'Please provide a message or image' });

  try {
    const report = await analyse({
      text: typeof text === 'string' ? text.slice(0, MAX_TEXT_CHARS) : '',
      imageBase64, mimeType,
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL,
    });
    return res.status(200).json(report);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Analysis failed on the server' });
  }
}
