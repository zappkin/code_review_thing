// @ts-check
const vscode = acquireVsCodeApi();

// Elements
const list = /** @type {HTMLElement} */ (document.getElementById('list'));
const fileEl = /** @type {HTMLElement} */ (document.getElementById('file'));
const gearBtn = /** @type {HTMLButtonElement} */ (document.getElementById('gear-btn'));
const settingsPanel = /** @type {HTMLElement} */ (document.getElementById('settings-panel'));
const refreshBtn = /** @type {HTMLButtonElement} */ (document.getElementById('refresh-btn'));

// Settings Elements
const providerSelect = /** @type {HTMLSelectElement} */ (document.getElementById('s-provider'));
const baseUrlInput = /** @type {HTMLInputElement} */ (document.getElementById('s-baseurl'));
const urlRow = /** @type {HTMLElement} */ (document.getElementById('s-url-row'));
const modelInput = /** @type {HTMLInputElement} */ (document.getElementById('s-model'));
const apiKeyInput = /** @type {HTMLInputElement} */ (document.getElementById('s-apikey'));
const saveKeyBtn = /** @type {HTMLButtonElement} */ (document.getElementById('s-save-key'));
const keyStatus = /** @type {HTMLElement} */ (document.getElementById('s-key-status'));
const fontSizeInput = /** @type {HTMLInputElement} */ (document.getElementById('s-fontsize'));
const fontSizeVal = /** @type {HTMLElement} */ (document.getElementById('s-fontsize-val'));
const lineHeightInput = /** @type {HTMLInputElement} */ (document.getElementById('s-lineheight'));
const lineHeightVal = /** @type {HTMLElement} */ (document.getElementById('s-lineheight-val'));

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** @type {HTMLElement[]} */
let rows = [];
let pauseUntil = 0;

// State tracking for local storage/preferences
const PREFS_KEY = 'codelyrics_display_prefs';
let displayPrefs = {
  fontSize: 17,
  lineHeight: 1.5
};

// Load saved display preferences
try {
  const saved = localStorage.getItem(PREFS_KEY);
  if (saved) {
    displayPrefs = Object.assign(displayPrefs, JSON.parse(saved));
  }
} catch {
  // Ignore localStorage errors
}

applyDisplayPrefs();

// ---------------------------------------------------------------------------
// Settings Panel Logic & Events
// ---------------------------------------------------------------------------

gearBtn?.addEventListener('click', () => {
  const isHidden = settingsPanel.getAttribute('aria-hidden') === 'true';
  const next = !isHidden;
  settingsPanel.setAttribute('aria-hidden', String(next));
  gearBtn.setAttribute('aria-expanded', String(!next));
});

providerSelect?.addEventListener('change', () => {
  const provider = providerSelect.value;
  urlRow.style.display = provider === 'anthropic' ? 'none' : 'grid';
  vscode.postMessage({
    type: 'updateConfig',
    key: 'provider',
    value: provider
  });
});

baseUrlInput?.addEventListener('change', () => {
  vscode.postMessage({
    type: 'updateConfig',
    key: 'baseUrl',
    value: baseUrlInput.value.trim()
  });
});

modelInput?.addEventListener('change', () => {
  vscode.postMessage({
    type: 'updateConfig',
    key: 'model',
    value: modelInput.value.trim()
  });
});

saveKeyBtn?.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;
  vscode.postMessage({
    type: 'setApiKey',
    provider: providerSelect.value,
    apiKey: key
  });
  apiKeyInput.value = '';
});

// Font size slider
fontSizeInput?.addEventListener('input', () => {
  displayPrefs.fontSize = Number(fontSizeInput.value);
  applyDisplayPrefs();
  saveDisplayPrefs();
});

// Line height slider
lineHeightInput?.addEventListener('input', () => {
  displayPrefs.lineHeight = Number(lineHeightInput.value);
  applyDisplayPrefs();
  saveDisplayPrefs();
});

function applyDisplayPrefs() {
  document.documentElement.style.setProperty('--font-size', `${displayPrefs.fontSize}px`);
  document.documentElement.style.setProperty('--line-height', String(displayPrefs.lineHeight));
  if (fontSizeInput) fontSizeInput.value = String(displayPrefs.fontSize);
  if (fontSizeVal) fontSizeVal.textContent = `${displayPrefs.fontSize}px`;
  if (lineHeightInput) lineHeightInput.value = String(displayPrefs.lineHeight);
  if (lineHeightVal) lineHeightVal.textContent = String(displayPrefs.lineHeight);
}

function saveDisplayPrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(displayPrefs));
  } catch {
    // Ignore localStorage errors
  }
}

// ---------------------------------------------------------------------------
// Outgoing messages
// ---------------------------------------------------------------------------

document.querySelectorAll('[data-mode]').forEach(b =>
  b.addEventListener('click', () =>
    vscode.postMessage({ type: 'mode', mode: /** @type {HTMLElement} */ (b).dataset.mode })));

refreshBtn?.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));

['wheel', 'touchstart'].forEach(ev =>
  addEventListener(ev, () => { pauseUntil = Date.now() + 3000; }, { passive: true }));

// ---------------------------------------------------------------------------
// Incoming messages
// ---------------------------------------------------------------------------

addEventListener('message', ({ data }) => {
  switch (data.type) {
    case 'initSettings': initSettings(data.config); break;
    case 'keySaved':     handleKeySaved(data);      break;
    case 'chunks':       render(data);              break;
    case 'active':       setActive(data.index);     break;
    case 'update':       updateRow(data);           break;
    case 'stale':        markStale(data.index);     break;
    case 'skip':         showNotice(data.reason);   break;
  }
});

function initSettings(config) {
  if (!config) return;
  if (providerSelect) providerSelect.value = config.provider || 'openai-compat';
  if (baseUrlInput) baseUrlInput.value = config.baseUrl || '';
  if (modelInput) modelInput.value = config.model || '';
  if (urlRow) urlRow.style.display = config.provider === 'anthropic' ? 'none' : 'grid';
  if (keyStatus) {
    keyStatus.textContent = config.hasKey ? '✓ Saved' : 'No key';
    keyStatus.className = config.hasKey ? 'ok' : '';
  }
}

function handleKeySaved({ success, error }) {
  if (keyStatus) {
    keyStatus.textContent = success ? '✓ Saved' : 'Failed';
    keyStatus.className = success ? 'ok' : 'err';
    setTimeout(() => {
      keyStatus.textContent = success ? '✓ Saved' : '';
    }, 3000);
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(d) {
  fileEl.textContent = d.file;
  document.querySelectorAll('[data-mode]').forEach(b =>
    b.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (b).dataset.mode === d.mode)));

  list.textContent = '';
  rows = d.items.map(it => makeRow(it));
  if (!rows.length) showNotice('Nothing to explain in this file yet.');
}

function makeRow(it) {
  const row = document.createElement('div');
  row.className = 'row' + (it.stale ? ' stale' : '');
  row.tabIndex = 0;

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = (it.name ? it.name + ', ' : '') + `lines ${it.start}–${it.end}`;

  const text = document.createElement('div');
  text.className = 'text';
  text.textContent = it.text;

  row.append(meta, text);

  if (it.error) {
    const err = document.createElement('div');
    err.className = 'error-msg';
    err.textContent = it.error;
    row.append(err);
  }

  const go = () => vscode.postMessage({ type: 'reveal', line: it.start - 1 });
  row.addEventListener('click', go);
  row.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });

  list.append(row);
  return row;
}

// ---------------------------------------------------------------------------
// Incremental updates (LLM results arrive after initial render)
// ---------------------------------------------------------------------------

function updateRow({ index, text, stale, error }) {
  const row = rows[index];
  if (!row) return;

  row.classList.toggle('stale', !!stale);

  const textEl = row.querySelector('.text');
  if (textEl) textEl.textContent = text;

  const existing = row.querySelector('.error-msg');
  if (error) {
    if (existing) {
      existing.textContent = error;
    } else {
      const err = document.createElement('div');
      err.className = 'error-msg';
      err.textContent = error;
      row.append(err);
    }
  } else {
    existing?.remove();
  }
}

function markStale(index) {
  rows[index]?.classList.add('stale');
}

function showNotice(message) {
  list.innerHTML = `<div id="notice">${message}</div>`;
  rows = [];
}

// ---------------------------------------------------------------------------
// Active / scroll sync
// ---------------------------------------------------------------------------

function setActive(i) {
  rows.forEach((r, j) => {
    r.style.setProperty('--d', String(Math.min(Math.abs(j - i), 4)));
    r.classList.toggle('active', j === i);
  });
  if (rows[i] && Date.now() > pauseUntil) {
    rows[i].scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  }
}

// ---------------------------------------------------------------------------
// Handshake
// ---------------------------------------------------------------------------

vscode.postMessage({ type: 'ready' });
