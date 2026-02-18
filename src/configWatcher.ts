import * as vscode from 'vscode';

type ConfigChangeHandler = (e: vscode.ConfigurationChangeEvent) => void | Promise<void>;

export function registerConfigWatcher(context: vscode.ExtensionContext, onChange: ConfigChangeHandler) {
  const cfgWatcher = vscode.workspace.onDidChangeConfiguration(e => {
    return onChange(e);
  });
  context.subscriptions.push(cfgWatcher);
}
