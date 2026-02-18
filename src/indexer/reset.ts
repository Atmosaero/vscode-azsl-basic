import * as vscode from 'vscode';

import type {
  AtomMethodInfo,
  FileTextCacheEntry,
  FunctionInfo,
  MacroInfo,
  OptionInfo,
  SrgInfo,
  SrgMemberInfo,
  SrgSemanticInfo,
  StructInfo
} from './state';

type ResetIndexStateArgs = {
  indexedSymbols: Set<string>;
  headersPathIndex: Map<string, string>;
  headersBasenameIndex: Map<string, string[]>;
  macroIndex: Map<string, MacroInfo>;
  atomMethodIndex: Map<string, AtomMethodInfo>;
  atomTypeMembers: Map<string, Set<string>>;
  srgSemanticIndex: Map<string, SrgSemanticInfo>;
  srgMembers: Map<string, Set<string>>;
  srgMemberIndex: Map<string, SrgMemberInfo>;
  srgIndex: Map<string, SrgInfo>;
  structIndex: Map<string, StructInfo>;
  structMembers: Map<string, Set<string>>;
  functionIndex: Map<string, FunctionInfo>;
  optionIndex: Map<string, OptionInfo>;
  fileTextCache: Map<string, FileTextCacheEntry>;
};

export function resetIndexState(args: ResetIndexStateArgs) {
  args.indexedSymbols.clear();
  args.headersPathIndex.clear();
  args.headersBasenameIndex.clear();
  args.macroIndex.clear();
  args.atomMethodIndex.clear();
  args.atomTypeMembers.clear();
  args.srgSemanticIndex.clear();
  args.srgMembers.clear();
  args.srgMemberIndex.clear();
  args.srgIndex.clear();
  args.structIndex.clear();
  args.structMembers.clear();
  args.functionIndex.clear();
  args.optionIndex.clear();
  args.fileTextCache.clear();

  const builtinSrgSemantics = [
    'SRG_PerDraw',
    'SRG_PerMaterial',
    'SRG_PerPass',
    'SRG_PerPass_WithFallback',
    'SRG_PerScene',
    'SRG_PerView',
    'SRG_PerSubMesh',
    'SRG_RayTracingGlobal',
    'SRG_RayTracingLocal'
  ];

  for (const semantic of builtinSrgSemantics) {
    args.srgSemanticIndex.set(semantic, {
      uri: vscode.Uri.parse('azsl-builtin://srg-semantics'),
      line: 0
    });
  }

  args.atomTypeMembers.set('Surface', new Set([
    'CalculateRoughnessA',
    'SetAlbedoAndSpecularF0',
    'GetDefaultNormal',
    'GetSpecularF0'
  ]));

  args.atomTypeMembers.set('LightingData', new Set([
    'Init',
    'FinalizeLighting',
    'CalculateMultiscatterCompensation',
    'GetSpecularNdotV'
  ]));
}
