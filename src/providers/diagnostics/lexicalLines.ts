export type LexicalLine = {
  code: string;
  braceDelta: number;
};

/** Masks comments, quoted text and preprocessor directives with spaces while
 * preserving line lengths. Consumers can safely reuse original source columns.
 */
export function scanLexicalLines(text: string): LexicalLine[] {
  const lines = text.split(/\r?\n/);
  const result: LexicalLine[] = [];
  let inBlockComment = false;

  for (const source of lines) {
    const output = [...source];
    let quote: '"' | "'" | null = null;
    const firstCode = source.search(/\S/);
    const preprocessor = !inBlockComment && firstCode >= 0 && source[firstCode] === '#';

    for (let index = 0; index < source.length; index++) {
      const current = source[index]!;
      const next = source[index + 1] ?? '';

      if (preprocessor) {
        output[index] = ' ';
        continue;
      }
      if (inBlockComment) {
        output[index] = ' ';
        if (current === '*' && next === '/') {
          output[index + 1] = ' ';
          index++;
          inBlockComment = false;
        }
        continue;
      }
      if (quote) {
        output[index] = ' ';
        if (current === quote && !isEscaped(source, index)) quote = null;
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
        inBlockComment = true;
        continue;
      }
      if (current === '"' || current === "'") {
        output[index] = ' ';
        quote = current;
      }
    }

    const code = output.join('');
    result.push({
      code,
      braceDelta: (code.match(/{/g) ?? []).length - (code.match(/}/g) ?? []).length
    });
  }
  return result;
}

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor--) slashCount++;
  return slashCount % 2 === 1;
}
