import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { Uri } from 'vscode';
import { resolveIncludeTarget, resolveIncludeWithFallback } from '../src/includes';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('include resolution', () => {
  test('resolves Atom-prefixed paths and normalizes Windows separators', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'azsl-includes-'));
    roots.push(root);
    const include = path.join(root, 'RPI', 'Math.azsli');
    mkdirSync(path.dirname(include), { recursive: true });
    writeFileSync(include, '');

    const logs: string[] = [];
    const resolved = resolveIncludeTarget('Atom\\RPI\\Math.azsli', root, new Map(), new Map(), message => logs.push(message));
    expect(resolved?.fsPath).toBe(path.resolve(include));
    expect(logs.some(message => message.includes('found via Atom/ path'))).toBe(true);
  });

  test('selects the closest ShaderLib candidate for ambiguous basenames', () => {
    const root = path.resolve('C:\\Atom');
    const preferred = path.join(root, 'RPI', 'Assets', 'ShaderLib', 'Atom', 'RPI', 'Common.azsli');
    const fallback = path.join(root, 'Feature', 'Very', 'Long', 'Generated', 'Path', 'Common.azsli');
    const resolved = resolveIncludeTarget(
      'Common.azsli',
      root,
      new Map(),
      new Map([['Common.azsli', [fallback, preferred]]]),
      () => undefined
    );

    expect(resolved?.fsPath).toBe(path.resolve(preferred));
  });

  test('uses document and workspace fallbacks and preserves a primary result', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'azsl-includes-'));
    roots.push(root);
    const docDir = path.join(root, 'shader');
    const workspaceDir = path.join(root, 'workspace');
    mkdirSync(docDir);
    mkdirSync(workspaceDir);
    writeFileSync(path.join(docDir, 'local.azsli'), '');
    writeFileSync(path.join(workspaceDir, 'workspace.azsli'), '');

    const primary = Uri.file(path.join(root, 'primary.azsli'));
    expect(resolveIncludeWithFallback('ignored.azsli', primary, docDir, [])).toBe(primary);
    expect(resolveIncludeWithFallback('local.azsli', undefined, docDir, [])?.fsPath).toBe(path.resolve(docDir, 'local.azsli'));
    expect(
      resolveIncludeWithFallback('workspace.azsli', undefined, '', [{ uri: Uri.file(workspaceDir) } as never])?.fsPath
    ).toBe(path.resolve(workspaceDir, 'workspace.azsli'));
  });

  test('reports an unresolved include when no root is configured', () => {
    const logs: string[] = [];
    expect(resolveIncludeTarget('Missing.azsli', undefined, new Map(), new Map(), message => logs.push(message))).toBeUndefined();
    expect(logs).toEqual(['resolveIncludeTarget: no root path configured']);
  });
});
