import * as vscode from 'vscode';

type ProvideReferencesFn = (
  document: vscode.TextDocument,
  position: vscode.Position,
  options: { includeDeclaration: boolean },
  token: vscode.CancellationToken
) => vscode.ProviderResult<vscode.Location[]>;

export function registerReferenceProvider(context: vscode.ExtensionContext, provideReferences: ProvideReferencesFn) {
  const provider = vscode.languages.registerReferenceProvider({ language: 'azsl' }, { provideReferences });
  context.subscriptions.push(provider);
}
