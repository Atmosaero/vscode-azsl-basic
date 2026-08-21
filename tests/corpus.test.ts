import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { describe, expect, test } from 'vitest';

import { walkDirCollect } from '../src/indexer/fsWalk';
import { extractAtomMethods } from '../src/indexer/parsers/atom';
import { extractFunctionDeclarations } from '../src/indexer/parsers/functions';
import { extractMacrosWithComments } from '../src/indexer/parsers/macros';
import { extractOptionDeclarations } from '../src/indexer/parsers/options';
import { extractSrgDeclarations, extractSrgSemantics } from '../src/indexer/parsers/srg';
import { extractStructDeclarations } from '../src/indexer/parsers/structs';
import { extractSymbolsFromText } from '../src/indexer/parsers/symbols';

const roots = (process.env.AZSL_TEST_CORPUS_ROOTS ?? '')
  .split(path.delimiter)
  .map(root => root.trim())
  .filter(Boolean);

describe.skipIf(roots.length === 0)('real shader corpus', () => {
  for (const root of roots) {
    test(`parses every shader below ${root}`, () => {
      const files = walkDirCollect(root, 20_000);
      const totals = { symbols: 0, macros: 0, methods: 0, semantics: 0, srgs: 0, structs: 0, functions: 0, options: 0 };

      for (const file of files) {
        const text = readFileSync(file, 'utf8');
        totals.symbols += extractSymbolsFromText(text).size;
        totals.macros += extractMacrosWithComments(text).length;
        totals.methods += extractAtomMethods(text, file).methods.length / 2;
        totals.semantics += extractSrgSemantics(text, file).length;
        totals.srgs += extractSrgDeclarations(text, file).srgInfo.size;
        totals.structs += extractStructDeclarations(text, file).structs.size;
        totals.functions += extractFunctionDeclarations(text, file).size;
        totals.options += extractOptionDeclarations(text, file).size;
      }

      console.info(`[AZSL corpus] ${root}: ${files.length} files ${JSON.stringify(totals)}`);
      expect(files.length).toBeGreaterThan(0);
      expect(totals.symbols).toBeGreaterThan(0);
    });
  }
});
