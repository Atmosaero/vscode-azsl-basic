import * as vscode from 'vscode';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getReferenceSearchText(document: vscode.TextDocument, position: vscode.Position): string | null {
  const lineText = document.lineAt(position.line).text;
  const col = position.character;

  const left = lineText.slice(0, col);
  const right = lineText.slice(col);

  const leftMatch = left.match(/[A-Za-z_][A-Za-z0-9_]*(?:::)?$/);
  const rightMatch = right.match(/^(?:::)?[A-Za-z_][A-Za-z0-9_]*/);

  const leftPart = leftMatch?.[0] ?? '';
  const rightPart = rightMatch?.[0] ?? '';
  const combined = (leftPart + rightPart).replace(/::+/, '::');

  if (!combined) return null;

  const full = combined.match(/^([A-Za-z_][A-Za-z0-9_]*)(::([A-Za-z_][A-Za-z0-9_]*))?$/);
  if (!full) return null;

  return combined;
}

export function provideReferences(
  document: vscode.TextDocument,
  position: vscode.Position,
  options: { includeDeclaration: boolean },
  token: vscode.CancellationToken
): vscode.Location[] {
  const needle = getReferenceSearchText(document, position);
  if (!needle) return [];

  const text = document.getText();
  const escaped = escapeRegExp(needle);

  const regex = needle.includes('::')
    ? new RegExp(escaped, 'g')
    : new RegExp(`\\b${escaped}\\b`, 'g');

  const out: vscode.Location[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (token.isCancellationRequested) break;
    const start = document.positionAt(match.index);
    const end = document.positionAt(match.index + match[0].length);
    out.push(new vscode.Location(document.uri, new vscode.Range(start, end)));
  }

  return out;
}
