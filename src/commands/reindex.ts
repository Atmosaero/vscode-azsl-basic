import * as vscode from 'vscode';

import { getGemPath } from '../config';
import { requestHeaderIndex } from '../indexer/requestHeaderIndex';
import { atomMethodIndex, indexedSymbols, macroIndex } from '../indexer/state';

export async function cmdReindex(indexDocumentMacros?: (document: vscode.TextDocument) => void): Promise<void> {
  await requestHeaderIndex(getGemPath());
  if (indexDocumentMacros) {
    vscode.workspace.textDocuments.forEach(doc => indexDocumentMacros(doc));
  }
  vscode.window.showInformationMessage(
    `AZSL: Reindexed. Symbols: ${indexedSymbols.size}, Macros: ${macroIndex.size}, Atom Methods: ${atomMethodIndex.size / 2}`
  );
}
