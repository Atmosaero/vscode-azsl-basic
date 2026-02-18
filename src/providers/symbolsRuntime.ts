import * as vscode from 'vscode';

import { functionIndex, macroIndex, optionIndex, srgIndex, srgSemanticIndex, structIndex } from '../indexer/state';

type MatchSpec = {
  kind: vscode.SymbolKind;
  regex: RegExp;
};

const documentSymbolSpecs: MatchSpec[] = [
  { kind: vscode.SymbolKind.Struct, regex: /^\s*struct\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm },
  { kind: vscode.SymbolKind.Class, regex: /^\s*ShaderResourceGroup\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm },
  { kind: vscode.SymbolKind.Enum, regex: /^\s*ShaderResourceGroupSemantic\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm },
  { kind: vscode.SymbolKind.Constant, regex: /^\s*(?:static\s+)?option\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm },
  {
    kind: vscode.SymbolKind.Function,
    regex: /^\s*(?:[A-Za-z_][A-Za-z0-9_<>:]*\s+)+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm
  }
];

const noiseNames = new Set<string>([
  'if',
  'for',
  'while',
  'switch',
  'case',
  'return',
  'break',
  'continue',
  'discard',
  'do',
  'else',
  'float',
  'float2',
  'float3',
  'float4',
  'float2x2',
  'float3x3',
  'float4x4',
  'half',
  'double',
  'int',
  'uint',
  'bool'
]);

function rangeForMatch(document: vscode.TextDocument, matchIndex: number, matchText: string): vscode.Range {
  const start = document.positionAt(matchIndex);
  const end = document.positionAt(matchIndex + matchText.length);
  return new vscode.Range(start, end);
}

export function provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.DocumentSymbol[] {
  const text = document.getText();
  const symbols: vscode.DocumentSymbol[] = [];
  const seen = new Set<string>();

  for (const spec of documentSymbolSpecs) {
    let m: RegExpExecArray | null;
    while ((m = spec.regex.exec(text)) !== null) {
      if (token.isCancellationRequested) return symbols;
      const name = m[1];

      if (spec.kind === vscode.SymbolKind.Function) {
        if (noiseNames.has(name)) continue;
      }

      const key = `${spec.kind}:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const fullMatch = m[0];
      const matchIndex = m.index;

      const r = rangeForMatch(document, matchIndex, fullMatch);
      const selStart = document.positionAt(matchIndex + fullMatch.lastIndexOf(name));
      const sel = new vscode.Range(selStart, selStart.translate(0, name.length));

      symbols.push(new vscode.DocumentSymbol(name, '', spec.kind, r, sel));
    }
  }

  symbols.sort((a, b) => a.range.start.compareTo(b.range.start));
  return symbols;
}

function pushIfMatches(
  out: vscode.SymbolInformation[],
  queryLower: string,
  name: string,
  kind: vscode.SymbolKind,
  uri: vscode.Uri,
  line: number,
  column?: number
) {
  if (queryLower.length > 0 && !name.toLowerCase().includes(queryLower)) return;

  const pos = new vscode.Position(Math.max(0, line), Math.max(0, column ?? 0));
  const range = new vscode.Range(pos, pos);
  out.push(new vscode.SymbolInformation(name, kind, '', new vscode.Location(uri, range)));
}

export function provideWorkspaceSymbols(query: string, token: vscode.CancellationToken): vscode.SymbolInformation[] {
  const q = query.trim();
  if (q.length < 2) return [];

  const qLower = q.toLowerCase();
  const out: vscode.SymbolInformation[] = [];

  for (const [name, info] of structIndex) {
    if (token.isCancellationRequested) return out;
    pushIfMatches(out, qLower, name, vscode.SymbolKind.Struct, info.uri, info.line);
  }

  for (const [name, info] of srgIndex) {
    if (token.isCancellationRequested) return out;
    pushIfMatches(out, qLower, name, vscode.SymbolKind.Class, info.uri, info.line);
  }

  for (const [name, info] of srgSemanticIndex) {
    if (token.isCancellationRequested) return out;
    pushIfMatches(out, qLower, name, vscode.SymbolKind.Enum, info.uri, info.line);
  }

  for (const [name, info] of functionIndex) {
    if (token.isCancellationRequested) return out;
    pushIfMatches(out, qLower, name, vscode.SymbolKind.Function, info.uri, info.line, info.column);
  }

  for (const [name, info] of optionIndex) {
    if (token.isCancellationRequested) return out;
    pushIfMatches(out, qLower, name, vscode.SymbolKind.Constant, info.uri, info.line);
  }

  for (const [name, info] of macroIndex) {
    if (token.isCancellationRequested) return out;
    pushIfMatches(out, qLower, name, vscode.SymbolKind.Constant, info.uri, info.line);
  }

  return out;
}
