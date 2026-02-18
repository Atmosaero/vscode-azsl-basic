import * as vscode from 'vscode';

import { headersPathIndex } from './indexer/state';

type ValidateFn = (document: vscode.TextDocument, collection: vscode.DiagnosticCollection) => void;

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

export function registerDiagnostics(context: vscode.ExtensionContext, validateDocument: ValidateFn) {
  const pendingValidation: DebounceMap = new Map();
  const collection = vscode.languages.createDiagnosticCollection('azsl');

  const isAzslDoc = (doc: vscode.TextDocument): boolean => {
    if (doc.languageId === 'azsl') return true;
    const fsPath = doc.uri.fsPath.toLowerCase();
    return fsPath.endsWith('.azsl') || fsPath.endsWith('.azsli') || fsPath.endsWith('.srgi');
  };

  const validateIfAzsl = (doc: vscode.TextDocument) => {
    if (!isAzslDoc(doc)) return;
    validateDocument(doc, collection);
  };

  const docChangeWatcher = vscode.workspace.onDidChangeTextDocument(e => {
    if (isAzslDoc(e.document)) {
      scheduleDebounced(pendingValidation, e.document.uri.toString(), () => validateIfAzsl(e.document), 200);
    }
  });

  const docOpenWatcher = vscode.workspace.onDidOpenTextDocument(doc => {
    if (isAzslDoc(doc)) {
      scheduleDebounced(pendingValidation, doc.uri.toString(), () => validateIfAzsl(doc), 200);
    }
  });

  const activeEditorWatcher = vscode.window.onDidChangeActiveTextEditor(editor => {
    const doc = editor?.document;
    if (!doc) return;
    if (!isAzslDoc(doc)) return;
    scheduleDebounced(pendingValidation, doc.uri.toString(), () => validateIfAzsl(doc), 50);
  });

  context.subscriptions.push(collection, docChangeWatcher, docOpenWatcher, activeEditorWatcher);

  for (const doc of vscode.workspace.textDocuments) {
    validateIfAzsl(doc);
  }

  let didWarmValidate = false;
  const warmValidateTimer = setInterval(() => {
    if (didWarmValidate) return;
    if (headersPathIndex.size === 0) return;
    didWarmValidate = true;
    for (const doc of vscode.workspace.textDocuments) {
      validateIfAzsl(doc);
    }
    clearInterval(warmValidateTimer);
  }, 250);

  context.subscriptions.push({ dispose: () => clearInterval(warmValidateTimer) });
}
