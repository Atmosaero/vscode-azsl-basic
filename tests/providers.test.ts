import { EndOfLine, Position } from 'vscode';
import { describe, expect, test } from 'vitest';

import { provideDocumentFormattingEdits } from '../src/providers/formattingRuntime';
import { provideReferences } from '../src/providers/referencesRuntime';
import { provideSignatureHelp } from '../src/providers/signatureHelpRuntime';
import { provideDocumentSymbols } from '../src/providers/symbolsRuntime';
import { TestDocument } from './support/document';

const activeToken = { isCancellationRequested: false } as never;
const canceledToken = { isCancellationRequested: true } as never;

describe('formatter', () => {
  test('indents braces, preserves braces in comments/strings and pins directives to column zero', () => {
    const document = new TestDocument(`struct Output
{
float4 Main()
{
// } is not syntax
const char marker = '{';
return float4(1, 1, 1, 1);${'   '}
}
    #endif
};`);

    const edits = provideDocumentFormattingEdits(document as never, { insertSpaces: true, tabSize: 2 }, activeToken);
    expect(edits).toHaveLength(1);
    expect(edits[0].newText).toBe(`struct Output
{
  float4 Main()
  {
    // } is not syntax
    const char marker = '{';
    return float4(1, 1, 1, 1);
  }
#endif
};`);
  });

  test('preserves CRLF, returns no edit for formatted input, and honors cancellation', () => {
    const formatted = new TestDocument('struct A\r\n{\r\n\tfloat x;\r\n};');
    expect(formatted.eol).toBe(EndOfLine.CRLF);
    expect(provideDocumentFormattingEdits(formatted as never, { insertSpaces: false, tabSize: 4 }, activeToken)).toEqual([]);
    expect(provideDocumentFormattingEdits(formatted as never, { insertSpaces: false, tabSize: 4 }, canceledToken)).toEqual([]);
  });
});

describe('signature help', () => {
  test('selects the active argument while ignoring commas in nested calls', () => {
    const text = 'float value = lerp(a, mul(b, c), ';
    const document = new TestDocument(text);
    const help = provideSignatureHelp(document as never, document.positionAt(text.length), activeToken, {} as never);

    expect(help?.signatures[0].label).toBe('lerp(a, b, s)');
    expect(help?.activeParameter).toBe(2);
  });

  test('clamps excess arguments and ignores unknown functions/cancellation', () => {
    const known = new TestDocument('normalize(a, b, c');
    expect(provideSignatureHelp(known as never, known.positionAt(known.getText().length), activeToken, {} as never)?.activeParameter).toBe(0);

    const unknown = new TestDocument('CustomFunction(a');
    expect(provideSignatureHelp(unknown as never, unknown.positionAt(unknown.getText().length), activeToken, {} as never)).toBeNull();
    expect(provideSignatureHelp(known as never, new Position(0, 3), canceledToken, {} as never)).toBeNull();
  });

  test.each([
    ['fwidth(edgeValue', 'fwidth(x)'],
    ['clip(alpha - cutoff', 'clip(x)']
  ])('provides ShaderKit Wireframe help for %s', (text, expectedLabel) => {
    const document = new TestDocument(text);
    const help = provideSignatureHelp(document as never, document.positionAt(text.length), activeToken, {} as never);
    expect(help?.signatures[0].label).toBe(expectedLabel);
  });
});

describe('references', () => {
  test('finds whole identifier references without matching longer names', () => {
    const document = new TestDocument('value = value + valueExtra;\nreturn value;');
    const references = provideReferences(document as never, new Position(0, 2), { includeDeclaration: true }, activeToken);

    expect(references).toHaveLength(3);
    expect(references.map(location => location.range.start.line)).toEqual([0, 0, 1]);
  });

  test('finds qualified SRG references and stops on cancellation', () => {
    const document = new TestDocument('MaterialSrg::m_color = MaterialSrg::m_color;');
    const references = provideReferences(document as never, new Position(0, 14), { includeDeclaration: true }, activeToken);
    expect(references).toHaveLength(2);
    expect(provideReferences(document as never, new Position(0, 14), { includeDeclaration: true }, canceledToken)).toEqual([]);
  });
});

describe('document symbols', () => {
  test('uses option variable names rather than their types', () => {
    const document = new TestDocument(`
option bool o_enabled = true;
option TextureBlendMode o_blend = TextureBlendMode::Multiply;
option enum class Mode { A, B } o_mode;
float4 MainPS() { return 0; }
`);

    const symbols = provideDocumentSymbols(document as never, activeToken);
    expect(symbols.map(symbol => symbol.name)).toEqual(['o_enabled', 'o_blend', 'o_mode', 'MainPS']);
  });
});
