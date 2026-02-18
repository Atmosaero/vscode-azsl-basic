import * as vscode from 'vscode';

type ProvideHoverFn = (document: vscode.TextDocument, position: vscode.Position) => vscode.ProviderResult<vscode.Hover>;

export function registerHoverProvider(context: vscode.ExtensionContext, provideHover: ProvideHoverFn) {
  const hover = vscode.languages.registerHoverProvider({ language: 'azsl' }, { provideHover });
  context.subscriptions.push(hover);
}
