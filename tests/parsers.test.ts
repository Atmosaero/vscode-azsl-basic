import { describe, expect, test } from 'vitest';

import { extractAtomMethods } from '../src/indexer/parsers/atom';
import { extractFunctionDeclarations } from '../src/indexer/parsers/functions';
import { extractMacrosWithComments } from '../src/indexer/parsers/macros';
import { extractOptionDeclarations } from '../src/indexer/parsers/options';
import { extractSrgDeclarations, extractSrgSemantics } from '../src/indexer/parsers/srg';
import { extractStructDeclarations } from '../src/indexer/parsers/structs';
import { extractSymbolsFromText } from '../src/indexer/parsers/symbols';

const fixturePath = 'C:\\fixtures\\shader.azsli';

describe('macro parser', () => {
  test('separates values from inline documentation and preserves preceding comments', () => {
    const parsed = extractMacrosWithComments(`
// Enables the modern path.
#define ENABLE_MODERN 1 // Used by Unlit

/* Block documentation. */
#define EMPTY_MACRO
`);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ name: 'ENABLE_MODERN', value: '1', line: 2, doc: 'Enables the modern path.\nUsed by Unlit' });
    expect(parsed[1]).toMatchObject({ name: 'EMPTY_MACRO', value: '', line: 5, doc: 'Block documentation.' });
  });

  test('does not index the same guarded define twice', () => {
    const parsed = extractMacrosWithComments(`
#ifndef SHADER_GUARD
#define SHADER_GUARD 1
#endif
`);

    expect(parsed.filter(macro => macro.name === 'SHADER_GUARD')).toHaveLength(1);
  });
});

describe('declaration parsers', () => {
  test('recognizes both AZSL static option spellings', () => {
    const parsed = extractOptionDeclarations(`
option bool o_enabled = true;
option static uint o_count = 2;
static option int o_mode = 0;
`, fixturePath);

    expect([...parsed.keys()]).toEqual(['o_enabled', 'o_count', 'o_mode']);
    expect(parsed.get('o_enabled')?.isStatic).toBe(false);
    expect(parsed.get('o_count')?.isStatic).toBe(true);
    expect(parsed.get('o_mode')?.isStatic).toBe(true);
  });

  test('recognizes user-defined and inline/multiline enum options used by Atom', () => {
    const parsed = extractOptionDeclarations(`
option TextureBlendMode o_blend = TextureBlendMode::Multiply;
option enum class FogMode { Linear, Exponential } o_fogMode = FogMode::Linear;
option enum class ImageType
{
    Image2D,
    Image2DArray
} o_imageType;
`, fixturePath);

    expect([...parsed.keys()]).toEqual(['o_blend', 'o_fogMode', 'o_imageType']);
    expect(parsed.get('o_imageType')?.line).toBe(7);
  });

  test('stops a next-line-brace class before subsequent global functions', () => {
    const parsed = extractFunctionDeclarations(`
class Helpers
{
    float Member(float value);
};

float Global(float value)
{
    return value;
}
`, fixturePath);

    expect([...parsed.keys()]).toEqual(['Global']);
  });

  test('does not leak SRG members past the closing brace', () => {
    const parsed = extractSrgDeclarations(`
ShaderResourceGroup MaterialSrg : SRG_PerMaterial
{
    Texture2D<float4> m_baseColor;
    Sampler m_sampler;
};

float4 outsideTheSrg;
`, fixturePath);

    expect([...parsed.srgInfo.get('MaterialSrg')!.members]).toEqual(['m_baseColor', 'm_sampler']);
    expect(parsed.memberLocations.has('MaterialSrg::outsideTheSrg')).toBe(false);
  });

  test('handles an SRG opening brace on its declaration line', () => {
    const parsed = extractSrgDeclarations(`
ShaderResourceGroup ObjectSrg : SRG_PerObject {
    float4x4 m_modelToWorld;
};
float4 outsideTheSrg;
`, fixturePath);

    expect([...parsed.srgInfo.get('ObjectSrg')!.members]).toEqual(['m_modelToWorld']);
  });

  test('does not leak struct members past the closing brace', () => {
    const parsed = extractStructDeclarations(`
struct VertexInput
{
    float3 position : POSITION;
    float2 uv : TEXCOORD0;
};

float4 outsideTheStruct;
`, fixturePath);

    expect([...parsed.members.get('VertexInput')!]).toEqual(['position', 'uv']);
    expect(parsed.members.get('VertexInput')!.has('outsideTheStruct')).toBe(false);
  });

  test('handles a multiline struct whose opening brace is on its declaration line', () => {
    const parsed = extractStructDeclarations(`
struct VertexOutput {
    float4 position : SV_Position;
};
float4 outsideTheStruct;
`, fixturePath);

    expect([...parsed.members.get('VertexOutput')!]).toEqual(['position']);
  });

  test('indexes array members in multiline structs', () => {
    const parsed = extractStructDeclarations(`
struct VertexOutput
{
    float4 position : SV_Position;
    float2 uvs[2] : TEXCOORD0;
};
`, fixturePath);

    expect([...parsed.members.get('VertexOutput')!]).toEqual(['position', 'uvs']);
  });

  test('indexes SRG semantics and single-line structs', () => {
    expect(extractSrgSemantics('ShaderResourceGroupSemantic SRG_Custom { FrequencyId = 7; }', fixturePath)[0]).toMatchObject({
      name: 'SRG_Custom',
      line: 0
    });

    const parsed = extractStructDeclarations('struct Output { float4 color : SV_Target0; float depth : SV_Depth; };', fixturePath);
    expect([...parsed.members.get('Output')!]).toEqual(['color', 'depth']);
  });
});

describe('Atom surface parser', () => {
  test('indexes supported surface aliases without leaking methods after the class', () => {
    const parsed = extractAtomMethods(`
struct SurfaceData_StandardPBR
{
    float3 baseColor;
    float alpha;
    void ApplyBaseColor(float3 value);
};

float NotASurfaceMethod(float value);
`, fixturePath);

    expect(parsed.properties.get('Surface')).toEqual(new Set(['baseColor']));
    expect(parsed.methods.map(method => method.key)).toEqual(['Surface::ApplyBaseColor', 'Surface.ApplyBaseColor']);
  });
});

describe('symbol extraction', () => {
  test('collects AZSL semantics, attributes, intrinsics and option names', () => {
    const symbols = extractSymbolsFromText(`
[[vk::binding(0, 1)]]
[unroll]
float4 Main() : SV_Target0 { return Texture.Sample(SamplerState, uv); }
option bool o_enabled = true;
`);

    expect(symbols).toEqual(expect.objectContaining(new Set(['[[vk::binding(0, 1)]]', 'unroll', 'SV_Target0', 'Sample', 'o_enabled'])));
  });
});
