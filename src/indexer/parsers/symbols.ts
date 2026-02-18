export function extractSymbolsFromText(text: string): Set<string> {
  const found = new Set<string>();
  const regexes: RegExp[] = [
    /\bSRG_[A-Za-z0-9_]+\b/g,
    /\[\[[A-Za-z0-9_:\s,()]+\]\]/g,
    /\[(unroll|loop|flatten|branch|allow_uav_condition)\]/g,
    /\b[A-Z][A-Za-z0-9_]+\b/g,
    /\b(Sample|SampleCmp|GetDimensions)\b/g,
    /:[ \t]*(SV_[A-Za-z0-9_]+|TEXCOORD[0-9]+|POSITION|NORMAL)\b/g,
    /\bo_[A-Za-z0-9_]+\b/g
  ];

  for (const re of regexes) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const val = (m[1] || m[0]) as string;
      if (typeof val === 'string' && val.length <= 64) {
        found.add(val);
      }
    }
  }

  return found;
}
