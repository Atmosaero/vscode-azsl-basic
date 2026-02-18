import * as vscode from 'vscode';

type ProvideDocumentSymbolsFn = (document: vscode.TextDocument, token: vscode.CancellationToken) => vscode.ProviderResult<vscode.DocumentSymbol[]>;

type ProvideWorkspaceSymbolsFn = (query: string, token: vscode.CancellationToken) => vscode.ProviderResult<vscode.SymbolInformation[]>;

export function registerSymbolProviders(
  context: vscode.ExtensionContext,
  fns: {
    documentSymbols: ProvideDocumentSymbolsFn;
    workspaceSymbols: ProvideWorkspaceSymbolsFn;
  }
) {
  const docProvider = vscode.languages.registerDocumentSymbolProvider({ language: 'azsl' }, { provideDocumentSymbols: fns.documentSymbols });
  const wsProvider = vscode.languages.registerWorkspaceSymbolProvider({ provideWorkspaceSymbols: fns.workspaceSymbols });
  context.subscriptions.push(docProvider, wsProvider);
}
