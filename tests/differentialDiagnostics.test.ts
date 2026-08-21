import fs from 'fs';
import path from 'path';

import type { Diagnostic } from 'vscode';
import { beforeEach, describe, expect, test } from 'vitest';

import { resetIndexState } from '../src/indexer/reset';
import {
  atomMethodIndex,
  atomTypeMembers,
  fileTextCache,
  functionIndex,
  headersBasenameIndex,
  headersPathIndex,
  indexedSymbols,
  macroIndex,
  optionIndex,
  srgIndex,
  srgMemberIndex,
  srgMembers,
  srgSemanticIndex,
  structIndex,
  structMembers
} from '../src/indexer/state';
import { validateDocument } from '../src/providers/diagnosticsRuntime';
import { TestDocument } from './support/document';

class TestDiagnosticCollection {
  diagnostics: Diagnostic[] = [];

  set(_uri: unknown, diagnostics: readonly Diagnostic[]): void {
    this.diagnostics = [...diagnostics];
  }
}

const fixtureDirectory = path.resolve(__dirname, 'fixtures', 'differential');

// This is a characterization baseline, not a declaration that the current
// behavior is complete. Empty arrays record the remaining known false negatives.
const expectedDiagnostics: Record<string, Array<{ line: number; message: string }>> = {
  '01-member-and-name-errors.azsl': [
    { line: 11, message: "no member named 'm_roughness' in struct 'SurfaceData'" },
    { line: 16, message: "invalid swizzle property 'z' for type 'float2'" },
    { line: 21, message: "use of undeclared identifier 'missingGlobalValue'" }
  ],
  '02-srg-errors.azsl': [
    { line: 15, message: "no member named 'm_emissiveColor' in SRG 'MaterialSrg'" }
  ],
  '02b-duplicate-declaration.azsl': [],
  '02c-unknown-srg.azsl': [],
  '03-call-and-type-errors.azsl': [
    { line: 9, message: "no matching function for call to 'AddPair': expected 2 arguments, got 1" },
    { line: 14, message: "use of undeclared function 'FunctionThatDoesNotExist'" }
  ],
  '04-syntax-errors.azsl': [
    { line: 4, message: "syntax error: unexpected ';' after '.'" }
  ],
  '04b-double-dot-error.azsl': [
    { line: 4, message: "syntax error: unexpected '.' after '.'" }
  ],
  '04c-scope-access-error.azsl': [
    { line: 14, message: "syntax error: unexpected ';' after '::'" }
  ],
  '05-sampler-errors.azsl': [
    { line: 4, message: 'unknown sampler property: TotallyUnknownProperty' }
  ],
  '05b-sampler-value-error.azsl': [
    { line: 4, message: "syntax error: mismatched input 'NOT_A_REAL_FILTER' expecting {'Point', 'Linear'} (NOT_A_REAL_FILTER was unexpected)" }
  ],
  '05c-sampler-missing-value.azsl': [
    { line: 4, message: "syntax error: missing value for 'AddressU' (expecting {'Wrap', 'Mirror', 'Clamp', 'Border', 'MirrorOnce'})" }
  ],
  '06-geometry-errors.azsl': [
    { line: 26, message: "no member named 'm_missingPosition' in struct 'VertexToGeometry'" },
    { line: 38, message: "cannot append value of type 'VertexToGeometry' to 'TriangleStream<GeometryToPixel>'" }
  ],
  '07-unlit-errors.azsl': [
    { line: 18, message: "no member named 'm_missingUv' in struct 'UnlitVertexInput'" },
    { line: 24, message: "invalid swizzle property 'q' for type 'float2'" }
  ]
};

beforeEach(() => {
  resetIndexState({
    indexedSymbols,
    headersPathIndex,
    headersBasenameIndex,
    macroIndex,
    atomMethodIndex,
    atomTypeMembers,
    srgSemanticIndex,
    srgMembers,
    srgMemberIndex,
    srgIndex,
    structIndex,
    structMembers,
    functionIndex,
    optionIndex,
    fileTextCache
  });
  headersPathIndex.set('Atom/Test.azsli', 'C:\\fixtures\\Atom\\Test.azsli');
});

describe('differential compiler fixtures', () => {
  test('contains every AZERR marker exactly once', () => {
    const allText = fs.readdirSync(fixtureDirectory)
      .filter(name => name.endsWith('.azsl'))
      .map(name => fs.readFileSync(path.join(fixtureDirectory, name), 'utf8'))
      .join('\n');
    const markers = [...allText.matchAll(/AZERR(\d{2})/g)].map(match => Number(match[1])).sort((a, b) => a - b);
    expect(markers).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  });

  for (const fixtureName of fs.readdirSync(fixtureDirectory).filter(name => name.endsWith('.azsl')).sort()) {
    test(fixtureName, () => {
      const fixturePath = path.join(fixtureDirectory, fixtureName);
      const text = fs.readFileSync(fixturePath, 'utf8');
      const collection = new TestDiagnosticCollection();
      validateDocument(new TestDocument(text, fixturePath) as never, collection as never);

      const result = collection.diagnostics.map(diagnostic => ({
        line: diagnostic.range.start.line + 1,
        message: diagnostic.message
      }));
      expect(result).toEqual(expectedDiagnostics[fixtureName]);
    });
  }
});
