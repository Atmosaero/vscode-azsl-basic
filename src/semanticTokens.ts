import * as vscode from 'vscode';

type ProvideDocumentSemanticTokensFn = (document: vscode.TextDocument) => vscode.ProviderResult<vscode.SemanticTokens>;

export function registerSemanticTokens(context: vscode.ExtensionContext, legend: vscode.SemanticTokensLegend, provideDocumentSemanticTokens: ProvideDocumentSemanticTokensFn) {
  const semanticTokens = vscode.languages.registerDocumentSemanticTokensProvider(
    { language: 'azsl' },
    { provideDocumentSemanticTokens },
    legend
  );
  context.subscriptions.push(semanticTokens);
}
