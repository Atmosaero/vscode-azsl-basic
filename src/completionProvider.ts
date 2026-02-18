import * as vscode from 'vscode';

type ProvideCompletionItemsFn = (
  document: vscode.TextDocument,
  position: vscode.Position,
  token: vscode.CancellationToken,
  context: vscode.CompletionContext
) => vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>>;

export function registerCompletionProvider(context: vscode.ExtensionContext, provideCompletionItems: ProvideCompletionItemsFn) {
  const provider = vscode.languages.registerCompletionItemProvider(
    { language: 'azsl', scheme: 'file' },
    { provideCompletionItems },
    '.', ':', '[', '_'
  );
  context.subscriptions.push(provider);
}
