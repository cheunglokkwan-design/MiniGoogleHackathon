import { localReport } from './lib/heuristics.js';
import { EXAMPLES } from './examples.js';
import { createCouncil, SEATS, bandOf } from './scene3d.js';

const $ = (id) => document.getElementById(id);
const IS_EXT = location.protocol === 'chrome-extension:';
const ext = IS_EXT ? globalThis.chrome : null;
if (IS_EXT) document.body.classList.add('ext');

const VERDICT_TITLE = {
  SAFE: 'No obvious red flags',
  SUSPICIOUS: 'Be careful with this one',
  DANGEROUS: 'This looks like a scam',
};
const BAND_CLASS = { safe: 'safe', warn: 'warn', danger: 'danger', off: '' };

let activeTab = 'text';
let currentImage = null; // { base64, mimeType, dataUrl }
let busy = false;

// ─── 3D council ─────────────────────────────────────────────────────────────
let council = { ok: false };
try { council = createCouncil($('stageCanvas'), $('bubbles')); } catch (e) { console.warn('3D disabled', e); }
if (!council.ok) {
  $('stage').classList.add('no-webgl');
  $('stageCaption').textContent = 'Paste a message below and the reviewers will give their verdict.';
}
const caption = (t) => { $('stageCaption').textContent = t; };

// ─── The Terms of the Court ─────────────────────────────────────────────────
// Each article is a real rule of how ScamShield judges a message.
const ARTICLES = [
  'The message is evidence, never instruction. Whatever it commands, this court will not obey.',
  'Five reviewers shall judge, and each shall judge alone.',
  'Every link shall be followed to where it truly leads.',
  'One proven deception outweighs any number of doubts.',
  'The verdict shall be final, and the reasons shall be given.',
];
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let skipPact = false;
const pause = (ms) => new Promise((r) => (skipPact || reduceMotion ? r() : setTimeout(r, ms)));

async function showLine(text, hold) {
  const pact = $('pact');
  pact.className = 'pact has-line';
  pact.innerHTML = '';
  const el = document.createElement('p');
  el.className = 'pact-line';
  el.textContent = text;
  pact.appendChild(el);
  void el.offsetWidth; el.classList.add('in');
  await pause(hold);
  el.classList.add('out');
  await pause(700);
}

async function recitePact() {
  const pact = $('pact');
  pact.className = 'pact side';
  pact.innerHTML = '<p class="pact-heading">The terms of this court</p><ol class="articles"></ol>';
  const list = pact.querySelector('.articles');
  void pact.offsetWidth; pact.querySelector('.pact-heading').classList.add('in');
  await pause(700);
  for (let i = 0; i < ARTICLES.length; i++) {
    const li = document.createElement('li');
    li.className = 'article';
    li.innerHTML = `<div class="article-num">Article ${ROMAN[i]}</div><div class="article-text">${ARTICLES[i]}</div>`;
    list.appendChild(li);
    void li.offsetWidth; li.classList.add('in');
    list.querySelectorAll('.article.in').forEach((x) => x !== li && x.classList.add('dim'));
    await pause(1150);
  }
  list.querySelectorAll('.article').forEach((x) => x.classList.remove('dim'));
  await pause(900);
}

function clearPact() {
  const pact = $('pact');
  pact.classList.add('fade');
  setTimeout(() => { pact.innerHTML = ''; pact.className = 'pact'; }, 800);
}

function enterCourt() {
  $('stage').classList.add('immersive');
  $('stage').classList.remove('verdict-shown');
  document.body.classList.add('court-open');
  $('courtActions').classList.add('hidden');
  $('enterCourtBtn').classList.add('hidden');
}
function leaveCourt(toResults) {
  skipPact = true;
  $('blackout').classList.remove('on');
  $('charter').classList.add('hidden');
  $('stage').classList.remove('immersive', 'verdict-shown');
  document.body.classList.remove('court-open', 'court-awaiting');
  $('courtActions').classList.add('hidden');
  $('exitBtn').classList.add('hidden');
  $('skipBtn').classList.add('hidden');
  $('pact').innerHTML = '';
  if (council.ok) $('enterCourtBtn').classList.remove('hidden');
  if (toResults) setTimeout(() => $('results').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  else if (council.ok && !busy) {
    $('finalCard').classList.add('hidden');
    council.reset();
    caption('The council is waiting for a message.');
  }
}

function awaitEvidence() {
  $('charter').classList.add('hidden');
  $('finalCard').classList.add('hidden');
  $('courtActions').classList.add('hidden');
  $('stage').classList.remove('verdict-shown');
  $('exitBtn').classList.remove('hidden');
  document.body.classList.add('court-awaiting');
  caption('The court awaits your evidence.');
  setTimeout(() => $('messageInput').focus({ preventScroll: true }), 300);
}

function showCharter() {
  const c = $('charter');
  c.classList.remove('hidden', 'leaving');
  c.scrollTop = 0;
  caption('');
  setTimeout(() => $('acceptCharter').focus({ preventScroll: true }), 600);
}

// Opening: the app begins inside the court
async function openCourt() {
  skipPact = false;
  enterCourt();
  $('blackout').classList.add('on');
  await pause(500);
  await showLine('You have entered the Court of ScamShield.', 1700);
  council.enterDomain();
  $('blackout').classList.remove('on');
  $('pact').innerHTML = '';
  await pause(1300);
  if (!document.body.classList.contains('court-open')) return; // left during the intro
  showCharter();
}

$('acceptCharter').addEventListener('click', () => {
  $('charter').classList.add('leaving');
  setTimeout(awaitEvidence, 650);
});
$('declineCharter').addEventListener('click', () => leaveCourt(false));
$('exitBtn').addEventListener('click', () => leaveCourt(false));
$('enterCourtBtn').addEventListener('click', async () => {
  enterCourt();
  await council.enterDomain();
  awaitEvidence();
});
// Click or key during the opening skips straight to the charter
$('stage').addEventListener('click', () => { if (!busy && $('blackout').classList.contains('on')) skipPact = true; });

/** Which article decided the case — shown under the verdict. */
function decidingArticle(report) {
  const crit = (report.rules?.hits || []).find((h) => h.severity === 'critical');
  if (crit) return `By Article IV — one proven deception: ${crit.label.toLowerCase()}.`;
  if (report.consensus.verdict === 'SAFE') return 'By Article V — no reviewer found cause for alarm, and the court finds none.';
  const top = [...(report.agents || [])].filter((a) => a.online).sort((a, b) => b.agent_score - a.agent_score)[0];
  return top ? `By Article II — the gravest concern came from ${top.name}: ${top.key_insight}` : '';
}

// ─── Input: tabs, images, examples ──────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  for (const t of ['text', 'image']) {
    $(`tab-${t}`).classList.toggle('active', t === tab);
    $(`tab-${t}`).setAttribute('aria-selected', String(t === tab));
    $(`panel-${t}`).classList.toggle('hidden', t !== tab);
  }
}
document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

const MAX_EDGE = 1600;
function loadImageFromDataUrl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL('image/jpeg', 0.88);
      currentImage = { base64: dataUrl.split(',')[1], mimeType: 'image/jpeg', dataUrl };
      $('imagePreview').src = dataUrl;
      $('imagePreview').classList.remove('hidden');
      $('dropzoneBody').classList.add('hidden');
      $('clearImage').classList.remove('hidden');
      hideError();
      switchTab('image');
      resolve();
    };
    img.onerror = () => { showError('Could not read that image. Try a PNG or JPG screenshot.'); reject(); };
    img.src = src;
  });
}
function loadImageFile(file) {
  const r = new FileReader();
  r.onload = (e) => loadImageFromDataUrl(e.target.result).catch(() => {});
  r.readAsDataURL(file);
}
function clearImage() {
  currentImage = null;
  $('imagePreview').src = '';
  $('imagePreview').classList.add('hidden');
  $('dropzoneBody').classList.remove('hidden');
  $('clearImage').classList.add('hidden');
  $('fileInput').value = '';
}
$('clearImage').addEventListener('click', clearImage);
$('fileInput').addEventListener('change', () => $('fileInput').files[0] && loadImageFile($('fileInput').files[0]));
const dz = $('dropzone');
dz.addEventListener('click', (e) => { if (!currentImage && e.target.tagName !== 'LABEL') $('fileInput').click(); });
dz.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !currentImage) $('fileInput').click(); });
dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag-over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
dz.addEventListener('drop', (e) => {
  e.preventDefault(); dz.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) loadImageFile(f);
});
document.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (!item) return;
  e.preventDefault();
  loadImageFile(item.getAsFile());
});

(function renderExamples() {
  const wrap = $('examples');
  wrap.innerHTML = '<span>Try one:</span>';
  for (const ex of EXAMPLES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'example-chip'; b.textContent = ex.label.replace(/^\S+\s/, '');
    b.addEventListener('click', () => {
      $('messageInput').value = ex.text;
      switchTab('text');
      if (council.ok) council.setEvidence({ text: ex.text });
      hideError();
    });
    wrap.appendChild(b);
  }
})();

$('messageInput').addEventListener('input', () => {
  if (council.ok && !busy) council.setEvidence({ text: $('messageInput').value.trim() });
});

function showError(msg) { $('errorText').textContent = msg; $('errorBanner').classList.remove('hidden'); }
function hideError() { $('errorBanner').classList.add('hidden'); }

// ─── Settings (extension) ───────────────────────────────────────────────────
async function getSettings() {
  if (!IS_EXT) return {};
  return ext.storage.local.get(['apiKey', 'server']);
}
if (IS_EXT) {
  $('settingsBtn').classList.remove('hidden');
  $('settingsBtn').addEventListener('click', async () => {
    const s = await getSettings();
    $('setKey').value = s.apiKey || '';
    $('setServer').value = s.server || '';
    $('settings').classList.toggle('hidden');
  });
  $('saveSettings').addEventListener('click', async () => {
    const server = $('setServer').value.trim().replace(/\/+$/, '');
    if (server) {
      try {
        const ok = await ext.permissions.request({ origins: [`${new URL(server).origin}/*`] });
        if (!ok) { $('settingsSaved').textContent = 'Permission needed to reach that server.'; return; }
      } catch { $('settingsSaved').textContent = 'That server URL doesn\'t look right.'; return; }
    }
    await ext.storage.local.set({ apiKey: $('setKey').value.trim(), server });
    $('settingsSaved').textContent = 'Saved.';
    setTimeout(() => ($('settingsSaved').textContent = ''), 1500);
  });
}

// ─── Running a check ────────────────────────────────────────────────────────
async function getReport(payload) {
  const text = payload.text || '';
  if (IS_EXT) {
    const { apiKey, server } = await getSettings();
    if (server) return fetchServer(`${server}/api/analyse`, payload, text);
    if (apiKey) {
      const { analyse } = await import('./lib/engine.js');
      return analyse({ ...payload, apiKey });
    }
    return localReport(text, payload.imageBase64
      ? 'No Gemini key set, so screenshots can\'t be read yet. Add one in Settings.'
      : 'Rules-only check. Add a Gemini key in Settings to hear from the AI reviewers.');
  }
  return fetchServer('/api/analyse', payload, text);
}

async function fetchServer(url, payload, text) {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Server error ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn('Server unavailable, falling back to local rules', e);
    if (!text) throw new Error('The server is unreachable, and screenshots need the server. Paste the text instead.');
    return localReport(text, 'Couldn\'t reach the server, so this is a rules-only check done in your browser.');
  }
}

function speechesFrom(report) {
  const bySeat = [];
  const agentFor = (name) => report.agents.find((a) => a.name === name);
  SEATS.forEach((seat, i) => {
    if (seat.key === 'Inspector') {
      const hits = report.rules?.hits || [];
      const text = hits.length
        ? `${hits.length} rule${hits.length > 1 ? 's' : ''} tripped. Worst: ${hits[0].label.toLowerCase()}.`
        : 'Every link and pattern check came back clean.';
      bySeat.push({ seatIndex: i, score: report.rules?.score ?? 0, text });
    } else {
      const a = agentFor(seat.key);
      if (!a || !a.online) bySeat.push({ seatIndex: i, score: null, text: 'I couldn\'t review this one, so I\'m sitting it out.' });
      else bySeat.push({ seatIndex: i, score: a.agent_score, text: a.key_insight });
    }
  });
  return bySeat;
}

async function check() {
  if (busy) return;
  const text = $('messageInput').value.trim();
  if (activeTab === 'text' && !text) return showError('Paste a message first, or pick one of the examples.');
  if (activeTab === 'image' && !currentImage) return showError('Add a screenshot first.');
  hideError();
  busy = true;
  $('analyseBtn').disabled = true;
  $('results').classList.add('hidden');
  $('finalCard').classList.add('hidden');

  const payload = activeTab === 'image'
    ? { text: '', imageBase64: currentImage.base64, mimeType: currentImage.mimeType }
    : { text };

  const reportPromise = Promise.all([
    getReport(payload),
    new Promise((r) => setTimeout(r, council.ok ? 2600 : 0)),
  ]).then(([r]) => r);
  reportPromise.catch(() => {});

  let ceremony = Promise.resolve();
  if (council.ok) {
    skipPact = false;
    council.setEvidence(activeTab === 'image' ? { imageUrl: currentImage.dataUrl } : { text });
    const alreadyInside = document.body.classList.contains('court-open');
    document.body.classList.remove('court-awaiting');
    $('exitBtn').classList.add('hidden');
    enterCourt();
    $('skipBtn').classList.remove('hidden');
    caption('');
    ceremony = (async () => {
      if (!alreadyInside) $('blackout').classList.add('on');
      await pause(alreadyInside ? 200 : 600);
      await showLine(alreadyInside ? 'The evidence is entered.' : 'A message has been brought before the court.', 1400);
      council.judge();
      $('blackout').classList.remove('on');
      await showLine('The court is now in session.', 1300);
      caption('The reviewers are studying the evidence…');
      await recitePact();
    })();
  } else {
    caption('Checking the message…');
  }

  let report;
  try {
    [report] = await Promise.all([reportPromise, ceremony]);
  } catch (e) {
    busy = false; $('analyseBtn').disabled = false;
    $('skipBtn').classList.add('hidden');
    clearPact();
    if (council.ok) { council.reset({ keepDomain: true }); awaitEvidence(); }
    else caption('The council is waiting for a message.');
    return showError(e.message);
  }
  clearPact();

  const final = {
    score: report.consensus.final_score,
    verdict: report.consensus.verdict,
    title: VERDICT_TITLE[report.consensus.verdict] || report.consensus.verdict,
  };

  if (council.ok) {
    await council.reveal(speechesFrom(report), final, caption);
    $('skipBtn').classList.add('hidden');
    $('finalTitle').textContent = final.title;
    $('finalTitle').style.color = `var(--${BAND_CLASS[bandOf(final.score)] || 'ink'})`;
    $('finalScore').textContent = final.score;
    $('finalArticle').textContent = decidingArticle(report);
    $('finalCard').classList.remove('hidden');
    $('stage').classList.add('verdict-shown');
    $('courtActions').classList.remove('hidden');
    caption('The court has spoken.');
  }
  if (!council.ok) caption(`${final.title} — see the details below.`);
  renderResults(report);
  busy = false;
  $('analyseBtn').disabled = false;
}

$('analyseBtn').addEventListener('click', check);
$('skipBtn').addEventListener('click', () => { skipPact = true; if (council.ok) council.skip(); });
$('hearBtn').addEventListener('click', () => leaveCourt(true));
$('leaveBtn').addEventListener('click', () => leaveCourt(false));
$('newEvidenceBtn').addEventListener('click', () => {
  $('messageInput').value = ''; clearImage(); switchTab('text');
  council.reset({ keepDomain: true });
  $('results').classList.add('hidden');
  awaitEvidence();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || busy || !$('stage').classList.contains('immersive')) return;
  leaveCourt(!$('courtActions').classList.contains('hidden'));
});
document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') check(); });
$('resetBtn').addEventListener('click', () => {
  $('results').classList.add('hidden');
  $('finalCard').classList.add('hidden');
  $('messageInput').value = '';
  clearImage(); switchTab('text');
  window.scrollTo({ top: 0 });
  if (council.ok) { council.reset({ keepDomain: true }); enterCourt(); council.enterDomain().then(awaitEvidence); }
  else caption('The council is waiting for a message.');
});

// ─── Plain results ──────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LINK_TAG = {
  official: ['good', 'Official Deriv'], lookalike: ['bad', 'Fake look-alike'], ip: ['bad', 'Raw IP address'],
  shortener: ['meh', 'Hidden destination'], messaging: ['meh', 'Off-platform chat'], unknown: ['meh', 'Not Deriv'],
};

function renderResults(r) {
  const { consensus, advice, rules, ocr, meta } = r;
  const band = bandOf(consensus.final_score);

  $('noticeBanner').classList.toggle('hidden', !meta?.notice);
  $('noticeBanner').textContent = meta?.notice || '';
  $('modelTag').textContent = meta?.model ? ` (${meta.model}, ${(meta.ms / 1000).toFixed(1)}s)` : '';

  $('verdict').className = `verdict ${BAND_CLASS[band]}`;
  $('verdictText').textContent = VERDICT_TITLE[consensus.verdict] || consensus.verdict;
  $('riskNum').textContent = consensus.final_score;
  $('meterFill').style.width = '0';
  requestAnimationFrame(() => ($('meterFill').style.width = consensus.final_score + '%'));
  $('consensusSummary').textContent = advice.summary || '';

  $('actionsList').innerHTML = (advice.immediate_actions || []).map((a) => `<li>${esc(a)}</li>`).join('');

  $('ruleScore').textContent = rules ? `rules score ${rules.score}/100` : '';
  if (ocr?.text) {
    $('ocrBox').innerHTML = `Read from your screenshot${ocr.channel ? ` (${esc(ocr.channel)})` : ''}${ocr.sender ? `, sent by <strong>${esc(ocr.sender)}</strong>` : ''}:<pre>${esc(ocr.text)}</pre>`;
    $('ocrBox').classList.remove('hidden');
  } else $('ocrBox').classList.add('hidden');

  const rows = [
    ...(rules?.links || []).map((l) => ({ v: l.host, s: l.status, why: l.reason })),
    ...(rules?.emails || []).map((e) => ({ v: e.email, s: e.official ? 'official' : e.status === 'lookalike' ? 'lookalike' : 'unknown', why: e.official ? 'Official @deriv.com address' : 'Not an official Deriv email address' })),
  ];
  $('linksList').innerHTML = rows.length
    ? rows.map(({ v, s, why }) => { const [c, t] = LINK_TAG[s] || LINK_TAG.unknown; return `<tr><td><code>${esc(v)}</code></td><td><span class="tag ${c}">${t}</span></td><td class="why">${esc(why)}</td></tr>`; }).join('')
    : '<tr><td class="why">No links or email addresses in the message.</td></tr>';

  $('hitsList').innerHTML = (rules?.hits || []).length
    ? rules.hits.map((h) => `<li class="hit ${esc(h.severity)}"><span class="sev">${esc(h.severity)}</span><div><div>${esc(h.label)}</div><div class="hit-evidence">${esc(h.evidence)}</div></div></li>`).join('')
    : '<li class="hit none"><span class="sev">clear</span><div>No known scam patterns matched.</div></li>';

  const seatColor = Object.fromEntries(SEATS.map((s) => [s.key, s.color]));
  $('reviewsBlock').classList.toggle('hidden', !r.agents?.length);
  $('agentsGrid').innerHTML = (r.agents || []).map((a) => `
    <div class="review ${a.online ? '' : 'offline'}">
      <span class="dot" style="background:${seatColor[a.name] || '#aaa'}"></span>
      <div><div class="review-name">${esc(a.name)}</div><div class="review-spec">${esc(a.specialty)}</div></div>
      <div class="review-score" style="color:var(--${BAND_CLASS[bandOf(a.agent_score)] || 'ink-3'})">${a.agent_score ?? '–'}</div>
      <details><summary>${esc(a.key_insight)}</summary><ul>${(a.findings || []).map((f) => `<li>${esc(f)}</li>`).join('')}</ul></details>
    </div>`).join('');

  $('neverList').innerHTML = (advice.what_deriv_never_does || []).map((n) => `<li>${esc(n.replace(/^Deriv will never\s*/i, ''))}</li>`).join('');
  $('verifyText').textContent = advice.how_to_verify || '';

  $('results').classList.remove('hidden');
}

// ─── Hand-off from the extension (context menu / page capture) ─────────────
(async function start() {
  const pending = IS_EXT && ext.storage?.session ? (await ext.storage.session.get('pending')).pending : null;
  if (!pending) {
    if (council.ok) openCourt();
    return;
  }
  await ext.storage.session.remove('pending');
  if (pending.imageDataUrl) await loadImageFromDataUrl(pending.imageDataUrl);
  else if (pending.text) { $('messageInput').value = pending.text; switchTab('text'); }
  setTimeout(check, 400);
})();
