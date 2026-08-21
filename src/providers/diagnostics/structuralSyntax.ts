export type DiagnosticIssue = {
  line: number;
  start: number;
  end: number;
  message: string;
};

const declarationStart = /^(float|int|uint|bool|half|double|void|matrix|Texture|Sampler|struct|class|namespace|ShaderResourceGroup|cbuffer|tbuffer|#|\/\/|\/\*)/;

export function collectStructuralSyntaxIssues(lines: readonly string[]): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  collectMemberAccessIssues(lines, issues);
  collectDanglingStructSemanticIssues(lines, issues);
  return issues;
}

function withoutInlineComments(line: string): string {
  const withoutBlock = line.replace(/\/\*[\s\S]*?\*\//g, '');
  const commentIndex = withoutBlock.indexOf('//');
  return commentIndex < 0 ? withoutBlock : withoutBlock.substring(0, commentIndex);
}

function nextLineStartsDeclaration(lines: readonly string[], index: number): boolean {
  if (index + 1 >= lines.length) return true;
  const next = (lines[index + 1] ?? '').trim();
  return declarationStart.test(next) || /^[A-Z][A-Za-z0-9_]*\s+[A-Za-z_]/.test(next);
}

function collectMemberAccessIssues(lines: readonly string[], issues: DiagnosticIssue[]): void {
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex] ?? '';
    if (/^\s*(?:\/\/|#)/.test(rawLine)) continue;
    const line = withoutInlineComments(rawLine);
    const trimmed = line.trim();

    if (/([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*$/.test(trimmed) && nextLineStartsDeclaration(lines, lineIndex)) {
      const dot = rawLine.lastIndexOf('.');
      issues.push({ line: lineIndex, start: dot, end: dot + 1, message: 'incomplete member access' });
    }

    if (/([A-Za-z_][A-Za-z0-9_]*)\s*::\s*$/.test(trimmed) && nextLineStartsDeclaration(lines, lineIndex)) {
      const colon = rawLine.lastIndexOf('::');
      issues.push({ line: lineIndex, start: colon, end: colon + 2, message: 'incomplete member access' });
    }

    let match: RegExpExecArray | null;
    const dotSemicolon = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*;/g;
    while ((match = dotSemicolon.exec(line)) !== null) {
      const start = match.index + match[1]!.length;
      const semicolon = line.indexOf(';', start);
      issues.push({ line: lineIndex, start, end: semicolon + 1, message: "syntax error: unexpected ';' after '.'" });
    }

    const doubleDot = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*\./g;
    while ((match = doubleDot.exec(line)) !== null) {
      const start = match.index + match[1]!.length;
      issues.push({ line: lineIndex, start, end: start + 2, message: "syntax error: unexpected '.' after '.'" });
    }

    const colonSemicolon = /\b([A-Za-z_][A-Za-z0-9_]*)\s*::\s*;/g;
    while ((match = colonSemicolon.exec(line)) !== null) {
      const start = match.index + match[1]!.length;
      const semicolon = line.indexOf(';', start);
      issues.push({ line: lineIndex, start, end: semicolon + 1, message: "syntax error: unexpected ';' after '::'" });
    }
  }
}

function collectDanglingStructSemanticIssues(lines: readonly string[], issues: DiagnosticIssue[]): void {
  let pendingStruct = false;
  let inStruct = false;
  let braceDepth = 0;

  const nextToken = (afterLine: number): { text: string; line: number; column: number } | null => {
    for (let lineIndex = afterLine + 1; lineIndex < lines.length; lineIndex++) {
      const raw = lines[lineIndex] ?? '';
      if (/^\s*#/.test(raw)) continue;
      const line = withoutInlineComments(raw);
      if (!line.trim()) continue;
      const match = line.match(/\b([A-Za-z_][A-Za-z0-9_]*)\b/);
      if (!match) return null;
      return { text: match[1]!, line: lineIndex, column: Math.max(0, line.indexOf(match[1]!)) };
    }
    return null;
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const raw = lines[lineIndex] ?? '';
    if (/^\s*(?:\/\/|#)/.test(raw)) continue;
    const line = withoutInlineComments(raw);
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (!inStruct) {
      if (/^\s*struct\b/.test(trimmed)) pendingStruct = true;
      if (pendingStruct && line.includes('{')) {
        inStruct = true;
        pendingStruct = false;
        braceDepth = (line.match(/{/g) ?? []).length - (line.match(/}/g) ?? []).length;
        if (braceDepth <= 0) inStruct = false;
      }
      continue;
    }

    if (/[^:]\s*:\s*$/.test(line) && !/::\s*$/.test(line)) {
      const next = nextToken(lineIndex);
      if (next) {
        issues.push({
          line: next.line,
          start: next.column,
          end: next.column + next.text.length,
          message: `syntax error: no viable alternative at input '${next.text}' (${next.text} was unexpected)`
        });
      } else {
        const colon = Math.max(0, line.lastIndexOf(':'));
        issues.push({ line: lineIndex, start: colon, end: colon + 1, message: "syntax error: no viable alternative at input ':'" });
      }
    }

    braceDepth += (line.match(/{/g) ?? []).length - (line.match(/}/g) ?? []).length;
    if (braceDepth <= 0) {
      inStruct = false;
      pendingStruct = false;
      braceDepth = 0;
    }
  }
}
