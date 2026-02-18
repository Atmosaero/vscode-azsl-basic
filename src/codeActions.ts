import * as vscode from 'vscode';

type ProvideCodeActionsFn = (
  document: vscode.TextDocument,
  range: vscode.Range,
  context: vscode.CodeActionContext,
  token: vscode.CancellationToken
) => vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]>;

export function registerCodeActions(context: vscode.ExtensionContext, provideCodeActions: ProvideCodeActionsFn) {
  const provider = vscode.languages.registerCodeActionsProvider(
    { language: 'azsl' },
    {
      provideCodeActions
    },
    {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
    }
  );

  context.subscriptions.push(provider);
}
