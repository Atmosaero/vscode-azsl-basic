import * as vscode from 'vscode';

import { macroIndex } from '../indexer/state';
import { extractMacrosWithComments } from '../indexer/parsers/macros';
import { debugLog } from '../logger';

export function indexDocumentMacros(document: vscode.TextDocument): void {
  if (document.languageId !== 'azsl') return;

  try {
    const text = document.getText();
    const defs = extractMacrosWithComments(text);

    for (const d of defs) {
      const existing = macroIndex.get(d.name);
      if (
        !existing ||
        document.uri.toString() === existing.uri.toString() ||
        (d.doc && (!existing.doc || existing.doc.length < d.doc.length))
      ) {
        macroIndex.set(d.name, {
          value: d.value,
          doc: d.doc || '',
          uri: document.uri,
          line: d.line
        });
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    debugLog(`Error indexing macros: ${msg}`);
  }
}
