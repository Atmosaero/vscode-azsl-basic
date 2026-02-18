import * as path from 'path';
import * as vscode from 'vscode';

import { debugLog } from '../logger';
import {
  atomMethodIndex,
  functionIndex,
  macroIndex,
  srgIndex,
  srgMemberIndex,
  srgMembers,
  srgSemanticIndex,
  structIndex
} from '../indexer/state';
import { extractStructDeclarations } from '../indexer/parsers/structs';
import { builtinDocs } from './builtinDocs';

const wordPattern = /[A-Za-z_][A-Za-z0-9_]*/;

export function provideMacroDefinition(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Definition> {
  const range = document.getWordRangeAtPosition(position, wordPattern);
  if (!range) return;
  const word = document.getText(range);
  const info = macroIndex.get(word);
  if (info) {
    return new vscode.Location(info.uri, new vscode.Position(info.line, 0));
  }
  return null;
}

export function provideBuiltinTypeDefinition(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Definition> {
  const range = document.getWordRangeAtPosition(position, wordPattern);
  if (!range) return;
  const word = document.getText(range);

  const textureTypes = new Set([
    'Texture2D',
    'Texture3D',
    'TextureCube',
    'Texture2DArray',
    'RWTexture2D',
    'RWTexture3D',
    'RWTexture1D',
    'Texture1D',
    'Texture2DMS'
  ]);
  const samplerTypes = new Set(['Sampler', 'SamplerState', 'SamplerComparisonState']);
  const bufferTypes = new Set(['StructuredBuffer', 'Buffer', 'RWStructuredBuffer', 'RWBuffer']);
  const samplerProperties = new Set([
    'MaxAnisotropy',
    'MinFilter',
    'MagFilter',
    'MipFilter',
    'ReductionType',
    'AddressU',
    'AddressV',
    'AddressW',
    'MinLOD',
    'MaxLOD'
  ]);
  const samplerValues = new Set(['Point', 'Linear', 'Wrap', 'Clamp', 'Mirror', 'Border', 'Filter']);

  if (textureTypes.has(word) || samplerTypes.has(word) || bufferTypes.has(word) || samplerProperties.has(word) || samplerValues.has(word)) {
    const doc = builtinDocs.get(word);
    if (doc) {
      const virtualUri = vscode.Uri.parse(`azsl-builtin://documentation/${word}.azsli`);
      return new vscode.Location(virtualUri, new vscode.Position(0, 0));
    }
  }

  return null;
}

export function provideSrgSemanticDefinition(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Definition> {
  const range = document.getWordRangeAtPosition(position, wordPattern);
  if (!range) return;
  const word = document.getText(range);
  if (word.startsWith('SRG_')) {
    const info = srgSemanticIndex.get(word);
    if (info) {
      return new vscode.Location(info.uri, new vscode.Position(info.line, 0));
    }
  }
  return null;
}

export function provideSrgMemberDefinition(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Definition> {
  const range = document.getWordRangeAtPosition(position, wordPattern);
  if (!range) return;

  const word = document.getText(range);
  const line = document.lineAt(position.line).text;
  const beforeCursor = line.substring(0, position.character);
  const afterWord = line.substring(range.end.character);

  debugLog(`SRG definition lookup: word="${word}", before="${beforeCursor}", afterWord="${afterWord}"`);
  debugLog(`srgIndex has keys: ${Array.from(srgIndex.keys()).join(', ')}`);
  debugLog(`srgMemberIndex has keys: ${Array.from(srgMemberIndex.keys()).slice(0, 10).join(', ')}...`);

  const srgMatch = beforeCursor.match(/([A-Za-z_][A-Za-z0-9_]*)\s*::\s*$/);
  if (srgMatch) {
    const srgName = srgMatch[1];
    debugLog(`SRG member access detected: ${srgName}::${word}`);

    const memberKey = `${srgName}::${word}`;
    const memberInfo = srgMemberIndex.get(memberKey);
    if (memberInfo) {
      debugLog(`Found member in index: ${memberKey}`);
      return new vscode.Location(memberInfo.uri, new vscode.Position(memberInfo.line, 0));
    }

    if (srgMembers.has(srgName)) {
      const members = srgMembers.get(srgName);
      if (members && members.has(word)) {
        debugLog(`Found member in srgMembers: ${memberKey}`);
        const virtualUri = vscode.Uri.parse(`azsl-builtin://srg/${srgName}/${word}.azsli`);
        return new vscode.Location(virtualUri, new vscode.Position(0, 0));
      }
    }

    debugLog(`Member not found: ${memberKey}`);
  }

  const srgNameMatch = afterWord.match(/^\s*::/);
  if (srgNameMatch && srgIndex.has(word)) {
    debugLog(`SRG name before :: detected: ${word}`);
    const srgInfo = srgIndex.get(word)!;
    return new vscode.Location(srgInfo.uri, new vscode.Position(srgInfo.line, 0));
  }

  if (srgIndex.has(word) && !beforeCursor.match(/[A-Za-z0-9_]$/) && !afterWord.match(/^\s*::/)) {
    debugLog(`Standalone SRG name detected: ${word}`);
    const srgInfo = srgIndex.get(word)!;
    return new vscode.Location(srgInfo.uri, new vscode.Position(srgInfo.line, 0));
  }

  debugLog(`No SRG definition found for: ${word}`);
  return null;
}

export function provideStructDefinition(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Definition> {
  const range = document.getWordRangeAtPosition(position, wordPattern);
  if (!range) return;

  const word = document.getText(range);
  if (word === 'StructuredBuffer' || word === 'Buffer' || word === 'RWStructuredBuffer' || word === 'RWBuffer') {
    return null;
  }

  const line = document.lineAt(position.line).text;
  const beforeWord = line.substring(0, range.start.character);
  const afterWord = line.substring(range.end.character);

  debugLog(`[structDef] ===== Struct definition lookup =====`);
  debugLog(`[structDef] word="${word}"`);
  debugLog(`[structDef] document: ${path.basename(document.uri.fsPath)}`);
  debugLog(`[structDef] position: line ${position.line + 1}, char ${position.character}`);
  debugLog(`[structDef] beforeWord="${beforeWord}", afterWord="${afterWord}"`);

  const text = document.getText();
  debugLog(`[structDef] Extracting structs from current document: ${path.basename(document.uri.fsPath)}`);
  const currentDocStructs = extractStructDeclarations(text, document.uri.fsPath);
  debugLog(`[structDef] Current document structs found: ${Array.from(currentDocStructs.structs.keys()).join(', ')}`);
  debugLog(`[structDef] Checking if "${word}" is in current document structs: ${currentDocStructs.structs.has(word)}`);

  if (currentDocStructs.structs.has(word)) {
    const localStructInfo = currentDocStructs.structs.get(word)!;
    debugLog(`[structDef] ✓ Found struct in current document: ${word} -> ${path.basename(document.uri.fsPath)}:${localStructInfo.line + 1}`);
    debugLog(`[structDef] Returning location: ${document.uri.fsPath}:${localStructInfo.line + 1}`);
    return new vscode.Location(document.uri, new vscode.Position(localStructInfo.line, 0));
  }

  debugLog(`[structDef] ✗ Struct "${word}" NOT found in current document, will check structIndex`);
  debugLog(`[structDef] Struct "${word}" not found in current document, checking structIndex...`);
  debugLog(`[structDef] structIndex.has("${word}"): ${structIndex.has(word)}`);
  if (structIndex.has(word)) {
    const structInfo = structIndex.get(word)!;
    debugLog(`[structDef] structIndex entry for "${word}": ${path.basename(structInfo.uri.fsPath)}:${structInfo.line + 1}`);
  }

  const structuredBufferMatch = beforeWord.match(/StructuredBuffer\s*<\s*$/);
  const bufferMatch = beforeWord.match(/\bBuffer\s*<\s*$/);
  if (structuredBufferMatch || bufferMatch) {
    debugLog(`[structDef] Template type detected: ${word} in ${structuredBufferMatch ? 'StructuredBuffer' : 'Buffer'}`);
    const structInfo = structIndex.get(word);
    if (structInfo) {
      debugLog(`[structDef] Found struct in index: ${word} -> ${structInfo.uri.fsPath}:${structInfo.line + 1}`);
      return new vscode.Location(structInfo.uri, new vscode.Position(structInfo.line, 0));
    }
    debugLog(`[structDef] Struct not found in index: ${word}`);
  }

  if (structIndex.has(word)) {
    debugLog(`[structDef] Standalone struct name detected: ${word}`);
    const structInfo = structIndex.get(word)!;
    debugLog(`[structDef] Returning definition from structIndex: ${path.basename(structInfo.uri.fsPath)}:${structInfo.line + 1}`);
    return new vscode.Location(structInfo.uri, new vscode.Position(structInfo.line, 0));
  }

  debugLog(`[structDef] No definition found for "${word}"`);
  return null;
}

export function provideFunctionDefinition(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Definition> {
  const range = document.getWordRangeAtPosition(position, wordPattern);
  if (!range) return;

  const funcName = document.getText(range);
  const lineText = document.lineAt(position.line).text;
  const funcStart = range.start.character;
  const beforeFunc = lineText.substring(0, funcStart);

  if (beforeFunc.match(/[A-Za-z_][A-Za-z0-9_]*\s*[\.:]\s*$/)) {
    return;
  }

  const afterFunc = lineText.substring(range.end.character);
  if (!afterFunc.trim().startsWith('(')) {
    return;
  }

  const funcInfo = functionIndex.get(funcName);
  if (funcInfo) {
    return new vscode.Location(funcInfo.uri, new vscode.Position(funcInfo.line, funcInfo.column || 0));
  }

  return null;
}

export function provideAtomMethodDefinition(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Definition> {
  const range = document.getWordRangeAtPosition(position, wordPattern);
  if (!range) return;

  const methodName = document.getText(range);
  const lineText = document.lineAt(position.line).text;
  const methodStart = range.start.character;
  const beforeMethod = lineText.substring(0, methodStart);
  const memberAccessMatch = beforeMethod.match(/([A-Za-z_][A-Za-z0-9_]*)\s*[\.:]\s*$/);

  if (!memberAccessMatch) {
    return;
  }

  const varName = memberAccessMatch[1];
  const atomTypes = new Set(['Surface', 'LightingData']);
  let varType: string | undefined;

  if (atomTypes.has(varName)) {
    varType = varName;
  } else {
    const text = document.getText();
    const lines = text.split(/\r?\n/);
    const variableTypes = new Map<string, string>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      const varDeclMatch = line.match(
        /\b(?:float(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix|Texture\w*|Sampler\w*|([A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;=]/
      );
      if (varDeclMatch && varDeclMatch[1] && varDeclMatch[2]) {
        const typeName = varDeclMatch[1];
        const vName = varDeclMatch[2];
        if (atomTypes.has(typeName)) {
          variableTypes.set(vName, typeName);
        }
      }
    }

    varType = variableTypes.get(varName);
    if (!varType) {
      return;
    }
  }

  const key1 = `${varType}.${methodName}`;
  const key2 = `${varType}::${methodName}`;
  const methodInfo = atomMethodIndex.get(key1) || atomMethodIndex.get(key2);

  if (!methodInfo) {
    return;
  }

  return new vscode.Location(methodInfo.uri, new vscode.Position(methodInfo.line, methodInfo.column));
}
