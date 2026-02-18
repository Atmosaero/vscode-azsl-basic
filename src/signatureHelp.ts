import * as vscode from 'vscode';

type ProvideSignatureHelpFn = (
  document: vscode.TextDocument,
  position: vscode.Position,
  token: vscode.CancellationToken,
  context: vscode.SignatureHelpContext
) => vscode.ProviderResult<vscode.SignatureHelp>;

export function registerSignatureHelpProvider(context: vscode.ExtensionContext, provideSignatureHelp: ProvideSignatureHelpFn) {
  const provider = vscode.languages.registerSignatureHelpProvider(
    { language: 'azsl' },
    { provideSignatureHelp },
    '(',
    ','
  );
  context.subscriptions.push(provider);
}
