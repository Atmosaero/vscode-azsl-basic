import * as fs from 'fs';

export type CachedFileText = {
  mtimeMs: number;
  text: string;
};

export type FileTextCache = Map<string, CachedFileText>;

export function readTextFileCached(filePath: string, cache: FileTextCache): string | null {
  try {
    const stat = fs.statSync(filePath);
    const cached = cache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.text;
    }
    const text = fs.readFileSync(filePath, 'utf8');
    cache.set(filePath, { mtimeMs: stat.mtimeMs, text });
    return text;
  } catch {
    return null;
  }
}
