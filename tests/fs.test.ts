import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { readTextFileCached } from '../src/fsCache';
import { shouldIndexFile, walkDirCollect, walkDirIter } from '../src/indexer/fsWalk';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function createFixtureTree(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'azsl-basic-'));
  tempRoots.push(root);
  mkdirSync(path.join(root, 'nested'));
  writeFileSync(path.join(root, 'shader.azsl'), 'one');
  writeFileSync(path.join(root, 'nested', 'include.azsli'), 'two');
  writeFileSync(path.join(root, 'nested', 'semantic.srgi'), 'three');
  writeFileSync(path.join(root, 'ignored.json'), '{}');
  return root;
}

describe('filesystem indexing', () => {
  test.each(['shader.azsl', 'shader.AZSLI', 'shader.srgi', 'shader.hlsl', 'shader.azslin'])('accepts %s', file => {
    expect(shouldIndexFile(file)).toBe(true);
  });

  test.each(['shader.shader', 'shader.materialtype', 'shader.json', 'shader.ts'])('rejects %s', file => {
    expect(shouldIndexFile(file)).toBe(false);
  });

  test('collects supported files recursively and honors the limit', async () => {
    const root = createFixtureTree();
    expect(walkDirCollect(root).map(file => path.basename(file)).sort()).toEqual(['include.azsli', 'semantic.srgi', 'shader.azsl']);
    expect(walkDirCollect(root, 2)).toHaveLength(2);

    const asyncFiles: string[] = [];
    for await (const file of walkDirIter(root)) asyncFiles.push(path.basename(file));
    expect(asyncFiles.sort()).toEqual(['include.azsli', 'semantic.srgi', 'shader.azsl']);
  });
});

describe('file cache', () => {
  test('returns cached text until mtime changes and returns null for missing files', () => {
    const root = createFixtureTree();
    const file = path.join(root, 'shader.azsl');
    const cache = new Map();

    expect(readTextFileCached(file, cache)).toBe('one');
    writeFileSync(file, 'updated');
    expect(readTextFileCached(file, cache)).toBe('updated');

    const future = new Date(Date.now() + 2000);
    utimesSync(file, future, future);
    expect(readTextFileCached(file, cache)).toBe('updated');
    expect(readTextFileCached(path.join(root, 'missing.azsl'), cache)).toBeNull();
  });
});
