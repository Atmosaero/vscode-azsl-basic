export type ParsedMacro = {
  name: string;
  value: string;
  line: number;
  doc: string;
};

export function extractMacrosWithComments(text: string): ParsedMacro[] {
  const results: ParsedMacro[] = [];
  const lines = text.split(/\r?\n/);

  const collectPrecedingComment = (fromIndex: number): string => {
    let docLines: string[] = [];
    let j = fromIndex;
    while (j >= 0 && /^\s*$/.test(lines[j] || '')) j--;

    while (j >= 0 && /^\s*\/\//.test(lines[j] || '')) {
      docLines.unshift((lines[j] || '').replace(/^\s*\/\//, '').trim());
      j--;
    }

    if (j >= 0 && /\*\/\s*$/.test(lines[j] || '')) {
      let k = j;
      const block: string[] = [];
      while (k >= 0) {
        block.unshift(lines[k] || '');
        if (/^\s*\/\*/.test(lines[k] || '')) break;
        k--;
      }

      const cleaned = block
        .join('\n')
        .replace(/^\s*\/\*/, '')
        .replace(/\*\/\s*$/, '')
        .split('\n')
        .map(s => s.replace(/^\s*\*\s?/, '').trim());

      docLines = cleaned.concat(docLines);
    }

    return docLines.join('\n');
  };

  for (let i = 0; i < lines.length; i++) {
    const m = (lines[i] || '').match(/^\s*#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+(.*?))?(?:\s*\/\/\s*(.*))?\s*$/);
    if (m) {
      const name = m[1];
      const value = (m[2] || '').trim();
      const inlineComment = (m[3] || '').trim();
      const docHead = collectPrecedingComment(i - 1);
      const doc = [docHead, inlineComment].filter(Boolean).join('\n');
      results.push({ name, value, line: i, doc });
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const ifndef = (lines[i] || '').match(/^\s*#\s*ifndef\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/);
    if (ifndef) {
      const name = ifndef[1];
      let defLine = -1;
      let value = '';
      let inline = '';

      for (let k = i + 1; k < Math.min(lines.length, i + 16); k++) {
        const m = (lines[k] || '').match(/^\s*#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)\s+(.*?)(?:\s*\/\/\s*(.*))?\s*$/);
        if (m && m[1] === name) {
          defLine = k;
          value = (m[2] || '').trim();
          inline = (m[3] || '').trim();
          break;
        }
      }

      if (defLine >= 0) {
        const docHead = collectPrecedingComment(i - 1);
        const doc = [docHead, inline].filter(Boolean).join('\n');
        results.push({ name, value, line: defLine, doc });
      }
    }
  }

  return results;
}
