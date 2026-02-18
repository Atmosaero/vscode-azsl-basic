import * as vscode from 'vscode';

import type { FunctionInfo } from '../state';

export function extractFunctionDeclarations(text: string, filePath: string): Map<string, FunctionInfo> {
  const results = new Map<string, FunctionInfo>();
  const lines = text.split(/\r?\n/);

  let braceDepth = 0;
  let inStructOrClass = false;
  let structClassDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';
    const trimmed = line.trim();

    if (trimmed.startsWith('//') || trimmed.startsWith('/*')) {
      continue;
    }

    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;
    braceDepth += openBraces - closeBraces;

    const structClassMatch = line.match(/\b(?:struct|class)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[:\{]?/);
    if (structClassMatch) {
      inStructOrClass = true;
      structClassDepth = braceDepth;
    }

    if (inStructOrClass && braceDepth < structClassDepth) {
      inStructOrClass = false;
    }

    if (inStructOrClass) {
      continue;
    }

    const funcMatch = line.match(
      /^\s*(?:static\s+)?(?:inline\s+)?(?:void|real(?:[1-4](?:x[1-4])?)?|float(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|[A-Z][A-Za-z0-9_<>,\s]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/
    );

    if (funcMatch) {
      const funcName = funcMatch[1];

      if (
        funcName === 'ShaderResourceGroup' ||
        funcName === 'partial' ||
        funcName === 'static' ||
        funcName === 'const' ||
        funcName === 'if' ||
        funcName === 'for' ||
        funcName === 'while'
      ) {
        continue;
      }

      const funcStart = line.indexOf(funcName);
      if (funcStart >= 0) {
        if (!results.has(funcName)) {
          results.set(funcName, {
            uri: vscode.Uri.file(filePath),
            line: i,
            column: funcStart
          });
        }
      }
    }
  }

  return results;
}
