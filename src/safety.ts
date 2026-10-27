import * as vscode from 'vscode';

/** Filename/path patterns whose content must never be sent to an LLM. */
const SKIP_PATTERNS = [
  /\.env(\.|$)/i,
  /\.(pem|key|p12|pfx|cer|crt)$/i,
  /credentials?\.json$/i,
  /secrets?\.json$/i,
];

/**
 * Regex that matches common secret assignment patterns and redacts the value.
 * Matches:  API_KEY = "abc..."   token: 'xyz...'   password="..."
 */
const SECRET_RE =
  /((?:api[_-]?key|token|secret|password|passwd|pwd)\s*[:=]\s*['"]?)([A-Za-z0-9+/=_\-.]{16,})/gi;

const CONSENT_KEY = 'codeLyrics.consent';

export function shouldSkip(uri: vscode.Uri): boolean {
  return SKIP_PATTERNS.some(p => p.test(uri.fsPath));
}

export function redact(text: string): string {
  return text.replace(SECRET_RE, '$1[REDACTED]');
}

/**
 * Shows a one-time consent prompt for a given provider.
 * Returns true if the user has already consented or clicks "Allow".
 */
export async function ensureConsent(
  globalState: vscode.Memento,
  provider: string,
  baseUrl: string,
): Promise<boolean> {
  const consented: string[] = globalState.get(CONSENT_KEY, []);
  if (consented.includes(provider)) return true;

  const answer = await vscode.window.showInformationMessage(
    `Code Lyrics will send your code to "${provider}" (${baseUrl}). Allow?`,
    { modal: true },
    'Allow',
  );
  if (answer !== 'Allow') return false;

  await globalState.update(CONSENT_KEY, [...consented, provider]);
  return true;
}

export async function clearConsent(globalState: vscode.Memento): Promise<void> {
  await globalState.update(CONSENT_KEY, []);
  vscode.window.showInformationMessage('Code Lyrics: consent cleared for all providers.');
}
