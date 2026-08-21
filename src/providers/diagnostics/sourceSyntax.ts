import { scanLexicalLines } from './lexicalLines';

export type SourceSyntaxIssue = {
  line: number;
  start: number;
  end: number;
  message: string;
};

type Delimiter = '(' | ')' | '[' | ']' | '{' | '}';
type OpeningDelimiter = '(' | '[' | '{';

const closingFor: Record<OpeningDelimiter, ')' | ']' | '}'> = {
  '(': ')',
  '[': ']',
  '{': '}'
};

const openingFor: Record<')' | ']' | '}', OpeningDelimiter> = {
  ')': '(',
  ']': '[',
  '}': '{'
};

export function collectSourceSyntaxIssues(text: string): SourceSyntaxIssue[] {
  const lines = text.split(/\r?\n/);
  const lexicalLines = scanLexicalLines(text);
  const issues: SourceSyntaxIssue[] = [];

  collectPreprocessorIssues(lines, issues);
  collectDelimiterIssues(lexicalLines.map(line => line.code), issues);
  collectMacroArgumentIssues(lines, lexicalLines.map(line => line.code), issues);
  collectMissingSemicolonIssues(lexicalLines.map(line => line.code), issues);

  return issues;
}

function collectPreprocessorIssues(lines: readonly string[], issues: SourceSyntaxIssue[]): void {
  const conditionals: Array<{ line: number; start: number; directive: string }> = [];
  const commentState = { inBlock: false };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const raw = lines[lineIndex] ?? '';
    const line = maskComments(raw, commentState);
    const directiveMatch = line.match(/^\s*#\s*([A-Za-z_][A-Za-z0-9_]*)\b(.*)$/);
    if (!directiveMatch) continue;

    const directive = directiveMatch[1]!.toLowerCase();
    const rest = directiveMatch[2] ?? '';
    const directiveStart = Math.max(0, line.indexOf(directiveMatch[1]!));

    if (directive === 'include') {
      const first = rest.search(/\S/);
      if (first >= 0) {
        const opener = rest[first]!;
        const sourceStart = line.indexOf(rest) + first;
        if (opener === '"' && findUnescapedQuote(rest, first + 1) < 0) {
          issues.push({
            line: lineIndex,
            start: sourceStart,
            end: Math.max(sourceStart + 1, raw.length),
            message: 'unterminated string literal in #include'
          });
        } else if (opener === '<' && rest.indexOf('>', first + 1) < 0) {
          issues.push({
            line: lineIndex,
            start: sourceStart,
            end: Math.max(sourceStart + 1, raw.length),
            message: "unterminated header name in #include; expected '>'"
          });
        }
      }
    }

    if (directive === 'if' || directive === 'ifdef' || directive === 'ifndef') {
      conditionals.push({ line: lineIndex, start: directiveStart, directive });
    } else if (directive === 'endif') {
      if (conditionals.length > 0) {
        conditionals.pop();
      } else {
        issues.push({
          line: lineIndex,
          start: directiveStart,
          end: directiveStart + directive.length,
          message: "unexpected '#endif' without matching '#if'"
        });
      }
    } else if ((directive === 'else' || directive === 'elif') && conditionals.length === 0) {
      issues.push({
        line: lineIndex,
        start: directiveStart,
        end: directiveStart + directive.length,
        message: `unexpected '#${directive}' without matching '#if'`
      });
    }
  }

  for (const conditional of conditionals) {
    issues.push({
      line: conditional.line,
      start: conditional.start,
      end: conditional.start + conditional.directive.length,
      message: `unterminated '#${conditional.directive}' directive; expected '#endif'`
    });
  }
}

function collectDelimiterIssues(codeLines: readonly string[], issues: SourceSyntaxIssue[]): void {
  const stack: Array<{ delimiter: OpeningDelimiter; line: number; column: number }> = [];

  for (let lineIndex = 0; lineIndex < codeLines.length; lineIndex++) {
    const line = codeLines[lineIndex] ?? '';
    for (let column = 0; column < line.length; column++) {
      const delimiter = line[column] as Delimiter;
      if (delimiter === '(' || delimiter === '[' || delimiter === '{') {
        stack.push({ delimiter, line: lineIndex, column });
        continue;
      }
      if (delimiter !== ')' && delimiter !== ']' && delimiter !== '}') continue;

      const expectedOpening = openingFor[delimiter];
      const matchingIndex = findLastIndex(stack, entry => entry.delimiter === expectedOpening);
      if (matchingIndex < 0) {
        issues.push({
          line: lineIndex,
          start: column,
          end: column + 1,
          message: `unexpected '${delimiter}' with no matching '${expectedOpening}'`
        });
        continue;
      }

      while (stack.length - 1 > matchingIndex) {
        const unclosed = stack.pop()!;
        issues.push({
          line: unclosed.line,
          start: unclosed.column,
          end: unclosed.column + 1,
          message: `unclosed '${unclosed.delimiter}'; expected '${closingFor[unclosed.delimiter]}' before '${delimiter}'`
        });
      }
      stack.pop();
    }
  }

  for (const unclosed of stack) {
    issues.push({
      line: unclosed.line,
      start: unclosed.column,
      end: unclosed.column + 1,
      message: `unclosed '${unclosed.delimiter}'; expected '${closingFor[unclosed.delimiter]}' before end of file`
    });
  }
}

function collectMacroArgumentIssues(
  sourceLines: readonly string[],
  codeLines: readonly string[],
  issues: SourceSyntaxIssue[]
): void {
  const definitions = new Map<string, Array<{ line: number; parameters: number }>>();
  const commentState = { inBlock: false };

  for (let lineIndex = 0; lineIndex < sourceLines.length; lineIndex++) {
    const line = maskComments(sourceLines[lineIndex] ?? '', commentState);
    const match = line.match(/^\s*#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\)/);
    if (!match || match[2]!.includes('...')) continue;
    const parameters = match[2]!.trim() ? match[2]!.split(',').length : 0;
    const entries = definitions.get(match[1]!) ?? [];
    entries.push({ line: lineIndex, parameters });
    definitions.set(match[1]!, entries);
  }

  const maskedText = codeLines.join('\n');
  const lineStarts = buildLineStarts(codeLines);
  for (const [name, entries] of definitions) {
    if (entries.length !== 1) continue;
    const definition = entries[0]!;
    const callPattern = new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`, 'g');
    let match: RegExpExecArray | null;
    while ((match = callPattern.exec(maskedText)) !== null) {
      const position = offsetToPosition(match.index, lineStarts);
      if (position.line <= definition.line) continue;
      const openParen = maskedText.indexOf('(', match.index + name.length);
      const call = countCallArguments(maskedText, openParen);
      if (!call || call.arguments === definition.parameters) continue;
      issues.push({
        line: position.line,
        start: position.column,
        end: position.column + name.length,
        message: `macro '${name}' expects ${definition.parameters} arguments, got ${call.arguments}`
      });
      callPattern.lastIndex = Math.max(callPattern.lastIndex, call.closeParen + 1);
    }
  }
}

function collectMissingSemicolonIssues(codeLines: readonly string[], issues: SourceSyntaxIssue[]): void {
  const declarationAssignment = /^\s*(?:const\s+)?(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|[A-Z][A-Za-z0-9_]*)\s+[A-Za-z_][A-Za-z0-9_]*(?:\s*\[[^\]]+\])?\s*=\s*.+$/;

  for (let lineIndex = 0; lineIndex < codeLines.length; lineIndex++) {
    const code = codeLines[lineIndex] ?? '';
    const trimmed = code.trim();
    if (!declarationAssignment.test(code) || trimmed.endsWith(';')) continue;
    if (/[({[,=+\-*\/%?:]\s*$/.test(trimmed)) continue;
    const next = nextCodeLine(codeLines, lineIndex);
    if (next && /^[?:+\-*\/%.,]/.test(next)) continue;
    const end = code.trimEnd().length;
    issues.push({
      line: lineIndex,
      start: Math.max(0, end - 1),
      end,
      message: "missing ';' at end of statement"
    });
  }
}

function maskComments(line: string, state: { inBlock: boolean }): string {
  const output = [...line];
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < line.length; index++) {
    const current = line[index]!;
    const next = line[index + 1] ?? '';
    if (state.inBlock) {
      output[index] = ' ';
      if (current === '*' && next === '/') {
        output[index + 1] = ' ';
        index++;
        state.inBlock = false;
      }
      continue;
    }
    if (quote) {
      if (current === quote && !isEscaped(line, index)) quote = null;
      continue;
    }
    if (current === '"' || current === "'") {
      quote = current;
      continue;
    }
    if (current === '/' && next === '/') {
      for (let rest = index; rest < output.length; rest++) output[rest] = ' ';
      break;
    }
    if (current === '/' && next === '*') {
      output[index] = ' ';
      output[index + 1] = ' ';
      index++;
      state.inBlock = true;
    }
  }
  return output.join('');
}

function findUnescapedQuote(text: string, start: number): number {
  for (let index = start; index < text.length; index++) {
    if (text[index] === '"' && !isEscaped(text, index)) return index;
  }
  return -1;
}

function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor--) slashes++;
  return slashes % 2 === 1;
}

function findLastIndex<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index--) {
    if (predicate(items[index]!)) return index;
  }
  return -1;
}

function countCallArguments(text: string, openParen: number): { arguments: number; closeParen: number } | null {
  let parens = 0;
  let brackets = 0;
  let braces = 0;
  let commas = 0;
  let hasContent = false;
  for (let index = openParen + 1; index < text.length; index++) {
    const character = text[index]!;
    if (character === '(') parens++;
    else if (character === ')') {
      if (parens === 0) return { arguments: hasContent ? commas + 1 : 0, closeParen: index };
      parens--;
    } else if (character === '[') brackets++;
    else if (character === ']') brackets--;
    else if (character === '{') braces++;
    else if (character === '}') braces--;
    else if (character === ',' && parens === 0 && brackets === 0 && braces === 0) commas++;
    if (!/\s/.test(character) && character !== ',') hasContent = true;
  }
  return null;
}

function buildLineStarts(lines: readonly string[]): number[] {
  const starts = [0];
  for (let index = 0; index < lines.length - 1; index++) starts.push(starts[index]! + (lines[index]?.length ?? 0) + 1);
  return starts;
}

function offsetToPosition(offset: number, lineStarts: readonly number[]): { line: number; column: number } {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (lineStarts[middle]! <= offset) low = middle + 1;
    else high = middle - 1;
  }
  const line = Math.max(0, high);
  return { line, column: offset - lineStarts[line]! };
}

function nextCodeLine(lines: readonly string[], after: number): string | null {
  for (let index = after + 1; index < lines.length; index++) {
    const trimmed = (lines[index] ?? '').trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
