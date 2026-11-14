# ScamShield 🛡️
> AI-powered suspicious message detector for Deriv customers — built at Google Dev Day 2026, Sunway University Malaysia.

## What It Does
A multi-agent AI panel that analyses messages claiming to be from Deriv support and determines if they are scams.

**4 specialized AI agents run in parallel:**
- 🔍 **Linguistic Analyst** — urgency language & manipulation patterns
- 🔗 **Technical Inspector** — suspicious links, domains, typosquatting
- 🧠 **Psychological Profiler** — social engineering tactics
- 🏢 **Brand Authenticator** — Deriv channel & communication legitimacy

Each agent scores the message 0–100. The **consensus score** is the average. A synthesiser agent then generates clear action steps.

## Stack
- **Frontend**: HTML + Vanilla CSS + JS (no framework)
- **AI**: Google Gemini 2.0 Flash (multimodal — handles text & screenshots)
- **Backend**: Vercel Serverless Function (`/api/analyse.js`)
- **Hosting**: Vercel

## Setup

### 1. Clone & Deploy to Vercel
```bash
git clone <this-repo>
cd MiniGoogleHackathon
npx vercel --prod
```

### 2. Add Environment Variable
In Vercel Dashboard → Project → Settings → Environment Variables:
```
GEMINI_API_KEY = your_gemini_api_key_here
```

### 3. Redeploy
```bash
npx vercel --prod
```

The API key is **never exposed to the browser** — all Gemini calls happen server-side in the Vercel function.

## Local Development
```bash
npx vercel dev
```
Add a `.env.local` file with:
```
GEMINI_API_KEY=your_key_here
```
