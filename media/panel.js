const vscode = acquireVsCodeApi();
const list = /** @type {HTMLElement} */ (document.getElementById('list'));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
/** @type {HTMLElement[]} */
let rows = [];
let pauseUntil = 0;

document.querySelectorAll('[data-mode]').forEach(b =>
  b.addEventListener('click', () => vscode.postMessage({ type: 'mode', mode: /** @type {HTMLElement} */ (b).dataset.mode })));
['wheel', 'touchstart'].forEach(ev =>
  addEventListener(ev, () => { pauseUntil = Date.now() + 3000; }, { passive: true }));

addEventListener('message', ({ data }) => {
  if (data.type === 'chunks') render(data);
  if (data.type === 'active') setActive(data.index);
});

function render(d) {
  /** @type {HTMLElement} */ (document.getElementById('file')).textContent = d.file;
  document.querySelectorAll('[data-mode]').forEach(b =>
    b.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (b).dataset.mode === d.mode)));
  list.textContent = '';
  rows = d.items.map(it => {
    const row = document.createElement('div');
    row.className = 'row'; row.tabIndex = 0;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = (it.name ? it.name + ', ' : '') + 'lines ' + it.start + '-' + it.end;
    const text = document.createElement('div');
    text.className = 'text'; text.textContent = it.text;
    row.append(meta, text);
    const go = () => vscode.postMessage({ type: 'reveal', line: it.start - 1 });
    row.addEventListener('click', go);
    row.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    list.append(row);
    return row;
  });
  if (!rows.length) list.innerHTML = '<div id="empty">Nothing to explain in this file yet.</div>';
}

function setActive(i) {
  rows.forEach((r, j) => {
    r.style.setProperty('--d', String(Math.min(Math.abs(j - i), 4)));
    r.classList.toggle('active', j === i);
  });
  if (rows[i] && Date.now() > pauseUntil)
    rows[i].scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
}

vscode.postMessage({ type: 'ready' });
