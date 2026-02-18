import * as vscode from 'vscode';

import { setGemPathGlobal } from '../config';
import { requestHeaderIndex } from '../indexer/requestHeaderIndex';
import { atomMethodIndex, macroIndex } from '../indexer/state';

export async function cmdSetGemPath(): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Select Atom Gem directory'
  });

  if (!picked || picked.length === 0) return;

  const chosen = picked[0].fsPath;

  try {
    await setGemPathGlobal(chosen);
    await requestHeaderIndex(chosen);
    vscode.window.showInformationMessage(
      `AZSL: Gem Path set. Reindexed. Macros: ${macroIndex.size}, Atom Methods: ${atomMethodIndex.size / 2}`
    );
  } catch {
    vscode.window.showErrorMessage('AZSL: Failed to set Gem Path');
  }
}
