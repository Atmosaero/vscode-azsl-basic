import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';

import type { Diagnostic } from 'vscode';
import { beforeAll, describe, expect, test } from 'vitest';

import { indexHeaders } from '../src/indexer/indexHeaders';
import { validateDocument } from '../src/providers/diagnosticsRuntime';
import { TestDocument } from './support/document';

const atomRoot = process.env.AZSL_ATOM_GEM_PATH ?? '';
const shaderKitRoot = process.env.AZSL_SHADERKIT_PATH ?? '';
const hasCorpus = existsSync(atomRoot) && existsSync(shaderKitRoot);

function collectShaderFiles(root: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...collectShaderFiles(entryPath));
    else if (/\.(?:azsl|azsli|srgi)$/i.test(entry.name)) result.push(entryPath);
  }
  return result;
}

const shaderFiles = hasCorpus ? collectShaderFiles(shaderKitRoot).sort() : [];

class TestDiagnosticCollection {
  diagnostics: Diagnostic[] = [];
  set(_uri: unknown, diagnostics: readonly Diagnostic[]): void {
    this.diagnostics = [...diagnostics];
  }
}

describe.skipIf(!hasCorpus)('real ShaderKit diagnostics against Atom development', () => {
  beforeAll(async () => {
    await indexHeaders(atomRoot, 1, {
      getCurrentHeaderIndexToken: () => 1,
      getProgressReport: () => null,
      getLastProgressAt: () => 0,
      setLastProgressAt: () => undefined,
      indexShaderQualityMacros: async () => undefined
    });
  }, 30_000);

  test.each(shaderFiles)('%s has no extension diagnostics', filePath => {
    const document = new TestDocument(readFileSync(filePath, 'utf8'), filePath);
    const collection = new TestDiagnosticCollection();
    validateDocument(document as never, collection as never);
    expect(collection.diagnostics.map(diagnostic => ({
      line: diagnostic.range.start.line + 1,
      message: diagnostic.message
    }))).toEqual([]);
  });
});
