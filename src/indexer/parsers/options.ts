import * as vscode from 'vscode';

import type { OptionInfo } from '../state';

export type ParsedOptionInfo = OptionInfo & {
  name: string;
};

export function extractOptionDeclarations(text: string, filePath: string): Map<string, ParsedOptionInfo> {
  const results = new Map<string, ParsedOptionInfo>();
  const lines = text.split(/\r?\n/);

  let inMultiLineComment = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i] || '';

    if (inMultiLineComment) {
      const commentEnd = line.indexOf('*/');
      if (commentEnd !== -1) {
        inMultiLineComment = false;
        line = line.substring(commentEnd + 2);
      } else {
        continue;
      }
    }

    const multiLineStart = line.indexOf('/*');
    if (multiLineStart !== -1) {
      const commentEnd = line.indexOf('*/', multiLineStart + 2);
      if (commentEnd !== -1) {
        line = line.substring(0, multiLineStart) + line.substring(commentEnd + 2);
      } else {
        inMultiLineComment = true;
        line = line.substring(0, multiLineStart);
      }
    }

    const singleLineComment = line.indexOf('//');
    if (singleLineComment !== -1) {
      line = line.substring(0, singleLineComment);
    }

    const processedLine = line.trim();
    if (!processedLine) {
      continue;
    }

    const enumMatch = processedLine.match(/^\s*(?:(static)\s+)?option\s+(?:(static)\s+)?enum\s+class\s+[A-Za-z_][A-Za-z0-9_]*\b/);
    if (enumMatch) {
      const isStatic = Boolean(enumMatch[1] || enumMatch[2]);
      let declaration = processedLine;
      let declarationLine = i;
      while (!/}\s*[A-Za-z_][A-Za-z0-9_]*\s*(?:=[^;]*)?;/.test(declaration) && i + 1 < lines.length) {
        i++;
        declaration += ` ${lines[i] || ''}`;
        declarationLine = i;
      }

      const variableMatch = declaration.match(/}\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:=[^;]*)?;/);
      if (variableMatch) {
        const optionName = variableMatch[1];
        results.set(optionName, {
          name: optionName,
          isStatic,
          uri: vscode.Uri.file(filePath),
          line: declarationLine
        });
      }
      continue;
    }

    // AZSL options may use built-in scalar types or user-defined enum types.
    const optionMatch = processedLine.match(
      /^\s*(?:(static)\s+)?option\s+(?:(static)\s+)?[A-Za-z_][A-Za-z0-9_]*\s+([A-Za-z_][A-Za-z0-9_]*)\s*[=;]/
    );
    if (optionMatch) {
      const isStatic = Boolean(optionMatch[1] || optionMatch[2]);
      const optionName = optionMatch[3];
      if (!results.has(optionName)) {
        results.set(optionName, {
          name: optionName,
          isStatic,
          uri: vscode.Uri.file(filePath),
          line: i
        });
      }
    }
  }

  return results;
}
