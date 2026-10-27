import * as vscode from 'vscode';

export type Provider = 'openai-compat' | 'anthropic';

export interface LlmConfig {
  provider: Provider;
  baseUrl: string;
  model: string;
  liveMode: boolean;
  refreshOnSave: boolean;
}

export function getConfig(): LlmConfig {
  const c = vscode.workspace.getConfiguration('codeLyrics');
  return {
    provider:      c.get<Provider>('provider', 'openai-compat'),
    baseUrl:       c.get('baseUrl', 'http://localhost:11434/v1'),
    model:         c.get('model', 'llama3'),
    liveMode:      c.get('liveMode', false),
    refreshOnSave: c.get('refreshOnSave', true),
  };
}

export async function getApiKey(secrets: vscode.SecretStorage, provider: Provider): Promise<string> {
  return (await secrets.get(`codeLyrics.apiKey.${provider}`)) ?? '';
}

export async function promptSetApiKey(secrets: vscode.SecretStorage): Promise<void> {
  const { provider } = getConfig();
  const key = await vscode.window.showInputBox({
    prompt: `Paste your API key for "${provider}"`,
    password: true,
    ignoreFocusOut: true,
  });
  if (key === undefined) return; // user cancelled
  await secrets.store(`codeLyrics.apiKey.${provider}`, key);
  vscode.window.showInformationMessage(`Code Lyrics: API key saved for "${provider}".`);
}
