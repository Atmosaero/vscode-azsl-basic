import * as vscode from 'vscode';

type IndexMacrosFn = (document: vscode.TextDocument) => void;

type DebounceMap = Map<string, NodeJS.Timeout>;

function scheduleDebounced(pendingMap: DebounceMap, key: string, fn: () => void, delayMs: number) {
  const existing = pendingMap.get(key);
  if (existing) {
    clearTimeout(existing);
  }
  const handle = setTimeout(() => {
    pendingMap.delete(key);
    try {
      fn();
    } catch {
    }
  }, delayMs);
  pendingMap.set(key, handle);
}

export function registerMacroIndexing(context: vscode.ExtensionContext, indexDocumentMacros: IndexMacrosFn) {
  const pending: DebounceMap = new Map();

  const indexIfAzsl = (doc: vscode.TextDocument) => {
    if (doc.languageId !== 'azsl') return;
    indexDocumentMacros(doc);
  };

  const openWatcher = vscode.workspace.onDidOpenTextDocument(doc => {
    scheduleDebounced(pending, doc.uri.toString(), () => indexIfAzsl(doc), 150);
  });

  const changeWatcher = vscode.workspace.onDidChangeTextDocument(e => {
    scheduleDebounced(pending, e.document.uri.toString(), () => indexIfAzsl(e.document), 150);
  });

  context.subscriptions.push(openWatcher, changeWatcher);

  for (const doc of vscode.workspace.textDocuments) {
    indexIfAzsl(doc);
  }
}
