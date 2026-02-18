import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { walkDirIter } from './fsWalk';
import { resetIndexState } from './reset';
import * as defaultState from './state';
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

import { extractSymbolsFromText } from './parsers/symbols';
import { extractMacrosWithComments } from './parsers/macros';
import { extractAtomMethods } from './parsers/atom';
import { extractSrgDeclarations, extractSrgSemantics } from './parsers/srg';
import { extractStructDeclarations } from './parsers/structs';
import { extractFunctionDeclarations } from './parsers/functions';
import { extractOptionDeclarations } from './parsers/options';

export type HeaderIndexProgressReport = ((msg: string) => void) | null;

export type IndexHeadersState = {
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

export type IndexHeadersEnv = {
  debugLog?: (msg: string) => void;
  getCurrentHeaderIndexToken: () => number;
  getProgressReport: () => HeaderIndexProgressReport;
  getLastProgressAt: () => number;
  setLastProgressAt: (value: number) => void;
  indexShaderQualityMacros: () => Promise<void>;
  state?: IndexHeadersState;
};

export async function indexHeaders(rootPath: string, token: number | undefined, env: IndexHeadersEnv): Promise<void> {
  const st: IndexHeadersState = env.state ?? {
    indexedSymbols: defaultState.indexedSymbols,
    headersPathIndex: defaultState.headersPathIndex,
    headersBasenameIndex: defaultState.headersBasenameIndex,
    macroIndex: defaultState.macroIndex,
    atomMethodIndex: defaultState.atomMethodIndex,
    atomTypeMembers: defaultState.atomTypeMembers,
    srgSemanticIndex: defaultState.srgSemanticIndex,
    srgMembers: defaultState.srgMembers,
    srgMemberIndex: defaultState.srgMemberIndex,
    srgIndex: defaultState.srgIndex,
    structIndex: defaultState.structIndex,
    structMembers: defaultState.structMembers,
    functionIndex: defaultState.functionIndex,
    optionIndex: defaultState.optionIndex,
    fileTextCache: defaultState.fileTextCache
  };

  const {
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
  } = st;

  try {
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
  } catch {
    indexedSymbols.clear();
    headersPathIndex.clear();
    headersBasenameIndex.clear();
    macroIndex.clear();
    atomMethodIndex.clear();
    atomTypeMembers.clear();
    srgSemanticIndex.clear();
    srgMembers.clear();
    srgMemberIndex.clear();
    srgIndex.clear();
    structIndex.clear();
    structMembers.clear();
    functionIndex.clear();
    optionIndex.clear();
    fileTextCache.clear();

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
      srgSemanticIndex.set(semantic, {
        uri: vscode.Uri.parse('azsl-builtin://srg-semantics'),
        line: 0
      });
    }

    atomTypeMembers.set(
      'Surface',
      new Set(['CalculateRoughnessA', 'SetAlbedoAndSpecularF0', 'GetDefaultNormal', 'GetSpecularF0'])
    );
    atomTypeMembers.set(
      'LightingData',
      new Set(['Init', 'FinalizeLighting', 'CalculateMultiscatterCompensation', 'GetSpecularNdotV'])
    );
  }

  if (!rootPath || !fs.existsSync(rootPath)) {
    return;
  }

  let srgiCount = 0;
  let fileCount = 0;

  for await (const f of walkDirIter(rootPath)) {
    if (token !== undefined && token !== env.getCurrentHeaderIndexToken()) {
      env.debugLog?.('Indexing canceled (new request received)');
      const report = env.getProgressReport();
      if (report) {
        report('Canceled');
      }
      return;
    }

    fileCount++;
    const report = env.getProgressReport();
    if (report && fileCount - env.getLastProgressAt() >= 50) {
      env.setLastProgressAt(fileCount);
      report(`${fileCount} files...`);
    }

    if (fileCount % 25 === 0) {
      await new Promise<void>(resolve => setImmediate(resolve));
    }

    try {
      if (f.toLowerCase().endsWith('.srgi')) {
        srgiCount++;
        env.debugLog?.(`Processing .srgi file: ${path.relative(rootPath, f)}`);
      }

      const buf = await fs.promises.readFile(f, 'utf8');

      const syms = extractSymbolsFromText(buf);
      syms.forEach(s => indexedSymbols.add(s));

      const defs = extractMacrosWithComments(buf);
      for (const d of defs) {
        const existing = macroIndex.get(d.name);
        if (!existing || (d.doc && (!existing.doc || existing.doc.length < d.doc.length))) {
          macroIndex.set(d.name, {
            value: d.value,
            doc: d.doc || '',
            uri: vscode.Uri.file(f),
            line: d.line
          });
        }
      }

      const atomData = extractAtomMethods(buf, f);
      const methods = atomData.methods || [];
      const properties = atomData.properties || new Map<string, Set<string>>();

      for (const m of methods) {
        atomMethodIndex.set(m.key, {
          uri: m.uri,
          line: m.line,
          column: m.column
        });
      }

      for (const [atomType, propSet] of properties.entries()) {
        if (!atomTypeMembers.has(atomType)) {
          atomTypeMembers.set(atomType, new Set<string>());
        }
        const existing = atomTypeMembers.get(atomType)!;
        for (const prop of propSet) {
          existing.add(prop);
        }
      }

      const srgSemantics = extractSrgSemantics(buf, f);
      for (const srg of srgSemantics) {
        srgSemanticIndex.set(srg.name, {
          uri: srg.uri,
          line: srg.line
        });
        env.debugLog?.(`Indexed SRG semantic: ${srg.name} -> ${path.basename(f)}:${srg.line + 1}`);
      }

      const srgDecls = extractSrgDeclarations(buf, f);
      for (const [srgName, srgInfo] of srgDecls.srgInfo.entries()) {
        if (!srgIndex.has(srgName)) {
          srgIndex.set(srgName, {
            uri: srgInfo.uri,
            line: srgInfo.line
          });
          env.debugLog?.(`Indexed SRG: ${srgName} -> ${path.basename(f)}:${srgInfo.line + 1}`);
        }
        if (!srgMembers.has(srgName)) {
          srgMembers.set(srgName, new Set<string>());
        }
        const existingMembers = srgMembers.get(srgName)!;
        for (const member of srgInfo.members) {
          existingMembers.add(member);
        }
      }

      for (const [memberKey, memberInfo] of srgDecls.memberLocations.entries()) {
        if (!srgMemberIndex.has(memberKey)) {
          srgMemberIndex.set(memberKey, memberInfo);
          env.debugLog?.(`Indexed SRG member: ${memberKey} -> ${path.basename(f)}:${memberInfo.line + 1}`);
        }
      }

      const structDecls = extractStructDeclarations(buf, f);
      for (const [structName, structInfo] of structDecls.structs.entries()) {
        if (!structIndex.has(structName)) {
          structIndex.set(structName, {
            uri: structInfo.uri,
            line: structInfo.line
          });
          env.debugLog?.(`Indexed struct: ${structName} -> ${path.basename(f)}:${structInfo.line + 1}`);
        }
        if (!structMembers.has(structName)) {
          structMembers.set(structName, new Set<string>());
        }
        const existingMembers = structMembers.get(structName)!;
        const members = structDecls.members.get(structName);
        if (members) {
          for (const member of members) {
            existingMembers.add(member);
          }
          env.debugLog?.(`Indexed ${members.size} members for struct: ${structName}`);
        }
      }

      const funcDecls = extractFunctionDeclarations(buf, f);
      for (const [funcName, funcInfo] of funcDecls.entries()) {
        if (!functionIndex.has(funcName)) {
          functionIndex.set(funcName, {
            uri: funcInfo.uri,
            line: funcInfo.line,
            column: funcInfo.column
          });
          env.debugLog?.(`Indexed function: ${funcName} -> ${path.basename(f)}:${funcInfo.line + 1}`);
        }
      }

      const optionDecls = extractOptionDeclarations(buf, f);
      for (const [optionName, optionInfo] of optionDecls.entries()) {
        if (!optionIndex.has(optionName)) {
          optionIndex.set(optionName, {
            uri: optionInfo.uri,
            line: optionInfo.line,
            isStatic: optionInfo.isStatic
          });
          env.debugLog?.(
            `Indexed option: ${optionName} (static: ${optionInfo.isStatic}) -> ${path.basename(f)}:${optionInfo.line + 1}`
          );
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      env.debugLog?.(`Error indexing ${path.basename(f)}: ${msg}`);
    }

    const rel = path.relative(rootPath, f).split(path.sep).join('/');
    headersPathIndex.set(rel, f);

    const base = path.basename(f);
    const list = headersBasenameIndex.get(base) || [];
    list.push(f);
    headersBasenameIndex.set(base, list);
  }

  await env.indexShaderQualityMacros();

  env.debugLog?.(
    `Indexing complete: ${fileCount} files (${srgiCount} .srgi files), ${atomMethodIndex.size / 2} methods, ${macroIndex.size} macros`
  );

  const report = env.getProgressReport();
  if (report) {
    report(`Done (${fileCount} files)`);
  }

  env.debugLog?.(`SRG indexing: ${srgIndex.size} SRGs, ${srgMemberIndex.size} members`);
  for (const [srgName] of srgIndex.entries()) {
    const members = srgMembers.get(srgName);
    env.debugLog?.(`  ${srgName}: ${members ? members.size : 0} members`);
  }
}
