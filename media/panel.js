// @ts-check
const vscode   = acquireVsCodeApi();
const list     = /** @type {HTMLElement} */ (document.getElementById('list'));
const fileEl   = /** @type {HTMLElement} */ (document.getElementById('file'));
const reduce   = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** @type {HTMLElement[]} */
let rows = [];
let pauseUntil = 0;

// ---------------------------------------------------------------------------
// Outgoing messages
// ---------------------------------------------------------------------------

document.querySelectorAll('[data-mode]').forEach(b =>
  b.addEventListener('click', () =>
    vscode.postMessage({ type: 'mode', mode: /** @type {HTMLElement} */ (b).dataset.mode })));

document.getElementById('refresh-btn')
  ?.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));

['wheel', 'touchstart'].forEach(ev =>
  addEventListener(ev, () => { pauseUntil = Date.now() + 3000; }, { passive: true }));

// ---------------------------------------------------------------------------
// Incoming messages
// ---------------------------------------------------------------------------

addEventListener('message', ({ data }) => {
  switch (data.type) {
    case 'chunks': render(data);               break;
    case 'active': setActive(data.index);      break;
    case 'update': updateRow(data);            break;
    case 'stale':  markStale(data.index);      break;
    case 'skip':   showNotice(data.reason);    break;
  }
});

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
    if (existing) { existing.textContent = error; }
    else {
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
  if (rows[i] && Date.now() > pauseUntil)
    rows[i].scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
}

// ---------------------------------------------------------------------------
// Handshake
// ---------------------------------------------------------------------------

vscode.postMessage({ type: 'ready' });
