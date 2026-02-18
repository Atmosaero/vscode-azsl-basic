import * as vscode from 'vscode';

import { macroIndex, structIndex } from '../indexer/state';

const tokenTypes = ['type', 'function', 'variable', 'parameter', 'property', 'method', 'modifier', 'macro'];
const tokenModifiers = ['declaration', 'definition', 'readonly', 'static'];

export const legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);

const TOKEN_TYPE = 0;
const TOKEN_FUNCTION = 1;
const TOKEN_VARIABLE = 2;
const TOKEN_PARAMETER = 3;
const TOKEN_PROPERTY = 4;
const TOKEN_METHOD = 5;
const TOKEN_MODIFIER = 6;
const TOKEN_MACRO = 7;

export function provideDocumentSemanticTokens(document: vscode.TextDocument): vscode.ProviderResult<vscode.SemanticTokens> {
  const builder = new vscode.SemanticTokensBuilder(legend);
  const text = document.getText();
  const lines = text.split(/\r?\n/);

  const builtinTypes = new Set([
    'float',
    'float2',
    'float3',
    'float4',
    'float2x2',
    'float3x3',
    'float4x4',
    'int',
    'int2',
    'int3',
    'int4',
    'uint',
    'uint2',
    'uint3',
    'uint4',
    'bool',
    'half',
    'double',
    'void',
    'matrix',
    'Texture2D',
    'Texture3D',
    'TextureCube',
    'Texture2DArray',
    'RWTexture2D',
    'Sampler',
    'SamplerState',
    'SamplerComparisonState',
    'StructuredBuffer',
    'Buffer',
    'RWStructuredBuffer',
    'RWBuffer'
  ]);

  const macroTypes = new Set<string>();
  for (const [macroName, macroInfo] of macroIndex.entries()) {
    const value = macroInfo.value.trim();
    if (builtinTypes.has(value) || /^(float|int|uint|bool|half|double|real)([1-4](x[1-4])?)?$/.test(value)) {
      macroTypes.add(macroName);
    }
  }

  const userTypes = new Set<string>();
  for (const structName of structIndex.keys()) {
    if (!builtinTypes.has(structName) && !macroTypes.has(structName)) {
      userTypes.add(structName);
    }
  }

  for (const line of lines) {
    const structMatch = line.match(/\b(?:struct|class)\s+([A-Z][A-Za-z0-9_]*)\b/);
    if (structMatch && !builtinTypes.has(structMatch[1]!) && !macroTypes.has(structMatch[1]!)) {
      userTypes.add(structMatch[1]!);
    }

    const typeMatch = line.match(/\b([A-Z][A-Za-z0-9_]+)\s+[A-Za-z_][A-Za-z0-9_]*\s*[;=,\[\(]/);
    if (typeMatch && !builtinTypes.has(typeMatch[1]!) && !macroTypes.has(typeMatch[1]!)) {
      userTypes.add(typeMatch[1]!);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const lineNumber = i;

    let processedLine = line;
    processedLine = processedLine.replace(/\/\/.*$/g, '');
    processedLine = processedLine.replace(/\/\*[\s\S]*?\*\//g, '');
    processedLine = processedLine.replace(/"[^"]*"/g, '""');

    const complexBuiltinTypes = new Set([
      'Texture2D',
      'Texture3D',
      'TextureCube',
      'Texture2DArray',
      'RWTexture2D',
      'RWTexture3D',
      'Texture1D',
      'Texture2DMS',
      'RWTexture1D',
      'RWTextureCube',
      'RWTexture2DArray',
      'Sampler',
      'SamplerState',
      'SamplerComparisonState',
      'StructuredBuffer',
      'Buffer',
      'RWStructuredBuffer',
      'RWBuffer'
    ]);

    for (const type of complexBuiltinTypes) {
      const regex = new RegExp(`\\b${type.replace(/[.*+?^${}()|[\[\]\\]]/g, '\\$&')}\\b`, 'g');
      let match: RegExpExecArray | null;
      while ((match = regex.exec(processedLine)) !== null) {
        const before = processedLine.substring(0, match.index);
        const after = processedLine.substring(match.index + match[0]!.length);
        if (
          after.match(/^\s*[<(]/) ||
          after.match(/^\s+[A-Za-z_]/) ||
          before.match(/(?:^|\s|\(|,|\[|::|\.)$/) ||
          (before.trim() === '' && after.match(/^\s*[A-Za-z_]/))
        ) {
          builder.push(lineNumber, match.index, match[0]!.length, TOKEN_TYPE);
        }
      }
    }

    for (const type of macroTypes) {
      const regex = new RegExp(`\\b${type.replace(/[.*+?^${}()|[\[\]\\]]/g, '\\$&')}\\b`, 'g');
      let match: RegExpExecArray | null;
      while ((match = regex.exec(processedLine)) !== null) {
        const before = processedLine.substring(0, match.index);
        const after = processedLine.substring(match.index + match[0]!.length);
        if (
          after.match(/^\s+[A-Za-z_]/) ||
          before.match(/(?:^|\s|\(|,|\[|::|\.)$/) ||
          (before.trim() === '' && after.match(/^\s*[A-Za-z_]/))
        ) {
          builder.push(lineNumber, match.index, match[0]!.length, TOKEN_TYPE);
        }
      }
    }

    for (const type of userTypes) {
      const regex = new RegExp(`\\b${type.replace(/[.*+?^${}()|[\[\]\\]]/g, '\\$&')}\\b`, 'g');
      let match: RegExpExecArray | null;
      while ((match = regex.exec(processedLine)) !== null) {
        const before = processedLine.substring(0, match.index);
        const after = processedLine.substring(match.index + match[0]!.length);
        if (
          after.match(/^\s+[A-Za-z_]/) ||
          before.match(/(?:^|\s|\(|,|\[|::|\.)$/) ||
          (before.trim() === '' && after.match(/^\s*[A-Za-z_]/))
        ) {
          builder.push(lineNumber, match.index, match[0]!.length, TOKEN_TYPE);
        }
      }
    }

    let pos = 0;
    while (pos < processedLine.length) {
      const openBracket = processedLine.indexOf('<', pos);
      if (openBracket === -1) break;

      let depth = 0;
      let closeBracket = -1;
      for (let j = openBracket; j < processedLine.length; j++) {
        if (processedLine[j] === '<') depth++;
        else if (processedLine[j] === '>') {
          depth--;
          if (depth === 0) {
            closeBracket = j;
            break;
          }
        }
      }

      if (closeBracket === -1) break;

      const templateContent = processedLine.substring(openBracket + 1, closeBracket);
      const templateStart = openBracket + 1;

      const basicTypes = new Set([
        'uint',
        'int',
        'float',
        'bool',
        'half',
        'double',
        'void',
        'uint2',
        'uint3',
        'uint4',
        'int2',
        'int3',
        'int4',
        'float2',
        'float3',
        'float4',
        'real',
        'real2',
        'real3',
        'real4'
      ]);

      const structTypes = new Set<string>();
      for (const structName of structIndex.keys()) {
        structTypes.add(structName);
      }

      const templateTypes = new Set<string>([...macroTypes, ...userTypes, ...structTypes]);
      for (const type of builtinTypes) {
        if (!basicTypes.has(type)) {
          templateTypes.add(type);
        }
      }

      for (const type of templateTypes) {
        const typeRegex = new RegExp(`\\b${type.replace(/[.*+?^${}()|[\[\]\\]]/g, '\\$&')}\\b`, 'g');
        let typeMatch: RegExpExecArray | null;
        while ((typeMatch = typeRegex.exec(templateContent)) !== null) {
          const beforeInTemplate = templateContent.substring(0, typeMatch.index);
          const afterInTemplate = templateContent.substring(typeMatch.index + typeMatch[0]!.length);
          if (beforeInTemplate.match(/(?:^|\s|,)$/) && afterInTemplate.match(/^\s*(?:,|>|$)/)) {
            const absolutePos = templateStart + typeMatch.index;
            builder.push(lineNumber, absolutePos, typeMatch[0]!.length, TOKEN_TYPE);
          }
        }
      }

      pos = closeBracket + 1;
    }

    const keywordRegex = /\b(precise|groupshared|static|const|uniform|extern|inline|noinline)\b/g;
    let keywordMatch: RegExpExecArray | null;
    while ((keywordMatch = keywordRegex.exec(processedLine)) !== null) {
      const before = processedLine.substring(0, keywordMatch.index);
      const after = processedLine.substring(keywordMatch.index + keywordMatch[0]!.length);
      if (after.match(/^\s+(?:float|int|uint|bool|half|double|real|Texture|Sampler|[A-Z][A-Za-z0-9_]*|[a-z_][a-zA-Z0-9_]*)/)) {
        builder.push(lineNumber, keywordMatch.index, keywordMatch[0]!.length, TOKEN_FUNCTION);
      }
    }

    const attributeRegex = /\[([a-zA-Z_][a-zA-Z0-9_]*)(?:\([^)]*\))?\]/g;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attributeRegex.exec(processedLine)) !== null) {
      const attrName = attrMatch[1]!;
      const knownAttributes = new Set([
        'unroll',
        'branch',
        'flatten',
        'loop',
        'fastopt',
        'allow_uav_condition',
        'numthreads',
        'domain',
        'partitioning',
        'outputtopology',
        'outputcontrolpoints',
        'patchconstantfunc',
        'maxtessfactor',
        'instance',
        'maxvertexcount',
        'earlydepthstencil',
        'conservative',
        'precise',
        'groupshared',
        'static',
        'row_major',
        'column_major',
        'packoffset',
        'register',
        'in',
        'out',
        'inout'
      ]);

      const beforeBracket = processedLine.substring(0, attrMatch.index).trim();
      const afterBracket = processedLine.substring(attrMatch.index + attrMatch[0]!.length).trim();

      let nextLineAfterBracket = '';
      if (i + 1 < lines.length && processedLine.trim().endsWith(']')) {
        const nextLine = lines[i + 1] ?? '';
        const nextProcessed = nextLine.replace(/\/\/.*$/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
        nextLineAfterBracket = nextProcessed;
      }

      const isArraySize = beforeBracket.match(/\b[A-Za-z_][A-Za-z0-9_]*\s*$/);
      const isAttribute =
        afterBracket.match(
          /^(for|while|if|else|switch|return|void|float|int|uint|real|bool|half|double|Texture|Sampler|[A-Z][A-Za-z0-9_]*\s+[A-Za-z_])/
        ) ||
        nextLineAfterBracket.match(
          /^(for|while|if|else|switch|return|void|float|int|uint|real|bool|half|double|Texture|Sampler|[A-Z][A-Za-z0-9_]*\s+[A-Za-z_])/
        );

      const isKnownAttribute = knownAttributes.has(attrName.toLowerCase());

      if ((isAttribute || isKnownAttribute) && !isArraySize) {
        const attrStart = attrMatch.index + 1;
        builder.push(lineNumber, attrStart, attrName.length, TOKEN_FUNCTION);
      } else if (isArraySize && !isKnownAttribute) {
        if (macroIndex.has(attrName) || /^[A-Z_][A-Z0-9_]*$/.test(attrName)) {
          const attrStart = attrMatch.index + 1;
          builder.push(lineNumber, attrStart, attrName.length, TOKEN_VARIABLE);
        }
      } else if (isKnownAttribute && isArraySize) {
        const attrStart = attrMatch.index + 1;
        builder.push(lineNumber, attrStart, attrName.length, TOKEN_FUNCTION);
      }
    }
  }

  return builder.build();
}
