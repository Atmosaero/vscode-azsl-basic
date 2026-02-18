import * as vscode from 'vscode';

function splitLinesPreserve(text: string): string[] {
  return text.split(/\r\n|\n/);
}

function countIndentUnits(s: string, indentUnit: string): number {
  if (!indentUnit) return 0;
  let n = 0;
  while (s.startsWith(indentUnit.repeat(n + 1))) n++;
  return n;
}

function buildIndent(indentLevel: number, indentUnit: string): string {
  if (indentLevel <= 0) return '';
  return indentUnit.repeat(indentLevel);
}

function isPreprocessorLine(trimmed: string): boolean {
  return trimmed.startsWith('#');
}

function computeIndentLevels(lines: string[]): number[] {
  // A conservative indentation model:
  // - We only use braces outside of strings/comments
  // - We don't try to reflow text, only left indentation.
  const levels: number[] = new Array(lines.length).fill(0);

  let indent = 0;
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    let indentForLine = indent;
    if (!inBlockComment && trimmed.startsWith('}')) {
      indentForLine = Math.max(0, indent - 1);
    }

    levels[i] = indentForLine;

    // Update state for next line
    if (trimmed.length === 0) continue;
    if (!inBlockComment && isPreprocessorLine(trimmed)) continue;

    // Scan characters to update indent based on { }.
    // Ignore content inside strings and comments.
    let inLineComment = false;
    let inString: '"' | "'" | null = null;

    for (let j = 0; j < rawLine.length; j++) {
      const ch = rawLine[j];
      const next = j + 1 < rawLine.length ? rawLine[j + 1] : '';

      if (inLineComment) break;

      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false;
          j++;
        }
        continue;
      }

      if (inString) {
        if (ch === inString && rawLine[j - 1] !== '\\') {
          inString = null;
        }
        continue;
      }

      if (ch === '/' && next === '/') {
        inLineComment = true;
        continue;
      }

      if (ch === '/' && next === '*') {
        inBlockComment = true;
        j++;
        continue;
      }

      if (ch === '"' || ch === "'") {
        inString = ch as '"' | "'";
        continue;
      }

      if (ch === '{') {
        indent++;
      } else if (ch === '}') {
        indent = Math.max(0, indent - 1);
      }
    }
  }

  return levels;
}

export function provideDocumentFormattingEdits(
  document: vscode.TextDocument,
  options: vscode.FormattingOptions,
  token: vscode.CancellationToken
): vscode.TextEdit[] {
  if (token.isCancellationRequested) return [];

  const indentUnit = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';

  const rawOriginalText = document.getText();
  const eolStr = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
  const originalLines = splitLinesPreserve(rawOriginalText);

  const levels = computeIndentLevels(originalLines);
  const formattedLines: string[] = [];

  for (let i = 0; i < originalLines.length; i++) {
    if (token.isCancellationRequested) return [];

    const raw = originalLines[i];
    const trimmedRight = raw.replace(/[\t ]+$/g, '');
    const trimmed = trimmedRight.trim();

    if (trimmed.length === 0) {
      formattedLines.push('');
      continue;
    }

    if (isPreprocessorLine(trimmed)) {
      // Keep preprocessor directives at column 0, but trim trailing whitespace.
      formattedLines.push(trimmed);
      continue;
    }

    // Keep existing relative indentation inside block comments.
    // We do not attempt to align comment stars, only trim right.
    const leadingWsMatch = /^([\t ]*)/.exec(trimmedRight);
    const existingLeading = leadingWsMatch ? leadingWsMatch[1] : '';
    const existingUnits = countIndentUnits(existingLeading, indentUnit);

    const targetIndent = buildIndent(levels[i], indentUnit);

    // If line is inside a block comment (heuristic): starts with '*' or '/*'
    // keep one extra indent if it already had it.
    if (trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      const bestIndent = buildIndent(Math.max(levels[i], existingUnits), indentUnit);
      formattedLines.push(bestIndent + trimmed);
      continue;
    }

    formattedLines.push(targetIndent + trimmed);
  }

  const formattedText = formattedLines.join(eolStr);
  if (formattedText === rawOriginalText) return [];

  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(rawOriginalText.length));
  return [vscode.TextEdit.replace(fullRange, formattedText)];
}
