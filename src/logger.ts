import * as vscode from 'vscode';

let debugChannel: vscode.OutputChannel | null = null;
let logToConsole = false;

export function ensureDebugChannel(): vscode.OutputChannel {
  if (!debugChannel) {
    debugChannel = vscode.window.createOutputChannel('AZSL Debug');
  }
  return debugChannel;
}

export function setLogToConsole(enabled: boolean) {
  logToConsole = enabled;
}

export function showDebugChannel(preserveFocus = true) {
  try {
    ensureDebugChannel().show(preserveFocus);
  } catch {
  }
}

export function debugLog(message: string) {
  const timestamp = new Date().toLocaleTimeString();
  ensureDebugChannel().appendLine(`[${timestamp}] ${message}`);
  if (logToConsole) {
    console.log(message);
  }
}
