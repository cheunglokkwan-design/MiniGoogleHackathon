// ─────────────────────────────────────────────────────────────────────────────
// ScamShield Rule Engine
// Deterministic, instant checks that run before (and alongside) the AI panel.
// LLMs are good at nuance but can be talked out of a verdict; these rules
// can't. A critical rule hit puts a floor under the final score.
// ─────────────────────────────────────────────────────────────────────────────

// Domains we treat as genuinely Deriv. Extend via env OFFICIAL_DOMAINS
// (comma-separated) once confirmed with the Deriv team.
const BASE_OFFICIAL = ['deriv.com'];

export function officialDomains() {
  const extra = (globalThis.process?.env?.OFFICIAL_DOMAINS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return [...new Set([...BASE_OFFICIAL, ...extra])];
}

const SHORTENERS = [
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'cutt.ly', 'rb.gy', 'is.gd', 's.id',
  'shorturl.at', 'tiny.cc', 'ow.ly', 'buff.ly', 'rebrand.ly', 'lnkd.in', 'shorte.st',
];

const MESSAGING_HOSTS = ['wa.me', 'whatsapp.com', 'chat.whatsapp.com', 't.me', 'telegram.me', 'telegram.org'];

const SUSPICIOUS_TLDS = ['xyz', 'top', 'click', 'link', 'info', 'online', 'site', 'live', 'vip', 'icu', 'buzz', 'cc', 'tk', 'ml', 'ga', 'cf', 'gq', 'shop', 'support'];

// ─── URL extraction ─────────────────────────────────────────────────────────

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"'()]+|(?:[a-z0-9-]+\.)+[a-z]{2,24}(?:\/[^\s<>"'()]*)?)/gi;

export function extractUrls(text) {
  if (!text) return [];
  const found = new Map();
  for (const m of text.matchAll(URL_RE)) {
    let raw = m[1].replace(/[.,;:!?)\]]+$/, '');
    // Skip email addresses: the "domain" part of user@domain.com
    const before = text[m.index - 1];
    if (before === '@') continue;
    let host;
    try {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`);
      host = u.hostname.toLowerCase().replace(/^www\./, '');
    } catch { continue; }
    // Ignore things that look like file names / version numbers
    if (/^\d+(\.\d+)+$/.test(host)) { /* IP — keep */ }
    else if (!/\.[a-z]{2,24}$/.test(host)) continue;
    if (/\.(png|jpe?g|gif|pdf|docx?|xlsx?)$/i.test(host)) continue;
    if (!found.has(raw)) found.set(raw, host);
  }
  return [...found].map(([url, host]) => ({ url, host }));
}

export function extractEmails(text) {
  if (!text) return [];
  return [...new Set((text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi) || []).map(e => e.toLowerCase()))];
}

// ─── Domain classification ──────────────────────────────────────────────────

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

// Undo common look-alike substitutions: d3riv, der1v, derív …
function deconfuse(s) {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/0/g, 'o').replace(/1|l|!/g, 'i').replace(/3/g, 'e').replace(/4|@/g, 'a').replace(/5|\$/g, 's').replace(/rn/g, 'm');
}

export function isOfficial(host, official = officialDomains()) {
  return official.some(d => host === d || host.endsWith(`.${d}`));
}

/** Returns { status: 'official'|'lookalike'|'shortener'|'messaging'|'ip'|'unknown', reason } */
export function classifyHost(host, official = officialDomains()) {
  if (isOfficial(host, official)) return { status: 'official', reason: 'Official Deriv domain' };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return { status: 'ip', reason: 'Raw IP address instead of a domain name' };
  if (host.startsWith('xn--') || host.includes('.xn--')) return { status: 'lookalike', reason: 'Punycode domain — can disguise look-alike characters' };
  if (SHORTENERS.some(s => host === s || host.endsWith(`.${s}`))) return { status: 'shortener', reason: 'Link shortener hides the real destination' };
  if (MESSAGING_HOSTS.some(s => host === s || host.endsWith(`.${s}`))) return { status: 'messaging', reason: 'Moves the conversation to WhatsApp/Telegram — Deriv support never does this' };

  const labels = host.split('.');
  const flat = deconfuse(labels.join(''));
  // "deriv" anywhere in the name, ignoring real English words like derivative/derived
  if (flat.replace(/derivativ\w*|derive[ds]?/g, '').includes('deriv')) return { status: 'lookalike', reason: `Uses "deriv" in a domain Deriv does not own (${host})` };
  for (const label of labels.slice(0, -1)) {
    const parts = deconfuse(label).split('-');
    for (const p of [deconfuse(label), ...parts]) {
      if (p.length >= 4 && p.length <= 7 && levenshtein(p, 'deriv') <= 1) {
        return { status: 'lookalike', reason: `"${label}" is a misspelling of "deriv" (typosquatting)` };
      }
    }
  }
  const tld = labels[labels.length - 1];
  if (SUSPICIOUS_TLDS.includes(tld)) return { status: 'unknown', reason: `Unrelated domain on a high-abuse .${tld} extension`, suspiciousTld: true };
  return { status: 'unknown', reason: 'Not a Deriv domain' };
}

// ─── Pattern rules (English + Bahasa Malaysia) ──────────────────────────────

const RULES = [
  {
    id: 'credential_request', severity: 'critical',
    label: 'Asks for your password, OTP, PIN or 2FA code',
    re: /\b(otp|one[- ]time (?:pass(?:word|code)|pin)|password|passcode|pin(?: number| code)?|2fa|two[- ]factor|verification code|security code|authenticator code|seed phrase|recovery phrase|private key|kata laluan|kod (?:otp|pengesahan|keselamatan))\b/i,
    // Only fire when the message is ASKING for it, not warning about it
    guard: (t) => /\b(send|share|provide|give|enter|reply|tell|forward|confirm|submit|type|key in|hantar|berikan|masukkan|kongsi)\b/i.test(t)
      && !/\b(never|don'?t|do not|jangan)\b[^.]{0,40}\b(share|send|give|provide)\b/i.test(t),
  },
  {
    id: 'fee_to_withdraw', severity: 'critical',
    label: 'Demands a fee/tax/deposit to unlock or withdraw funds',
    re: /\b(fee|tax|charge|deposit|payment|pay|clearance|unlock(?:ing)? fee|activation fee|yuran|cukai|bayar(?:an)?)\b[^.\n]{0,60}\b(withdraw|withdrawal|unlock|release|unfreeze|activate|access (?:your )?funds|payout|pengeluaran|keluarkan|aktifkan)\b|\b(withdraw|withdrawal|unlock|release|unfreeze|pengeluaran)\b[^.\n]{0,60}\b(fee|tax|charge|deposit|yuran|cukai|bayar)\b/i,
  },
  {
    id: 'off_platform_contact', severity: 'high',
    label: 'Pushes you to WhatsApp, Telegram or a personal phone number',
    re: /\b(whats\s?app|wasap|telegram|wa\.me|t\.me|signal app|wechat|line id)\b|(?:\+?6?01\d[-\s]?\d{3,4}[-\s]?\d{4})|(?:\+\d{1,3}[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4})/i,
  },
  {
    id: 'crypto_wallet', severity: 'high',
    label: 'Contains a crypto wallet address to send money to',
    re: /\b(T[1-9A-HJ-NP-Za-km-z]{33}|0x[a-fA-F0-9]{40}|bc1[a-z0-9]{25,59}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/,
  },
  {
    id: 'guaranteed_returns', severity: 'high',
    label: 'Promises guaranteed or unrealistic profits',
    re: /\b(guaranteed? (?:profit|return|income|win)|risk[- ]free|no risk|double your (?:money|deposit|investment)|\d{2,4}\s?% (?:profit|return)s? (?:daily|weekly|in \d+)|sure win|confirm(?:ed)? profit|untung (?:pasti|terjamin)|pasti untung|tanpa risiko)\b/i,
  },
  {
    id: 'account_threat', severity: 'medium',
    label: 'Threatens suspension, freezing or closure of your account',
    re: /\b(suspend(?:ed|sion)?|frozen|freeze|locked|terminat(?:e|ed|ion)|deactivat(?:e|ed|ion)|closed permanently|blacklist(?:ed)?|legal action|police report|digantung|dibekukan|disekat|ditutup|tindakan undang-undang)\b/i,
  },
  {
    id: 'urgency', severity: 'medium',
    label: 'Creates artificial urgency or a deadline',
    re: /\b(urgent(?:ly)?|immediately|right now|act now|asap|final (?:warning|notice|reminder)|last chance|within \d+\s?(?:hours?|hrs?|minutes?|mins?|days?)|expires? (?:today|soon|in)|before it'?s too late|segera|serta-merta|dalam masa \d+ ?(?:jam|minit|hari)|amaran terakhir)\b/i,
  },
  {
    id: 'remote_access', severity: 'high',
    label: 'Asks you to install remote-access or screen-sharing apps',
    re: /\b(anydesk|teamviewer|rustdesk|quick ?support|screen ?shar(?:e|ing)|remote access|install (?:this |the )?(?:app|apk)|download (?:this |the )?apk|\.apk\b)\b/i,
  },
  {
    id: 'account_manager', severity: 'medium',
    label: 'Claims to be a personal "account manager" or "agent"',
    re: /\b(account manager|personal (?:manager|agent|advisor|mentor)|vip (?:manager|agent)|trading (?:mentor|coach|signals?)|deriv (?:agent|officer|representative)|ejen deriv)\b/i,
  },
  {
    id: 'too_good_reward', severity: 'medium',
    label: 'Unexpected bonus, prize, refund or compensation',
    re: /\b(you(?:'ve| have) won|congratulations|claim your (?:bonus|reward|prize|refund)|free (?:bonus|credit|usdt|money)|compensation|refund (?:of|for) (?:usd|rm|\$)|tahniah|hadiah|bonus percuma)\b/i,
  },
];

const SEVERITY_WEIGHT = { critical: 45, high: 25, medium: 12, low: 6 };
const SEVERITY_FLOOR = { critical: 80, high: 55, medium: 0, low: 0 };

function snippet(text, idx, len) {
  const start = Math.max(0, idx - 25);
  const end = Math.min(text.length, idx + len + 25);
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '');
}

// ─── Main entry ─────────────────────────────────────────────────────────────

export function runRuleEngine(text) {
  const official = officialDomains();
  const t = String(text || '');
  const hits = [];

  for (const rule of RULES) {
    const m = t.match(rule.re);
    if (!m) continue;
    if (rule.guard && !rule.guard(t)) continue;
    hits.push({ id: rule.id, severity: rule.severity, label: rule.label, evidence: snippet(t, m.index ?? 0, m[0].length) });
  }

  const links = extractUrls(t).map(({ url, host }) => ({ url, host, ...classifyHost(host, official) }));

  const lookalikes = links.filter(l => l.status === 'lookalike' || l.status === 'ip');
  if (lookalikes.length) {
    hits.push({ id: 'lookalike_domain', severity: 'critical', label: 'Link to a fake / look-alike Deriv website', evidence: lookalikes.map(l => l.host).join(', ') });
  }
  const hidden = links.filter(l => l.status === 'shortener');
  if (hidden.length) {
    hits.push({ id: 'shortened_link', severity: 'high', label: 'Shortened link hides where it really goes', evidence: hidden.map(l => l.host).join(', ') });
  }
  const msgLinks = links.filter(l => l.status === 'messaging');
  if (msgLinks.length && !hits.some(h => h.id === 'off_platform_contact')) {
    hits.push({ id: 'off_platform_contact', severity: 'high', label: 'Pushes you to WhatsApp, Telegram or a personal phone number', evidence: msgLinks.map(l => l.host).join(', ') });
  }
  const badTld = links.filter(l => l.suspiciousTld);
  if (badTld.length) {
    hits.push({ id: 'suspicious_tld', severity: 'medium', label: 'Link on a high-abuse domain extension', evidence: badTld.map(l => l.host).join(', ') });
  }

  const emails = extractEmails(t).map(e => {
    const host = e.split('@')[1];
    return { email: e, official: isOfficial(host, official), ...classifyHost(host, official) };
  });
  const fakeSenders = emails.filter(e => !e.official && (e.status === 'lookalike' || /deriv/i.test(e.email) || /gmail|yahoo|outlook|hotmail/.test(e.email)));
  if (fakeSenders.length) {
    hits.push({ id: 'fake_sender', severity: 'high', label: 'Email address is not an official @deriv.com address', evidence: fakeSenders.map(e => e.email).join(', ') });
  }

  const raw = hits.reduce((s, h) => s + SEVERITY_WEIGHT[h.severity], 0);
  const score = Math.min(100, raw);
  const floor = hits.reduce((f, h) => Math.max(f, SEVERITY_FLOOR[h.severity]), 0);

  // Order: critical first
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  hits.sort((a, b) => order[a.severity] - order[b.severity]);

  return { score, floor, hits, links, emails, official_domains: official };
}

/** Human-readable fact sheet handed to the AI agents as grounding. */
export function factsForAgents(rules) {
  const lines = [];
  if (rules.links.length) {
    lines.push('Links found:');
    for (const l of rules.links) lines.push(`- ${l.host} → ${l.status.toUpperCase()} (${l.reason})`);
  } else lines.push('Links found: none');
  if (rules.emails.length) {
    lines.push('Email addresses found:');
    for (const e of rules.emails) lines.push(`- ${e.email} → ${e.official ? 'OFFICIAL' : 'NOT OFFICIAL'}`);
  }
  lines.push(rules.hits.length ? 'Rule hits:' : 'Rule hits: none');
  for (const h of rules.hits) lines.push(`- [${h.severity}] ${h.label}`);
  lines.push(`Official Deriv domains: ${rules.official_domains.join(', ')}`);
  return lines.join('\n');
}

// ─── Scoring ────────────────────────────────────────────────────────────────

export function verdictFor(score) {
  return score <= 30 ? 'SAFE' : score <= 60 ? 'SUSPICIOUS' : 'DANGEROUS';
}

/**
 * A plain average lets three "looks fine" agents drown out one agent that
 * spotted a fake link. Blend mean with max, mix in the rule engine, and let
 * critical rule hits set a hard floor.
 */
export function computeConsensus(agentScores, rules) {
  const ok = agentScores.filter(s => typeof s === 'number');
  let ai = null;
  if (ok.length) {
    const mean = ok.reduce((a, b) => a + b, 0) / ok.length;
    const max = Math.max(...ok);
    ai = 0.6 * mean + 0.4 * max;
  }
  let score = ai === null ? rules.score : 0.75 * ai + 0.25 * rules.score;
  score = Math.max(score, rules.floor);
  score = Math.round(Math.max(0, Math.min(100, score)));
  return { final_score: score, verdict: verdictFor(score), ai_score: ai === null ? null : Math.round(ai), rule_score: rules.score };
}

export function defaultAdvice(consensus, rules) {
  return {
    summary: consensus.verdict === 'SAFE'
      ? `No major scam signs were found (risk ${consensus.final_score}/100). Even so, only deal with account matters by logging in at deriv.com yourself.`
      : `Risk ${consensus.final_score}/100. ${rules.hits[0] ? `The biggest warning sign: ${rules.hits[0].label.toLowerCase()}.` : 'Treat this message with caution.'}`,
    immediate_actions: [
      'Do not click any links in this message',
      'Do not share your password, OTP or any account details',
      'Contact Deriv only through live chat on deriv.com',
      'Report and block the sender on the app you received it on',
    ],
    what_deriv_never_does: [
      'Deriv will never contact you on WhatsApp or Telegram',
      'Deriv will never ask for your password or OTP',
      'Deriv will never ask you to pay a fee to withdraw your money',
    ],
    how_to_verify: 'Open a new browser tab and type deriv.com yourself instead of clicking a link. Log in and use live chat to ask whether the message is genuine.',
  };
}

/** Full report built from the rule engine alone — used offline / when the API is unreachable. */
export function localReport(text, notice = 'Offline check — link and pattern rules only, no AI review.') {
  const rules = runRuleEngine(text);
  const consensus = computeConsensus([], rules);
  return {
    agents: [],
    consensus: { ...consensus, all_findings: rules.hits.map(h => h.label) },
    rules: { score: rules.score, hits: rules.hits, links: rules.links, emails: rules.emails },
    ocr: null,
    advice: defaultAdvice(consensus, rules),
    meta: { model: null, ms: 0, notice },
  };
}
