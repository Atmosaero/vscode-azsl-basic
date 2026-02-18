import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { headersBasenameIndex, headersPathIndex, macroIndex } from './state';
import { extractMacrosWithComments } from './parsers/macros';

export async function indexShaderQualityMacros(debugLog?: (msg: string) => void): Promise<void> {
  const getFileBySuffix = (relSuffix: string): string | undefined => {
    for (const [rel, abs] of headersPathIndex.entries()) {
      if (rel.endsWith(relSuffix)) {
        return abs;
      }
    }
    return undefined;
  };

  const suffixes = [
    'Atom/Features/ShaderQualityOptions.azsli',
    'Feature/Common/Assets/ShaderLib/Atom/Features/ShaderQualityOptions.azsli'
  ];

  let target: string | undefined;
  for (const s of suffixes) {
    const found = getFileBySuffix(s);
    if (found) {
      target = found;
      break;
    }
  }

  if (!target) {
    const byBase = headersBasenameIndex.get('ShaderQualityOptions.azsli');
    if (byBase && byBase.length > 0) {
      target = byBase[0];
    }
  }

  if (!target) return;

  try {
    const text = await fs.promises.readFile(target, 'utf8');
    const defs = extractMacrosWithComments(text);

    for (const d of defs) {
      const existing = macroIndex.get(d.name);
      if (!existing || (d.doc && (!existing.doc || existing.doc.length < d.doc.length))) {
        macroIndex.set(d.name, {
          value: d.value,
          doc: d.doc || '',
          uri: vscode.Uri.file(target),
          line: d.line
        });
      }
    }

    debugLog?.(`Indexed ShaderQualityOptions macros: ${defs.length} from ${path.basename(target)}`);
  } catch {
  }
}
