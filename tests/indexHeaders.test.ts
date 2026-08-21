import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { indexHeaders, type IndexHeadersState } from '../src/indexer/indexHeaders';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function emptyState(): IndexHeadersState {
  return {
    indexedSymbols: new Set(),
    headersPathIndex: new Map(),
    headersBasenameIndex: new Map(),
    macroIndex: new Map(),
    atomMethodIndex: new Map(),
    atomTypeMembers: new Map(),
    srgSemanticIndex: new Map(),
    srgMembers: new Map(),
    srgMemberIndex: new Map(),
    srgIndex: new Map(),
    structIndex: new Map(),
    structMembers: new Map(),
    functionIndex: new Map(),
    optionIndex: new Map(),
    fileTextCache: new Map()
  };
}

describe('header indexing orchestration', () => {
  test('indexes a representative Atom/ShaderKit fixture tree end to end', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'azsl-index-'));
    roots.push(root);
    mkdirSync(path.join(root, 'Atom', 'RPI'), { recursive: true });
    writeFileSync(path.join(root, 'Atom', 'RPI', 'Common.azsli'), `
// Feature switch.
#define ENABLE_FEATURE 1
ShaderResourceGroupSemantic SRG_Custom { FrequencyId = 9; }
struct VertexData { float3 position; float2 uv; };
float3 TransformPosition(float3 value) { return value; }
`);
    writeFileSync(path.join(root, 'Material.azsl'), `
#include <Atom/RPI/Common.azsli>
option bool o_feature = true;
ShaderResourceGroup MaterialSrg : SRG_PerMaterial
{
    Texture2D<float4> m_color;
};
`);

    const state = emptyState();
    const logs: string[] = [];
    const qualityIndexer = vi.fn(async () => undefined);
    await indexHeaders(root, 7, {
      state,
      debugLog: message => logs.push(message),
      getCurrentHeaderIndexToken: () => 7,
      getProgressReport: () => null,
      getLastProgressAt: () => 0,
      setLastProgressAt: () => undefined,
      indexShaderQualityMacros: qualityIndexer
    });

    expect(state.headersPathIndex.size).toBe(2);
    expect(state.headersBasenameIndex.get('Common.azsli')).toHaveLength(1);
    expect(state.macroIndex.get('ENABLE_FEATURE')?.value).toBe('1');
    expect(state.srgSemanticIndex.has('SRG_Custom')).toBe(true);
    expect(state.srgMembers.get('MaterialSrg')).toEqual(new Set(['m_color']));
    expect(state.structMembers.get('VertexData')).toEqual(new Set(['position', 'uv']));
    expect(state.functionIndex.has('TransformPosition')).toBe(true);
    expect(state.optionIndex.get('o_feature')?.isStatic).toBe(false);
    expect(qualityIndexer).toHaveBeenCalledOnce();
    expect(logs.some(message => message.includes('Indexing complete: 2 files'))).toBe(true);
  });

  test('cancels before reading files when a newer indexing token exists', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'azsl-index-'));
    roots.push(root);
    writeFileSync(path.join(root, 'Canceled.azsl'), '#define SHOULD_NOT_APPEAR 1');
    const state = emptyState();
    const report = vi.fn();
    const qualityIndexer = vi.fn(async () => undefined);

    await indexHeaders(root, 1, {
      state,
      getCurrentHeaderIndexToken: () => 2,
      getProgressReport: () => report,
      getLastProgressAt: () => 0,
      setLastProgressAt: () => undefined,
      indexShaderQualityMacros: qualityIndexer
    });

    expect(state.macroIndex.has('SHOULD_NOT_APPEAR')).toBe(false);
    expect(report).toHaveBeenCalledWith('Canceled');
    expect(qualityIndexer).not.toHaveBeenCalled();
  });
});
