import * as vscode from 'vscode';

type ProvideTextContentFn = (uri: vscode.Uri) => string | null | undefined;

export function registerContentProviders(context: vscode.ExtensionContext, provideDoc: ProvideTextContentFn, provideSrg: ProvideTextContentFn) {
  const provider = vscode.workspace.registerTextDocumentContentProvider('azsl-builtin', {
    provideTextDocumentContent(uri) {
      try {
        const a = provideSrg(uri);
        if (a) return a;
      } catch {
      }
      try {
        const b = provideDoc(uri);
        if (b) return b;
      } catch {
      }
      return null;
    }
  });
  context.subscriptions.push(provider);
}
