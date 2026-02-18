import * as vscode from 'vscode';

import { getGemPath } from '../config';
import { requestHeaderIndex } from '../indexer/requestHeaderIndex';
import { atomMethodIndex, macroIndex } from '../indexer/state';
import { indexDocumentMacros } from './macrosRuntime';

export async function reindexForGemPathChange(): Promise<void> {
  try {
    await requestHeaderIndex(getGemPath());
    vscode.workspace.textDocuments.forEach(doc => indexDocumentMacros(doc));
    vscode.window.showInformationMessage(
      `AZSL: Reindexed (settings changed). Macros: ${macroIndex.size}, Atom Methods: ${atomMethodIndex.size / 2}`
    );
  } catch {
  }
}
