export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'Server configuration error: missing API key' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid request body' }); }
  }

  const { text, imageBase64, mimeType } = body || {};
  if (!text && !imageBase64) return res.status(400).json({ error: 'Please provide a message or image' });

  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

  function buildParts(agentPrompt) {
    const parts = [];
    if (text) {
      parts.push({ text: `${agentPrompt}\n\nMESSAGE TO ANALYSE:\n"${text}"` });
    }
    if (imageBase64) {
      parts.push({ text: `${agentPrompt}\n\nSCREENSHOT TO ANALYSE (read all visible text, examine all visual elements):` });
      parts.push({ inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } });
    }
    return parts;
  }

  function parseJSON(rawText) {
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    try { return JSON.parse(cleaned); } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) { try { return JSON.parse(match[0]); } catch { return null; } }
      return null;
    }
  }

  async function callAgent(systemText, agentPrompt) {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemText }] },
        contents: [{ role: 'user', parts: buildParts(agentPrompt) }],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 512,
        }
      })
    });
    if (!response.ok) throw new Error(`Agent call failed: ${response.status}`);
    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    return parseJSON(rawText);
  }

  // ─── 4 Specialized Agents ───────────────────────────────────────────────────

  const AGENTS = [
    {
      name: 'Linguistic Analyst',
      icon: '🔍',
      specialty: 'Language & urgency patterns',
      system: `You are a linguistic expert specialising in manipulation detection in financial fraud messages. You analyse language patterns, urgency cues, emotional manipulation, and grammatical inconsistencies that indicate scam communications. Respond ONLY with valid JSON — no markdown, no extra text.`,
      prompt: `Analyse this message/image for linguistic red flags. Focus on: urgency words ("immediately", "24 hours", "suspended", "urgent"), threatening tone, emotional pressure, unnatural phrasing, grammar errors, and manipulation language.

Respond ONLY with this exact JSON (no markdown):
{
  "agent_score": <integer 0-100, where 0=completely safe, 100=definitely a scam>,
  "findings": [<array of 2-4 specific red flags found, or positive notes if safe>],
  "key_insight": "<one clear sentence about the most important linguistic finding>"
}`
    },
    {
      name: 'Technical Inspector',
      icon: '🔗',
      specialty: 'Links, domains & technical signals',
      system: `You are a cybersecurity technical analyst specialising in phishing URL detection and domain spoofing. You know that Deriv's ONLY official domain is deriv.com and official emails only come from @deriv.com or @info.deriv.com. Any other domain claiming to be Deriv is fraudulent. Respond ONLY with valid JSON — no markdown, no extra text.`,
      prompt: `Analyse this message/image for technical red flags. Focus on: suspicious URLs or domains (non-deriv.com domains, typosquatting like deriv-secure.net or derriv.com), suspicious phone numbers claiming to be Deriv, APK download links, QR codes, email address spoofing, and shortened/masked URLs.

Respond ONLY with this exact JSON (no markdown):
{
  "agent_score": <integer 0-100, where 0=completely safe, 100=definitely a scam>,
  "findings": [<array of 2-4 specific technical red flags found, or positive notes if safe>],
  "key_insight": "<one clear sentence about the most important technical finding>"
}`
    },
    {
      name: 'Psychological Profiler',
      icon: '🧠',
      specialty: 'Social engineering tactics',
      system: `You are a behavioural psychologist specialising in social engineering tactics used in financial fraud. You identify psychological manipulation techniques: authority exploitation, fear triggers, false scarcity, reciprocity manipulation, and trust exploitation commonly used by scammers targeting trading platform users. Respond ONLY with valid JSON — no markdown, no extra text.`,
      prompt: `Analyse this message/image for social engineering and psychological manipulation tactics. Focus on: false authority ("I am from Deriv security team"), fear triggers (account suspended, funds frozen), artificial urgency, false trust building (using real Deriv branding to seem legitimate), and pressure to act without thinking.

Respond ONLY with this exact JSON (no markdown):
{
  "agent_score": <integer 0-100, where 0=completely safe, 100=definitely a scam>,
  "findings": [<array of 2-4 specific psychological tactics found, or positive notes if safe>],
  "key_insight": "<one clear sentence about the most important psychological manipulation found>"
}`
    },
    {
      name: 'Brand Authenticator',
      icon: '🏢',
      specialty: 'Deriv brand & channel legitimacy',
      system: `You are a Deriv brand authenticity expert. You know exactly how legitimate Deriv communications look and behave. Critical facts: Real Deriv NEVER contacts customers via WhatsApp, Telegram, or social media DMs. Real Deriv NEVER asks for passwords, OTPs, or PINs. Real Deriv NEVER asks customers to pay fees to unlock withdrawals or access funds. Real Deriv customer support is ONLY accessible via live chat directly on deriv.com. Official emails come ONLY from @deriv.com or @info.deriv.com. Respond ONLY with valid JSON — no markdown, no extra text.`,
      prompt: `Analyse whether this message/image matches legitimate Deriv brand communication patterns. Focus on: communication channel legitimacy (is "Deriv" contacting via WhatsApp/Telegram?), policy violations (asking for OTP, password, or fees), brand impersonation indicators, logo/branding misuse, and overall channel authenticity.

Respond ONLY with this exact JSON (no markdown):
{
  "agent_score": <integer 0-100, where 0=completely safe, 100=definitely a scam>,
  "findings": [<array of 2-4 specific brand authenticity findings>],
  "key_insight": "<one clear sentence about whether this matches real Deriv communication>"
}`
    }
  ];

  // ─── Run all 4 agents in parallel ──────────────────────────────────────────

  const fallback = (i) => ({
    agent_score: 50,
    findings: ['Analysis could not be completed for this agent'],
    key_insight: 'Inconclusive — treat with caution'
  });

  const agentResults = await Promise.all(
    AGENTS.map((agent, i) =>
      callAgent(agent.system, agent.prompt).catch(() => fallback(i))
    )
  );

  // ─── Calculate consensus (average of all agent scores) ─────────────────────

  const scores = agentResults.map(r => typeof r?.agent_score === 'number' ? r.agent_score : 50);
  const finalScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const verdict = finalScore <= 30 ? 'SAFE' : finalScore <= 60 ? 'SUSPICIOUS' : 'DANGEROUS';

  const allFindings = agentResults.flatMap(r => r?.findings || []).filter(Boolean);

  // ─── Advisor agent: synthesises all findings into action plan ───────────────

  const advisorResult = await callAgent(
    `You are a friendly, calm security advisor helping everyday Deriv trading platform customers understand if a message they received is a scam. Speak in simple, plain English. Be reassuring but direct and clear. Respond ONLY with valid JSON — no markdown, no extra text.`,
    `The ScamShield AI agent panel has finished analysing a message received by a Deriv customer.

Panel Consensus Score: ${finalScore}/100
Overall Verdict: ${verdict}
Key Findings from all agents: ${allFindings.slice(0, 8).join('; ')}

Based on this, give the customer clear and actionable advice.

Respond ONLY with this exact JSON (no markdown):
{
  "summary": "<2-3 sentence plain English explanation of what this message is and what the risk is>",
  "immediate_actions": [<array of exactly 4 short, specific action steps the customer should take RIGHT NOW>],
  "what_deriv_never_does": [<array of exactly 3 facts starting with 'Deriv will never...' that explain what real Deriv support would never do>],
  "how_to_verify": "<one clear paragraph with specific steps to verify if this is really from Deriv>"
}`
  ).catch(() => ({
    summary: `This message scores ${finalScore}/100 on our scam risk scale and is classified as ${verdict}. Exercise caution before taking any action.`,
    immediate_actions: [
      'Do not click any links in this message',
      'Do not share your password, OTP, or any account details',
      'Contact Deriv only via the official live chat at deriv.com',
      'Report this message to Deriv\'s security team'
    ],
    what_deriv_never_does: [
      'Deriv will never contact you via WhatsApp or Telegram',
      'Deriv will never ask for your password or OTP',
      'Deriv will never ask you to pay fees to access your funds'
    ],
    how_to_verify: 'Open a new browser tab and go directly to deriv.com (do not click any links). Log in and use the official live chat button to contact Deriv support and ask if the message is real.'
  }));

  return res.status(200).json({
    agents: AGENTS.map((agent, i) => ({
      name: agent.name,
      icon: agent.icon,
      specialty: agent.specialty,
      agent_score: agentResults[i]?.agent_score ?? 50,
      findings: agentResults[i]?.findings ?? [],
      key_insight: agentResults[i]?.key_insight ?? 'No insight available'
    })),
    consensus: {
      final_score: finalScore,
      verdict,
      all_findings: allFindings
    },
    advice: advisorResult
  });
}
