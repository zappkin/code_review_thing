import * as vscode from 'vscode';
import { randomBytes } from 'crypto';

/** Webview shell — styles and script live in media/. */
export function panelHtml(webview: vscode.Webview, media: vscode.Uri): string {
  const nonce = randomBytes(16).toString('base64');
  const css = webview.asWebviewUri(vscode.Uri.joinPath(media, 'panel.css'));
  const js  = webview.asWebviewUri(vscode.Uri.joinPath(media, 'panel.js'));

  return /* html */ `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${css}">
</head>
<body>
<header>
  <span id="file"></span>
  <div class="header-controls">
    <div class="modes" role="group" aria-label="Explanation mode">
      <button data-mode="author"   aria-pressed="true">Author</button>
      <button data-mode="newcomer" aria-pressed="false">Newcomer</button>
    </div>
    <button id="refresh-btn" title="Refresh explanations">↺</button>
    <button id="gear-btn" title="Settings" aria-expanded="false" aria-controls="settings-panel">⚙</button>
  </div>
</header>

<div id="settings-panel" aria-hidden="true">
  <div class="settings-group">
    <div class="settings-group-title">Model</div>

    <div class="settings-row">
      <label for="s-provider">Provider</label>
      <select id="s-provider">
        <option value="openai-compat">OpenAI-compatible</option>
        <option value="anthropic">Anthropic</option>
      </select>
    </div>

    <div class="settings-row" id="s-url-row">
      <label for="s-baseurl">Base URL</label>
      <input id="s-baseurl" type="url" spellcheck="false"
             placeholder="http://localhost:11434/v1" />
    </div>

    <div class="settings-row">
      <label for="s-model">Model</label>
      <input id="s-model" type="text" spellcheck="false" placeholder="llama3" />
    </div>

    <div class="settings-row">
      <label for="s-apikey">API Key</label>
      <div class="key-row">
        <input id="s-apikey" type="password" placeholder="Paste key…" autocomplete="off" />
        <button id="s-save-key">Save</button>
        <span id="s-key-status" aria-live="polite"></span>
      </div>
    </div>
  </div>

  <div class="settings-group">
    <div class="settings-group-title">Display</div>

    <div class="settings-row">
      <label for="s-fontsize">Font size</label>
      <div class="slider-row">
        <input id="s-fontsize" type="range" min="12" max="28" step="1" />
        <span id="s-fontsize-val" class="slider-val">17px</span>
      </div>
    </div>

    <div class="settings-row">
      <label for="s-lineheight">Line height</label>
      <div class="slider-row">
        <input id="s-lineheight" type="range" min="1.2" max="2.2" step="0.1" />
        <span id="s-lineheight-val" class="slider-val">1.5</span>
      </div>
    </div>
  </div>
</div>

<div id="list"></div>
<script nonce="${nonce}" src="${js}"></script>
</body></html>`;
}
