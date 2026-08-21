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

const fixtureDirectory = path.resolve(__dirname, 'fixtures', 'differential-round2');

// Characterization baseline: every empty result is a known false negative.
// Keep the assertions explicit so future diagnostics improvements require the
// corresponding fixture expectation and comparison table to be updated.
const expectedDiagnostics: Record<string, Array<{ line: number; message: string }>> = {
  '21-unterminated-quoted-include.azsl': [
    { line: 2, message: 'unterminated string literal in #include' }
  ],
  '22-unterminated-angle-include.azsl': [
    { line: 2, message: "unterminated header name in #include; expected '>'" }
  ],
  '23-missing-semicolon.azsl': [
    { line: 3, message: "missing ';' at end of statement" }
  ],
  '24-missing-call-parenthesis.azsl': [
    { line: 4, message: "unclosed '('; expected ')' before '}'" }
  ],
  '25-missing-function-brace.azsl': [
    { line: 3, message: "unclosed '{'; expected '}' before end of file" }
  ],
  '26-unexpected-closing-brace.azsl': [
    { line: 2, message: "unexpected '}' with no matching '{'" }
  ],
  '38-unterminated-conditional.azsl': [
    { line: 1, message: "unterminated '#if' directive; expected '#endif'" }
  ],
  '39-macro-argument-count.azsl': [
    { line: 4, message: "macro 'ADD_VALUES' expects 2 arguments, got 1" }
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
  headersPathIndex.set('Atom/Features/SrgSemantics.azsli', 'C:\\fixtures\\Atom\\Features\\SrgSemantics.azsli');
});

describe('second differential compiler corpus', () => {
  test('contains AZERR21 through AZERR40 exactly once', () => {
    const allText = fs.readdirSync(fixtureDirectory)
      .filter(name => name.endsWith('.azsl'))
      .map(name => fs.readFileSync(path.join(fixtureDirectory, name), 'utf8'))
      .join('\n');
    const markers = [...allText.matchAll(/AZERR(\d{2})/g)].map(match => Number(match[1])).sort((a, b) => a - b);
    expect(markers).toEqual(Array.from({ length: 20 }, (_, index) => index + 21));
  });

  for (const fixtureName of fs.readdirSync(fixtureDirectory).filter(name => name.endsWith('.azsl')).sort()) {
    test(fixtureName, () => {
      const fixturePath = path.join(fixtureDirectory, fixtureName);
      const collection = new TestDiagnosticCollection();
      validateDocument(new TestDocument(fs.readFileSync(fixturePath, 'utf8'), fixturePath) as never, collection as never);

      const result = collection.diagnostics.map(diagnostic => ({
        line: diagnostic.range.start.line + 1,
        message: diagnostic.message
      }));
      expect(result).toEqual(expectedDiagnostics[fixtureName] ?? []);
    });
  }
});
