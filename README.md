# ScamShield

**Is this message really from Deriv?** Paste a suspicious message or drop in a screenshot, and a 3D courtroom of five reviewers judges it. Each reviewer gives a score and its reasoning, then the gavel falls. Built at Google Dev Day 2026, Sunway University.

## The council

| Seat | What it checks | How |
|---|---|---|
| Wording | Urgency, threats, odd phrasing (EN + BM) | Gemini agent |
| Links & sender | Look-alike domains, shorteners, wallets, phone numbers | Gemini agent + rule facts |
| Pressure tactics | Fear, greed, fake authority, "pay to withdraw" | Gemini agent |
| Deriv policy | Would real Deriv ever send this? | Gemini agent |
| **Inspector** (chair) | Hard rules: fake domains, OTP requests, withdrawal fees, Malay scam phrases | Deterministic rule engine (`lib/heuristics.js`) |

**Scoring:** not a plain average. `0.6 × mean + 0.4 × max` of the AI scores, blended 75/25 with the rule engine. Critical rule hits set a hard minimum score (80), so one reviewer who spots a fake link can't be outvoted.

**Screenshots:** Gemini first transcribes the image so the rule engine can check links that only appear inside images.

**Prompt-injection safe:** the message is passed as `<untrusted_message>`. Any attempt to instruct the reviewers raises the score.

**Works offline:** if the API is unreachable, the rule engine runs in the browser and still gives a verdict.

## Run it

```bash
# Website (Vercel)
#   Environment variable: GEMINI_API_KEY   (optional: GEMINI_MODEL, default gemini-3.5-flash)
npx vercel --prod

# Local, no Vercel CLI needed
echo "GEMINI_API_KEY=your_key" > .env.local
npm run dev            # → http://localhost:3000

npm test               # rule engine + scoring tests
```

> Note: `gemini-2.0-flash` was shut down on 1 June 2026. The app falls back through `gemini-3.5-flash` → `gemini-flash-latest` → `gemini-2.5-flash` automatically.

## Chrome extension

1. `npm run build:ext` (the built `extension/` folder is already committed)
2. Go to `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose `extension/`
3. Click the icon, open **Settings**, and paste a Gemini API key (stored only in your browser) *or* your Vercel URL

Then:
- **Right-click selected text** → *Check "…" with ScamShield*
- **Right-click anywhere on a page** → *Scan what's on screen* (captures WhatsApp Web, Gmail, Telegram Web…)

## Layout

```
index.html, style.css, app.js   UI (shared by website and extension)
scene3d.js                       Three.js courtroom + reviewers
lib/heuristics.js                rule engine, scoring, offline report
lib/engine.js                    Gemini pipeline (OCR → 4 agents → advisor); runs in Node or browser
api/analyse.js                   Vercel function wrapper
extension-src/                   manifest, service worker, icons
vendor/three/                    Three.js r187 (MIT), bundled because extensions can't load CDNs
```

Official domains default to `deriv.com` and its subdomains. Add more with `OFFICIAL_DOMAINS=deriv.me,deriv.be` once confirmed.
