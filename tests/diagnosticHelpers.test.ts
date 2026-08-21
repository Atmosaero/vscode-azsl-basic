import { describe, expect, test } from 'vitest';

import { extractDiagnosticDeclarations } from '../src/providers/diagnostics/declarations';
import {
  extractFunctionCallArgs,
  getSwizzleProperties,
  inferExpressionType,
  isVectorType
} from '../src/providers/diagnostics/expressionTypes';
import { collectStructuralSyntaxIssues } from '../src/providers/diagnostics/structuralSyntax';
import { analyzeFunctionScopes, findFunctionScope } from '../src/providers/diagnostics/functionScopes';
import { scanLexicalLines } from '../src/providers/diagnostics/lexicalLines';
import { collectMemberAccessIssues } from '../src/providers/diagnostics/memberAccess';
import { collectFunctionCallIssues } from '../src/providers/diagnostics/functionCalls';
import { collectSourceSyntaxIssues } from '../src/providers/diagnostics/sourceSyntax';

describe('diagnostic declaration model', () => {
  test('collects geometry parameters, SRG types and struct members', () => {
    const model = extractDiagnosticDeclarations(`
ShaderResourceGroup MaterialSrg : SRG_PerMaterial
{
    Texture2D<float4> m_texture;
    Sampler m_sampler;
}
struct Output { float4 m_position : SV_Position; };
void MainGS(triangle Output IN[3], inout TriangleStream<Output> stream) {}
`);

    expect(model.declarations).toEqual(expect.objectContaining(new Set(['MaterialSrg', 'MaterialSrg::m_texture', 'MaterialSrg::m_sampler', 'Output', 'MainGS'])));
    expect(model.variableTypes.get('MaterialSrg::m_texture')).toBe('Texture2D');
    expect(model.variableTypes.get('MaterialSrg::m_sampler')).toBe('SamplerState');
    expect(model.structMemberTypes.get('Output')?.get('m_position')).toBe('float4');
  });
});

describe('diagnostic expression helpers', () => {
  test('splits nested function arguments', () => {
    expect(extractFunctionCallArgs('value + mul(matrix, float4(a, b, c, 1.0))', 'mul')).toEqual([
      'matrix',
      'float4(a, b, c, 1.0)'
    ]);
    expect(extractFunctionCallArgs('mul(matrix, value', 'mul')).toBeNull();
  });

  test('infers vector constructor and mul result types', () => {
    expect(inferExpressionType('float3(1, 2, 3)', () => null)).toBe('float3');
    expect(inferExpressionType('mul(matrix, vector)', name => (name === 'vector' ? 'real4' : null))).toBe('real4');
    expect(inferExpressionType('scalar + value', () => null)).toBeNull();
  });

  test('provides dimension-safe swizzles', () => {
    expect(isVectorType('float3')).toBe(true);
    expect(isVectorType('float4x4')).toBe(false);
    expect(getSwizzleProperties('float2')).toEqual(expect.arrayContaining(['x', 'y', 'r', 'g', 'xy', 'yx']));
    expect(getSwizzleProperties('float2')).toEqual(expect.arrayContaining(['xx', 'yyyy']));
    expect(getSwizzleProperties('float2')).not.toContain('z');
  });
});

describe('structural syntax collector', () => {
  test('ignores malformed-looking text in comments', () => {
    const issues = collectStructuralSyntaxIssues(['// value.;', 'float4 value; /* value..x */', '#define ACCESS value.;']);
    expect(issues).toEqual([]);
  });

  test('reports a dangling struct semantic at the next token', () => {
    const issues = collectStructuralSyntaxIssues(['struct Input', '{', '    float3 position :', '    float2 uv : TEXCOORD0;', '};']);
    expect(issues[0]).toMatchObject({ line: 3, message: "syntax error: no viable alternative at input 'float2' (float2 was unexpected)" });
  });
});

describe('source syntax collector', () => {
  test('reports unterminated includes and conditional directives', () => {
    const issues = collectSourceSyntaxIssues(`#include "Missing.azsli
#include <AlsoMissing.azsli
#if defined(ENABLED)
float Value() { return 1.0; }
`);
    expect(issues.map(issue => issue.message)).toEqual([
      'unterminated string literal in #include',
      "unterminated header name in #include; expected '>'",
      "unterminated '#if' directive; expected '#endif'"
    ]);
  });

  test('balances delimiters while ignoring comments, strings and directives', () => {
    const issues = collectSourceSyntaxIssues(`
#define CLOSE }
float4 Broken()
{
    const char marker = '}';
    // misleading: ] ) }
    return float4(1.0, 0.0, 0.0, 1.0;
}
`);
    expect(issues.map(issue => issue.message)).toEqual(["unclosed '('; expected ')' before '}'"]);
  });

  test('reports unexpected and end-of-file delimiters', () => {
    expect(collectSourceSyntaxIssues('}\nfloat Value(\n{').map(issue => issue.message)).toEqual([
      "unexpected '}' with no matching '{'",
      "unclosed '('; expected ')' before end of file",
      "unclosed '{'; expected '}' before end of file"
    ]);
  });

  test('validates unambiguous fixed-arity local macros', () => {
    const issues = collectSourceSyntaxIssues(`#define ADD(lhs, rhs) ((lhs) + (rhs))
float value = ADD(float2(1.0, 2.0).x);
`);
    expect(issues.map(issue => issue.message)).toEqual(["macro 'ADD' expects 2 arguments, got 1"]);
  });

  test('finds a missing semicolon before a trailing comment', () => {
    const issues = collectSourceSyntaxIssues('float value = 1.0 // missing semicolon\nreturn value;');
    expect(issues.map(issue => issue.message)).toEqual(["missing ';' at end of statement"]);
  });

  test('accepts balanced source and multiline expressions', () => {
    const issues = collectSourceSyntaxIssues(`#if defined(ENABLED)
#define MIX(a, b) ((a) + (b))
#endif
float4 Value()
{
    float4 value = float4(
        1.0, 0.0,
        0.0, 1.0);
    return value;
}
`);
    expect(issues).toEqual([]);
  });
});

describe('comment-safe function scopes', () => {
  test('ignores braces in comments, strings and preprocessor directives', () => {
    const text = `
VertexShaderOutput MainVS(VertexShaderInput IN)
{
    /* A misleading close: } */
    const char marker = "{";
    #define CLOSE_SCOPE }
    VertexShaderOutput OUT;
    return OUT;
}
float Outside() { return 1.0; }
`;
    const lexical = scanLexicalLines(text);
    expect(lexical[3]?.braceDelta).toBe(0);
    expect(lexical[4]?.braceDelta).toBe(0);
    expect(lexical[5]?.braceDelta).toBe(0);

    const scopes = analyzeFunctionScopes(text);
    expect(scopes).toEqual([
      {
        name: 'MainVS', startLine: 1, signatureEndLine: 1, endLine: 8,
        returnType: 'VertexShaderOutput', firstParamType: 'VertexShaderInput',
        parameters: [{ name: 'IN', type: 'VertexShaderInput', line: 1, hasDefault: false }]
      },
      {
        name: 'Outside', startLine: 9, signatureEndLine: 9, endLine: 9,
        returnType: 'float', firstParamType: null, parameters: []
      }
    ]);
    expect(findFunctionScope(scopes, 7)?.name).toBe('MainVS');
    expect(findFunctionScope(scopes, 10)).toBeNull();
  });

  test('understands geometry-stage parameter modifiers and stream templates', () => {
    const scopes = analyzeFunctionScopes(`
[maxvertexcount(3)]
void MainGS(triangle VertexOutput IN[3], inout TriangleStream<GeometryOutput> stream)
{
    stream.Append((GeometryOutput)0);
}
`);
    expect(scopes[0]).toMatchObject({ name: 'MainGS', returnType: 'void', firstParamType: 'VertexOutput', endLine: 5 });
  });

  test('collects parameters from a multiline geometry signature', () => {
    const scopes = analyzeFunctionScopes(`
void MainGS(
    triangle VertexOutput inputVertices[3],
    inout TriangleStream<GeometryOutput> outputStream)
{
    outputStream.Append((GeometryOutput)0);
}
`);
    expect(scopes[0]).toMatchObject({
      name: 'MainGS',
      signatureEndLine: 3,
      parameters: [
        { name: 'inputVertices', type: 'VertexOutput', line: 2 },
        { name: 'outputStream', type: 'TriangleStream<GeometryOutput>', line: 3 }
      ]
    });
  });
});

describe('member access collector', () => {
  test('validates struct chains, array roots and vector dimensions', () => {
    const members = new Map([
      ['Input', new Set(['m_uv'])],
      ['Vertex', new Set(['m_position'])]
    ]);
    const memberTypes = new Map([
      ['Input', new Map([['m_uv', 'float2']])],
      ['Vertex', new Map([['m_position', 'float4']])]
    ]);
    const types = new Map([
      ['input', 'Input'],
      ['vertices', 'Vertex'],
      ['output', 'ConditionalOutput'],
      ['uv', 'float2']
    ]);
    const issues = collectMemberAccessIssues([
      'input.m_uv.xy;',
      'input.m_uv.z;',
      'vertices[0].m_missing;',
      'output.m_alternateTarget;',
      'uv.xxxx;'
    ], {
      getVariableType: name => types.get(name) ?? null,
      getStructMembers: type => type === 'ConditionalOutput' ? new Set(['m_defaultTarget']) : members.get(type),
      getStructMemberType: (type, member) => memberTypes.get(type)?.get(member) ?? null,
      getAtomMembers: type => type === 'ConditionalOutput' ? new Set(['m_alternateTarget']) : undefined
    });
    expect(issues.map(issue => issue.message)).toEqual([
      "invalid swizzle property 'z' for type 'float2'",
      "no member named 'm_missing' in struct 'Vertex'"
    ]);
  });
});

describe('function call collector', () => {
  test('validates local arity, unknown calls and stream element types', () => {
    const text = `
float Add(float lhs, float rhs)
{
    return lhs + rhs;
}
float Optional(float value = 1.0)
{
    return value;
}
void Emit(inout TriangleStream<Output> stream, Input wrong)
{
    Add(1.0);
    Optional();
    MissingCall(1.0);
    stream.Append(wrong);
}
ExternalType DeclaredPrototype(
    Input value
);`.trim();
    const functions = analyzeFunctionScopes(text);
    const types = new Map([['stream', 'TriangleStream<Output>'], ['wrong', 'Input']]);
    const issues = collectFunctionCallIssues(text.split(/\r?\n/), {
      functions,
      isKnownFunction: name => functions.some(signature => signature.name === name) || name === 'float',
      getVariableType: name => types.get(name) ?? null
    });

    expect(issues.map(issue => issue.message)).toEqual([
      "no matching function for call to 'Add': expected 2 arguments, got 1",
      "use of undeclared function 'MissingCall'",
      "cannot append value of type 'Input' to 'TriangleStream<Output>'"
    ]);
  });
});
