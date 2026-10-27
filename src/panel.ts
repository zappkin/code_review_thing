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
  <div class="modes" role="group" aria-label="Explanation mode">
    <button data-mode="author"   aria-pressed="true">Author</button>
    <button data-mode="newcomer" aria-pressed="false">Newcomer</button>
  </div>
  <button id="refresh-btn" title="Refresh explanations">↺</button>
</header>
<div id="list"></div>
<script nonce="${nonce}" src="${js}"></script>
</body></html>`;
}
