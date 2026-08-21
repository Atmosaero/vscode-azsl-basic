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
  // Validation intentionally remains disabled until at least one header has
  // been indexed. Seed that lifecycle precondition without coupling tests to
  // an external checkout.
  headersPathIndex.set('Atom/Test.azsli', 'C:\\fixtures\\Atom\\Test.azsli');
});

function diagnosticsFor(text: string): Diagnostic[] {
  const collection = new TestDiagnosticCollection();
  validateDocument(new TestDocument(text) as never, collection as never);
  return collection.diagnostics;
}

describe('modern Unlit diagnostics', () => {
  test('does not apply unrelated indexed options to the current shader', () => {
    optionIndex.set('o_unrelated_feature', {
      uri: new TestDocument('').uri,
      line: 0,
      isStatic: false
    });

    const diagnostics = diagnosticsFor(`
struct VertexShaderInput { float3 m_position : POSITION; };
struct VertexShaderOutput { float4 m_position : SV_Position; };

VertexShaderOutput MainVS(VertexShaderInput IN, uint instanceId : SV_InstanceID)
{
    VertexShaderOutput OUT;
    OUT.m_position = float4(IN.m_position, 1.0);
    return OUT;
}

ForwardPassOutput MainPS(VertexShaderOutput IN)
{
    ForwardPassOutput OUT = (ForwardPassOutput)0;
    const float4 baseColor = float4(1.0, 1.0, 1.0, 1.0);
    OUT.m_diffuseColor = float4(baseColor.rgb, -1.0);
    OUT.m_specularColor = float4(0.0, 0.0, 0.0, 0.0);
    return OUT;
}
`);

    expect(diagnostics.map(diagnostic => diagnostic.message)).not.toContain(
      'If you have non-static options, one SRG must be designated as the default ShaderVariantFallback'
    );
  });

  test('requires a fallback SRG for a non-static option declared by this shader', () => {
    const diagnostics = diagnosticsFor(`
option bool o_local_feature = true;
ShaderResourceGroup MaterialSrg : SRG_PerMaterial
{
    float4 m_color;
}
`);

    expect(diagnostics.map(diagnostic => diagnostic.message)).toContain(
      'If you have non-static options, one SRG must be designated as the default ShaderVariantFallback'
    );
  });

  test('accepts a local option when a fallback SRG is present', () => {
    const diagnostics = diagnosticsFor(`
option TextureBlendMode o_blend = TextureBlendMode::Multiply;
ShaderResourceGroup DrawSrg : SRG_PerDraw
{
    float4 m_color;
}
`);

    expect(diagnostics.map(diagnostic => diagnostic.message)).not.toContain(
      'If you have non-static options, one SRG must be designated as the default ShaderVariantFallback'
    );
  });

  test('keeps IN/OUT function scopes stable around misleading braces', () => {
    const diagnostics = diagnosticsFor(`
struct VertexInput { float3 m_position : POSITION; };
struct VertexOutput { float4 m_position : SV_Position; };
VertexOutput MainVS(VertexInput IN)
{
    /* This brace must not close MainVS: } */
    #define GENERATED_SCOPE }
    VertexOutput OUT;
    OUT.m_position = float4(IN.m_position, 1.0);
    return OUT;
}
`);

    expect(diagnostics.map(diagnostic => diagnostic.message)).toEqual([]);
  });
});

describe('Wireframe geometry-stage diagnostics', () => {
  test('accepts geometry attributes, stream types and derivative intrinsics', () => {
    const diagnostics = diagnosticsFor(`
ShaderResourceGroup WireframeSrg : SRG_PerMaterial
{
    float3 m_gridColor;
    float m_gridThickness;
    float m_glowStrength;
}

struct VertexShaderOutput
{
    float4 m_position : SV_Position;
    float3 m_worldPos : TEXCOORD0;
    float3 m_normal : TEXCOORD1;
};

struct GeometryOutput
{
    float4 m_position : SV_Position;
    float3 m_barycentric : TEXCOORD2;
};

[maxvertexcount(3)]
void MainGS(triangle VertexShaderOutput IN[3], inout TriangleStream<GeometryOutput> triStream)
{
    [unroll]
    for (uint i = 0; i < 3; ++i)
    {
        GeometryOutput OUT;
        OUT.m_position = IN[i].m_position;
        OUT.m_barycentric = float3(1.0, 0.0, 0.0);
        triStream.Append(OUT);
    }
}

ForwardPassOutput MainPS(GeometryOutput IN)
{
    ForwardPassOutput OUT;
    float edgeValue = min(IN.m_barycentric.x, IN.m_barycentric.y);
    float edgeDerivative = fwidth(edgeValue);
    float alpha = saturate(edgeDerivative);
    clip(alpha - 1e-4);
    OUT.m_diffuseColor = float4(WireframeSrg::m_gridColor, alpha);
    return OUT;
}
`);

    expect(diagnostics.map(diagnostic => diagnostic.message)).toEqual([]);
  });

  test('still reports an invalid Wireframe SRG member', () => {
    const diagnostics = diagnosticsFor(`
ShaderResourceGroup WireframeSrg : SRG_PerMaterial
{
    float m_gridThickness;
}
float MainPS()
{
    return WireframeSrg::m_missingThickness;
}
`);

    expect(diagnostics.map(diagnostic => diagnostic.message)).toContain(
      "no member named 'm_missingThickness' in SRG 'WireframeSrg'"
    );
  });
});

describe('syntax regression diagnostics', () => {
  test('accepts multiline expressions, SRG sampler blocks and array members', () => {
    const diagnostics = diagnosticsFor(`
ShaderResourceGroup TestSrg : SRG_PerMaterial
{
    Texture2D<float4> m_texture;
    Sampler m_sampler
    {
        AddressU = Wrap;
        AddressV = Wrap;
        MinFilter = Linear;
        MagFilter = Linear;
        MipFilter = Linear;
    };
}
struct Output
{
    float2 m_uvs[2] : TEXCOORD0;
};
float Resolve(Output input, float scale = 1.0)
{
    float value = lerp(
        input.m_uvs[0].x,
        input.m_uvs[1].y,
        scale);
    return TestSrg::m_texture.Sample(TestSrg::m_sampler, input.m_uvs[0]).r + value;
}
float MainPS(Output input) : SV_Target0
{
    return Resolve(input);
}
`);
    expect(diagnostics.map(diagnostic => diagnostic.message)).toEqual([]);
  });

  test.each([
    ['float4 value;\nvalue.;', "syntax error: unexpected ';' after '.'"],
    ['float4 value;\nvalue..x;', "syntax error: unexpected '.' after '.'"],
    ['ShaderResourceGroup Srg : SRG_PerMaterial { float x; }\nSrg::;', "syntax error: unexpected ';' after '::'"]
  ])('reports malformed member access in %s', (text, expected) => {
    expect(diagnosticsFor(text).map(diagnostic => diagnostic.message)).toContain(expected);
  });
});
