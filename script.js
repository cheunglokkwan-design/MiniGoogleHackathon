/* ─── State ─────────────────────────────────────────────────────────── */
let activeTab = 'text';
let currentImageData = null; // { base64, mimeType }

/* ─── Tab Switching ─────────────────────────────────────────────────── */
function switchTab(tab) {
  activeTab = tab;

  document.getElementById('tab-text').classList.toggle('active', tab === 'text');
  document.getElementById('tab-image').classList.toggle('active', tab === 'image');
  document.getElementById('panel-text').classList.toggle('hidden', tab !== 'text');
  document.getElementById('panel-image').classList.toggle('hidden', tab !== 'image');
}

/* ─── Image Upload & Drag-Drop ──────────────────────────────────────── */
const dropzone    = document.getElementById('dropzone');
const fileInput   = document.getElementById('fileInput');
const preview     = document.getElementById('imagePreview');
const dropBody    = document.getElementById('dropzoneBody');
const clearBtn    = document.getElementById('clearImage');

dropzone.addEventListener('click', (e) => {
  if (e.target === clearBtn || clearBtn.contains(e.target)) return;
  if (!currentImageData) fileInput.click();
});

dropzone.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && !currentImageData) fileInput.click();
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('drag-over');
});

dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) loadImage(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadImage(fileInput.files[0]);
});

function loadImage(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    const base64  = dataUrl.split(',')[1];       // Strip data:image/...;base64,
    currentImageData = { base64, mimeType: file.type };

    preview.src = dataUrl;
    preview.classList.remove('hidden');
    dropBody.classList.add('hidden');
    clearBtn.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function clearImage() {
  currentImageData = null;
  preview.src = '';
  preview.classList.add('hidden');
  dropBody.classList.remove('hidden');
  clearBtn.classList.add('hidden');
  fileInput.value = '';
}

/* ─── Progress Simulation ───────────────────────────────────────────── */
let progressInterval = null;

function startProgress() {
  const fill = document.getElementById('progressFill');
  const sub  = document.getElementById('loadingSub');
  let pct    = 0;

  const steps = [
    { target: 30, duration: 800,  label: 'All 4 agents deliberating in parallel…' },
    { target: 60, duration: 1200, label: 'Agents cross-referencing findings…' },
    { target: 82, duration: 1500, label: 'Advisor synthesising consensus…' },
    { target: 94, duration: 2000, label: 'Finalising verdict…' },
  ];

  let stepIdx = 0;

  progressInterval = setInterval(() => {
    const step = steps[stepIdx];
    if (!step) return;

    pct = Math.min(pct + 1, step.target);
    fill.style.width = pct + '%';
    sub.textContent   = step.label;

    if (pct >= step.target) stepIdx = Math.min(stepIdx + 1, steps.length - 1);
  }, 60);
}

function stopProgress() {
  clearInterval(progressInterval);
  document.getElementById('progressFill').style.width = '100%';
}

/* ─── UI State Helpers ──────────────────────────────────────────────── */
function showSection(id)  { document.getElementById(id).classList.remove('hidden'); }
function hideSection(id)  { document.getElementById(id).classList.add('hidden'); }
function showError(msg)   {
  document.getElementById('errorText').textContent = msg;
  showSection('errorBanner');
}
function hideError()      { hideSection('errorBanner'); }

/* ─── Main Analyse Function ─────────────────────────────────────────── */
async function analyseMessage() {
  const text = activeTab === 'text'
    ? document.getElementById('messageInput').value.trim()
    : null;

  if (activeTab === 'text' && !text) {
    showError('Please paste a message before analysing.');
    return;
  }
  if (activeTab === 'image' && !currentImageData) {
    showError('Please upload a screenshot before analysing.');
    return;
  }

  hideError();
  hideSection('results');
  hideSection('inputSection');
  showSection('loadingSection');
  startProgress();

  document.getElementById('analyseBtn').disabled = true;

  try {
    const payload = {
      text:         activeTab === 'text'  ? text : null,
      imageBase64:  activeTab === 'image' ? currentImageData.base64   : null,
      mimeType:     activeTab === 'image' ? currentImageData.mimeType : null,
    };

    const res = await fetch('/api/analyse', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `Server error ${res.status}`);
    }

    const data = await res.json();
    stopProgress();

    await new Promise(r => setTimeout(r, 400)); // Let 100% linger briefly
    hideSection('loadingSection');
    renderResults(data);

  } catch (err) {
    stopProgress();
    hideSection('loadingSection');
    showSection('inputSection');
    showError('Analysis failed: ' + err.message + '. Check your API key in Vercel env vars.');
    console.error(err);
  } finally {
    document.getElementById('analyseBtn').disabled = false;
  }
}

/* ─── Score → Colour Helper ─────────────────────────────────────────── */
function scoreColor(score) {
  if (score <= 30) return '#00d4aa';
  if (score <= 60) return '#ffaa00';
  return '#ff444f';
}

function scoreClass(score) {
  if (score <= 30) return 'safe';
  if (score <= 60) return 'warn';
  return 'danger';
}

function verdictEmoji(verdict) {
  return verdict === 'SAFE' ? '✅' : verdict === 'SUSPICIOUS' ? '⚠️' : '🚨';
}

/* ─── Animate Mini Gauge (agent cards) ─────────────────────────────── */
function animateMiniGauge(fillEl, score) {
  const circumference = 238.76; // 2π × 38
  const offset = circumference * (1 - score / 100);
  fillEl.style.stroke = scoreColor(score);
  fillEl.style.strokeDashoffset = offset;
}

/* ─── Animate Main Gauge ────────────────────────────────────────────── */
function animateMainGauge(score) {
  const circumference = 502.65; // 2π × 80
  const fill   = document.getElementById('mainGaugeFill');
  const numEl  = document.getElementById('mainGaugeScore');
  const offset = circumference * (1 - score / 100);

  fill.style.stroke           = scoreColor(score);
  fill.style.strokeDashoffset = offset;

  // Animated counter
  let current = 0;
  const start = performance.now();
  const duration = 1600;

  function tick(now) {
    const elapsed  = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 3);
    current        = Math.round(score * eased);
    numEl.textContent = current;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ─── Render Agent Cards ────────────────────────────────────────────── */
function renderAgentCards(agents) {
  const grid = document.getElementById('agentsGrid');
  grid.innerHTML = '';

  agents.forEach((agent, i) => {
    const cls  = scoreClass(agent.agent_score);
    const col  = scoreColor(agent.agent_score);

    const card = document.createElement('div');
    card.className = 'agent-card';
    card.id = `agent-card-${i}`;

    const findingsHtml = (agent.findings || []).slice(0, 3).map(f =>
      `<li>${escapeHtml(f)}</li>`
    ).join('');

    card.innerHTML = `
      <div class="agent-header">
        <div class="agent-emoji">${agent.icon}</div>
        <div class="agent-meta">
          <div class="agent-name">${escapeHtml(agent.name)}</div>
          <div class="agent-specialty">${escapeHtml(agent.specialty)}</div>
        </div>
        <div class="agent-score-pill ${cls}" id="agent-pill-${i}">—</div>
      </div>
      <div class="agent-gauge-wrap">
        <svg class="mini-gauge-svg" width="100" height="100" viewBox="0 0 100 100" aria-hidden="true">
          <circle class="mini-gauge-track" cx="50" cy="50" r="38"/>
          <circle class="mini-gauge-fill" id="agent-gauge-${i}" cx="50" cy="50" r="38"/>
        </svg>
        <div>
          <p class="agent-insight">"${escapeHtml(agent.key_insight)}"</p>
        </div>
      </div>
      <ul class="agent-findings">${findingsHtml}</ul>
    `;

    grid.appendChild(card);

    // Staggered reveal
    setTimeout(() => {
      card.classList.add('revealed');
      // Animate gauge & pill
      setTimeout(() => {
        animateMiniGauge(document.getElementById(`agent-gauge-${i}`), agent.agent_score);
        const pill = document.getElementById(`agent-pill-${i}`);
        pill.textContent = agent.agent_score;
      }, 200);
    }, i * 180);
  });
}

/* ─── Render Consensus ──────────────────────────────────────────────── */
function renderConsensus(consensus, advice) {
  const { final_score, verdict, all_findings } = consensus;
  const cls = scoreClass(final_score);

  // Verdict badge
  const badge = document.getElementById('verdictBadge');
  badge.className = `verdict-badge ${cls}`;
  document.getElementById('verdictIcon').textContent = verdictEmoji(verdict);
  document.getElementById('verdictText').textContent = verdict;

  // Summary
  document.getElementById('consensusSummary').textContent = advice.summary || '';

  // Animate main gauge (slight delay so agents reveal first)
  setTimeout(() => animateMainGauge(final_score), 400);
}

/* ─── Render Agent Mini Scores Row ─────────────────────────────────── */
function renderAgentScoresRow(agents) {
  const row = document.getElementById('agentScoresRow');
  row.innerHTML = agents.map(a => `
    <div class="agent-mini-score">
      <span class="ams-icon">${a.icon}</span>
      <span class="ams-score" style="color:${scoreColor(a.agent_score)}">${a.agent_score}</span>
      <span class="ams-label">${a.name.split(' ')[0]}</span>
    </div>
  `).join('');
}

/* ─── Render Advice ─────────────────────────────────────────────────── */
function renderAdvice(advice, allFindings) {
  // Actions
  const actionsList = document.getElementById('actionsList');
  actionsList.innerHTML = (advice.immediate_actions || []).map(a =>
    `<li>${escapeHtml(a)}</li>`
  ).join('');

  // Red Flags (deduplicated)
  const flagsList = document.getElementById('flagsList');
  const flags = [...new Set(allFindings)].slice(0, 8);
  flagsList.innerHTML = flags.length
    ? flags.map(f => `<li>${escapeHtml(f)}</li>`).join('')
    : '<li>No specific red flags detected.</li>';

  // Deriv Never Does
  const neverList = document.getElementById('neverList');
  neverList.innerHTML = (advice.what_deriv_never_does || []).map(n =>
    `<li>${escapeHtml(n)}</li>`
  ).join('');

  // How to verify
  document.getElementById('verifyText').textContent = advice.how_to_verify || '';
}

/* ─── Master Render ─────────────────────────────────────────────────── */
function renderResults(data) {
  const { agents, consensus, advice } = data;

  renderAgentCards(agents);
  renderConsensus(consensus, advice);
  renderAgentScoresRow(agents);
  renderAdvice(advice, consensus.all_findings || []);

  showSection('results');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ─── Reset ─────────────────────────────────────────────────────────── */
function resetApp() {
  hideSection('results');
  hideError();
  showSection('inputSection');

  document.getElementById('messageInput').value = '';
  clearImage();
  switchTab('text');

  document.getElementById('progressFill').style.width = '0%';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ─── XSS Protection ────────────────────────────────────────────────── */
function escapeHtml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ─── Keyboard shortcut: Ctrl+Enter to analyse ──────────────────────── */
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    const btn = document.getElementById('analyseBtn');
    if (!btn.disabled) analyseMessage();
  }
});
