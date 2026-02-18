import * as vscode from 'vscode';

type ProvideFormattingEditsFn = (
  document: vscode.TextDocument,
  options: vscode.FormattingOptions,
  token: vscode.CancellationToken
) => vscode.ProviderResult<vscode.TextEdit[]>;

export function registerFormattingProvider(context: vscode.ExtensionContext, provideEdits: ProvideFormattingEditsFn) {
  const provider = vscode.languages.registerDocumentFormattingEditProvider({ language: 'azsl' }, { provideDocumentFormattingEdits: provideEdits });
  context.subscriptions.push(provider);
}
