import * as vscode from 'vscode';

export const configKeys = {
  gemPath: 'azsl.gemPath',
  debugShowOutputOnActivate: 'azsl.debug.showOutputOnActivate',
  debugLogToConsole: 'azsl.debug.logToConsole',
  debugTraceCodeActions: 'azsl.debug.traceCodeActions'
} as const;

function getAzslConfig() {
  return vscode.workspace.getConfiguration('azsl');
}

export async function setGemPathGlobal(value: string): Promise<void> {
  await getAzslConfig().update('gemPath', value, vscode.ConfigurationTarget.Global);
}

export function getGemPath(defaultValue = 'D:\\O3DE\\Gems\\Atom'): string {
  try {
    return getAzslConfig().get<string>('gemPath', defaultValue);
  } catch {
    return defaultValue;
  }
}

export function getDebugShowOutputOnActivate(defaultValue = false): boolean {
  try {
    return getAzslConfig().get<boolean>('debug.showOutputOnActivate', defaultValue);
  } catch {
    return defaultValue;
  }
}

export function getDebugLogToConsole(defaultValue = false): boolean {
  try {
    return getAzslConfig().get<boolean>('debug.logToConsole', defaultValue);
  } catch {
    return defaultValue;
  }
}

export function getDebugTraceCodeActions(defaultValue = false): boolean {
  try {
    return getAzslConfig().get<boolean>('debug.traceCodeActions', defaultValue);
  } catch {
    return defaultValue;
  }
}
