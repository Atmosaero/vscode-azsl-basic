import * as fs from 'fs';
import * as path from 'path';

export function shouldIndexFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.azsli' || ext === '.srgi' || ext === '.azsl' || ext === '.hlsl' || ext === '.azslin';
}

export async function* walkDirIter(fileOrDir: string, maxFiles = 8000): AsyncGenerator<string> {
  const stack: string[] = [fileOrDir];
  let emitted = 0;
  let steps = 0;
  while (stack.length && emitted < maxFiles) {
    const cur = stack.pop();
    if (!cur) break;
    try {
      const stat = await fs.promises.stat(cur);
      if (stat.isDirectory()) {
        const entries = await fs.promises.readdir(cur);
        for (const e of entries) {
          stack.push(path.join(cur, e));
        }
      } else if (stat.isFile() && shouldIndexFile(cur)) {
        emitted++;
        yield cur;
      }
    } catch {
    }
    steps++;
    if (steps % 200 === 0) {
      await new Promise<void>(r => setTimeout(r, 0));
    }
  }
}

export function walkDirCollect(fileOrDir: string, maxFiles = 8000): string[] {
  const stack: string[] = [fileOrDir];
  const files: string[] = [];
  while (stack.length && files.length < maxFiles) {
    const cur = stack.pop();
    if (!cur) break;
    try {
      const stat = fs.statSync(cur);
      if (stat.isDirectory()) {
        const entries = fs.readdirSync(cur);
        for (const e of entries) {
          stack.push(path.join(cur, e));
        }
      } else if (stat.isFile() && shouldIndexFile(cur)) {
        files.push(cur);
      }
    } catch {
    }
  }
  return files;
}
