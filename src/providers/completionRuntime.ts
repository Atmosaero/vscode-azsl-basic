import * as vscode from 'vscode';

import { debugLog } from '../logger';
import {
  atomMethodIndex,
  atomTypeMembers,
  indexedSymbols,
  structIndex,
  structMembers
} from '../indexer/state';

const samplerPropertyNames = [
  'MinFilter',
  'MagFilter',
  'MipFilter',
  'AddressU',
  'AddressV',
  'AddressW',
  'MaxAnisotropy',
  'ReductionType',
  'ComparisonFunc',
  'MinLOD',
  'MaxLOD',
  'MipLODBias',
  'BorderColor'
];

const samplerPropertyEnumValues: Record<string, string[]> = {
  MinFilter: ['Point', 'Linear'],
  MagFilter: ['Point', 'Linear'],
  MipFilter: ['Point', 'Linear'],
  AddressU: ['Wrap', 'Mirror', 'Clamp', 'Border', 'MirrorOnce'],
  AddressV: ['Wrap', 'Mirror', 'Clamp', 'Border', 'MirrorOnce'],
  AddressW: ['Wrap', 'Mirror', 'Clamp', 'Border', 'MirrorOnce'],
  ReductionType: ['Filter', 'Comparison', 'Minimum', 'Maximum'],
  ComparisonFunc: ['Never', 'Less', 'Equal', 'LessEqual', 'Greater', 'NotEqual', 'GreaterEqual', 'Always'],
  BorderColor: ['OpaqueBlack', 'TransparentBlack', 'OpaqueWhite']
};

const textureTypes = new Set([
  'Texture2D',
  'Texture3D',
  'TextureCube',
  'Texture2DArray',
  'RWTexture2D',
  'RWTexture3D',
  'Texture1D',
  'Texture2DMS',
  'RWTexture1D'
]);

type FunctionScope = {
  startLine: number;
  returnType: string | null;
  firstParamType: string | null;
  endLine: number | null;
};

function getFunctionReturnTypeAtPosition(document: vscode.TextDocument, lineNum: number): string | null {
  const text = document.getText();
  const lines = text.split(/\r?\n/);
  const functionScopes: FunctionScope[] = [];
  let braceDepth = 0;
  let currentFunctionStart = -1;
  let currentFunctionReturnType: string | null = null;
  let currentFunctionFirstParamType: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const prevBraceDepth = braceDepth;
    braceDepth += (line.match(/{/g) || []).length;
    braceDepth -= (line.match(/}/g) || []).length;
    const currentBraceDepth = braceDepth;

    const funcMatch = line.match(
      /^\s*((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/
    );
    if (funcMatch) {
      currentFunctionStart = i;
      currentFunctionReturnType = funcMatch[1]?.trim() ?? null;

      const funcParams = line.match(
        /\b((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:[,:)]|$)/
      );
      if (funcParams) {
        const paramMatch = funcParams[0].match(
          /\b((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)/
        );
        if (paramMatch) {
          currentFunctionFirstParamType = paramMatch[1] ?? null;
        }
      }
    }

    if (currentFunctionStart >= 0 && prevBraceDepth === 0 && currentBraceDepth > 0) {
      const existingScope = functionScopes.find(s => s.startLine === currentFunctionStart);
      if (!existingScope) {
        functionScopes.push({
          startLine: currentFunctionStart,
          returnType: currentFunctionReturnType,
          firstParamType: currentFunctionFirstParamType,
          endLine: null
        });
      }
    }

    if (currentFunctionStart >= 0 && prevBraceDepth === 1 && currentBraceDepth === 0) {
      const scope = functionScopes.find(s => s.startLine === currentFunctionStart);
      if (scope) {
        scope.endLine = i;
      }
      currentFunctionStart = -1;
      currentFunctionReturnType = null;
      currentFunctionFirstParamType = null;
    }
  }

  for (let j = functionScopes.length - 1; j >= 0; j--) {
    const scope = functionScopes[j]!;
    if (scope.startLine <= lineNum && (!scope.endLine || lineNum <= scope.endLine)) {
      return scope.returnType;
    }
  }

  return null;
}

function getSamplerBlockStartLine(document: vscode.TextDocument, lineNum: number): number | null {
  const startSearch = Math.max(0, lineNum - 200);
  for (let i = lineNum; i >= startSearch; i--) {
    const line = document.lineAt(i).text;
    if (/^\s*Sampler\b/.test(line)) {
      return i;
    }
  }
  return null;
}

function isPositionInsideSamplerBlock(document: vscode.TextDocument, position: vscode.Position): boolean {
  const startLine = getSamplerBlockStartLine(document, position.line);
  if (startLine === null) return false;

  let foundOpen = false;
  let depth = 0;

  for (let i = startLine; i <= position.line; i++) {
    let line = document.lineAt(i).text;
    if (i === position.line) {
      line = line.substring(0, position.character);
    }

    if (!foundOpen) {
      const braceIndex = line.indexOf('{');
      if (braceIndex >= 0) {
        foundOpen = true;
        const after = line.substring(braceIndex);
        depth += (after.match(/{/g) || []).length;
        depth -= (after.match(/}/g) || []).length;
      }
    } else {
      depth += (line.match(/{/g) || []).length;
      depth -= (line.match(/}/g) || []).length;
    }
  }

  return foundOpen && depth > 0;
}

function getSamplerPropertyNameBeforeEquals(beforeCursor: string): string | null {
  const m = beforeCursor.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*[^;]*$/);
  return m ? (m[1] ?? null) : null;
}

function getFunctionParameterTypeAtPosition(document: vscode.TextDocument, lineNum: number): string | null {
  const text = document.getText();
  const lines = text.split(/\r?\n/);
  const functionScopes: FunctionScope[] = [];
  let braceDepth = 0;
  let currentFunctionStart = -1;
  let currentFunctionReturnType: string | null = null;
  let currentFunctionFirstParamType: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const prevBraceDepth = braceDepth;
    braceDepth += (line.match(/{/g) || []).length;
    braceDepth -= (line.match(/}/g) || []).length;
    const currentBraceDepth = braceDepth;

    const funcMatch = line.match(
      /^\s*((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/
    );
    if (funcMatch) {
      currentFunctionStart = i;
      currentFunctionReturnType = funcMatch[1]?.trim() ?? null;

      const funcParams = line.match(
        /\b((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:[,:)]|$)/
      );
      if (funcParams) {
        const paramMatch = funcParams[0].match(
          /\b((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)/
        );
        if (paramMatch) {
          currentFunctionFirstParamType = paramMatch[1] ?? null;
        }
      }
    }

    if (currentFunctionStart >= 0 && prevBraceDepth === 0 && currentBraceDepth > 0) {
      const existingScope = functionScopes.find(s => s.startLine === currentFunctionStart);
      if (!existingScope) {
        functionScopes.push({
          startLine: currentFunctionStart,
          returnType: currentFunctionReturnType,
          firstParamType: currentFunctionFirstParamType,
          endLine: null
        });
      }
    }

    if (currentFunctionStart >= 0 && prevBraceDepth === 1 && currentBraceDepth === 0) {
      const scope = functionScopes.find(s => s.startLine === currentFunctionStart);
      if (scope) {
        scope.endLine = i;
      }
      currentFunctionStart = -1;
      currentFunctionReturnType = null;
      currentFunctionFirstParamType = null;
    }
  }

  for (let j = functionScopes.length - 1; j >= 0; j--) {
    const scope = functionScopes[j]!;
    if (scope.startLine <= lineNum && (!scope.endLine || lineNum <= scope.endLine)) {
      return scope.firstParamType;
    }
  }

  return null;
}

type VarDecl = { type: string; line: number; braceDepth: number };

function getVariableTypeAtPosition(document: vscode.TextDocument, varName: string, lineNum: number): string | null {
  const text = document.getText();
  const lines = text.split(/\r?\n/);
  const atomTypes = new Set([
    'Surface',
    'LightingData',
    'DirectionalLight',
    'SimplePointLight',
    'PointLight',
    'SimpleSpotLight',
    'DiskLight',
    'ForwardPassOutput',
    'VertexShaderOutput',
    'VertexShaderInput'
  ]);
  const localTextureTypes = textureTypes;

  const variableDeclarations = new Map<string, VarDecl[]>();
  const variableTypes = new Map<string, string>();
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;
    braceDepth += openBraces - closeBraces;

    const varDeclMatch = line.match(
      /\b((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix|Texture\w*|Sampler\w*|RWTexture\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;=]/
    );
    if (varDeclMatch) {
      const fullType = varDeclMatch[1] ?? '';
      const vName = varDeclMatch[2] ?? '';
      if (!variableDeclarations.has(vName)) {
        variableDeclarations.set(vName, []);
      }
      variableDeclarations.get(vName)!.push({ type: fullType, line: i, braceDepth });
      if (atomTypes.has(fullType) || localTextureTypes.has(fullType) || structIndex.has(fullType) || structMembers.has(fullType)) {
        variableTypes.set(vName, fullType);
      }
    }
  }

  if (variableDeclarations.has(varName)) {
    const declarations = variableDeclarations.get(varName)!;
    let targetBraceDepth = 0;
    for (let i = 0; i <= lineNum && i < lines.length; i++) {
      const openBraces = (lines[i]?.match(/{/g) || []).length;
      const closeBraces = (lines[i]?.match(/}/g) || []).length;
      targetBraceDepth += openBraces - closeBraces;
    }

    let bestMatch: VarDecl | null = null;
    let bestBraceDepth = -1;

    for (const decl of declarations) {
      if (decl.line <= lineNum && decl.braceDepth <= targetBraceDepth) {
        if (decl.braceDepth > bestBraceDepth) {
          bestBraceDepth = decl.braceDepth;
          bestMatch = decl;
        } else if (decl.braceDepth === bestBraceDepth && decl.line > (bestMatch ? bestMatch.line : -1)) {
          bestMatch = decl;
        }
      }
    }

    if (bestMatch) {
      return bestMatch.type;
    }
  }

  if (variableTypes.has(varName)) {
    return variableTypes.get(varName)!;
  }

  return null;
}

function isVectorType(type: string | null | undefined): boolean {
  if (!type) return false;
  return /^(float|int|uint|bool|real|half)[2-4]$/.test(type);
}

function getSwizzleProperties(type: string): string[] {
  const props = new Set<string>();
  const dimMatch = type.match(/(\d)$/);
  if (!dimMatch) return [];

  const dim = parseInt(dimMatch[1]!, 10);
  const components = ['x', 'y', 'z', 'w'];
  const colorComponents = ['r', 'g', 'b', 'a'];

  for (let i = 0; i < dim; i++) {
    props.add(components[i]!);
    props.add(colorComponents[i]!);
  }

  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      if (i !== j) {
        props.add(components[i]! + components[j]!);
        props.add(colorComponents[i]! + colorComponents[j]!);
      }
    }
  }

  if (dim >= 3) {
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        for (let k = 0; k < dim; k++) {
          if (i !== j && j !== k && i !== k) {
            props.add(components[i]! + components[j]! + components[k]!);
            props.add(colorComponents[i]! + colorComponents[j]! + colorComponents[k]!);
          }
        }
      }
    }
  }

  if (dim === 4) {
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        for (let k = 0; k < dim; k++) {
          for (let l = 0; l < dim; l++) {
            if (i !== j && j !== k && k !== l && i !== k && i !== l && j !== l) {
              props.add(components[i]! + components[j]! + components[k]! + components[l]!);
              props.add(colorComponents[i]! + colorComponents[j]! + colorComponents[k]! + colorComponents[l]!);
            }
          }
        }
      }
    }
  }

  return Array.from(props).sort();
}

function extractFunctionCallArgs(text: string, funcName: string): string[] | null {
  const funcPattern = new RegExp(`\\b${funcName}\\s*\\(`, 'g');
  let match: RegExpExecArray | null;
  let lastMatch: RegExpExecArray | null = null;

  while ((match = funcPattern.exec(text)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) return null;

  const startPos = lastMatch.index + lastMatch[0]!.length;
  let depth = 1;
  let pos = startPos;
  let argStart = startPos;
  const args: string[] = [];

  while (pos < text.length && depth > 0) {
    if (text[pos] === '(') depth++;
    else if (text[pos] === ')') depth--;
    else if (text[pos] === ',' && depth === 1) {
      args.push(text.substring(argStart, pos).trim());
      argStart = pos + 1;
    }
    pos++;
  }

  if (depth === 0) {
    args.push(text.substring(argStart, pos - 1).trim());
    return args;
  }

  return null;
}

function getExpressionType(document: vscode.TextDocument, expression: string, lineNum: number): string | null {
  if (!expression) return null;

  const trimmedExpr = expression.trim();
  const mulMatch = trimmedExpr.match(/\bmul\s*\(/);
  if (mulMatch) {
    debugLog(`[getExpressionType] Found mul() in expression: '${trimmedExpr}'`);
    const args = extractFunctionCallArgs(trimmedExpr, 'mul');
    debugLog(`[getExpressionType] Extracted args: ${args ? JSON.stringify(args) : 'null'}`);

    if (args && args.length >= 2) {
      const secondArg = args[1]!.trim();
      debugLog(`[getExpressionType] Second arg: '${secondArg}'`);

      const vectorMatch = secondArg.match(/(float|int|uint|bool|real|half)([2-4])\s*\(/);
      if (vectorMatch) {
        const resultType = vectorMatch[1]! + vectorMatch[2]!;
        debugLog(`[getExpressionType] mul() with vector constructor: ${resultType}`);
        return resultType;
      }

      const varMatch = secondArg.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
      if (varMatch) {
        const varType = getVariableTypeAtPosition(document, varMatch[1]!, lineNum);
        if (varType && isVectorType(varType)) {
          debugLog(`[getExpressionType] mul() with vector variable: ${varType}`);
          return varType;
        }
      }

      const memberMatch = secondArg.match(/([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)/);
      if (memberMatch) {
        const varName = memberMatch[1]!;
        const memberName = memberMatch[2]!;
        const varType = getVariableTypeAtPosition(document, varName, lineNum);
        if (varType && structMembers.has(varType)) {
          debugLog(`[getExpressionType] mul() with member access: ${varName}.${memberName}, varType=${varType}`);
        }
      }
    }
  }

  const vectorConstructorMatch = trimmedExpr.match(/(float|int|uint|bool|real|half)([2-4])\s*\(/);
  if (vectorConstructorMatch) {
    const resultType = vectorConstructorMatch[1]! + vectorConstructorMatch[2]!;
    debugLog(`[getExpressionType] Vector constructor: ${resultType}`);
    return resultType;
  }

  return null;
}

export function provideCompletionItems(
  document: vscode.TextDocument,
  position: vscode.Position,
  token: vscode.CancellationToken,
  context: vscode.CompletionContext
): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
  if (document.languageId !== 'azsl') {
    return [];
  }

  const range = document.getWordRangeAtPosition(position);
  const current = range ? document.getText(range) : '';
  const items: vscode.CompletionItem[] = [];

  const lineText = document.lineAt(position.line).text;
  const beforeCursor = lineText.substring(0, position.character);
  const dotIndex = beforeCursor.lastIndexOf('.');

  if (isPositionInsideSamplerBlock(document, position)) {
    const eqIndex = beforeCursor.indexOf('=');
    if (eqIndex >= 0) {
      const propName = getSamplerPropertyNameBeforeEquals(beforeCursor);
      const enumValues = propName ? samplerPropertyEnumValues[propName] : undefined;
      if (enumValues) {
        const typedValue = beforeCursor.substring(eqIndex + 1).trim();
        for (const val of enumValues) {
          if (!typedValue || val.toLowerCase().startsWith(typedValue.toLowerCase())) {
            const item = new vscode.CompletionItem(val, vscode.CompletionItemKind.EnumMember);
            item.sortText = '00_' + val;
            items.push(item);
          }
        }
        return items;
      }
    }

    for (const prop of samplerPropertyNames) {
      if (!current || prop.toLowerCase().startsWith(current.toLowerCase())) {
        const item = new vscode.CompletionItem(prop, vscode.CompletionItemKind.Property);
        item.sortText = '00_' + prop;
        items.push(item);
      }
    }
    return items;
  }

  if (dotIndex >= 0) {
    const expressionBeforeDot = beforeCursor.substring(0, dotIndex).trim();
    debugLog(`[provideCompletionItems] Checking expression before dot: '${expressionBeforeDot}'`);

    if (expressionBeforeDot.endsWith(')')) {
      const exprType = getExpressionType(document, expressionBeforeDot, position.line);
      debugLog(`[provideCompletionItems] Expression type result: ${exprType}`);

      if (exprType && isVectorType(exprType)) {
        debugLog(`[provideCompletionItems] Found expression type: ${exprType} for '${expressionBeforeDot}'`);
        const swizzleProps = getSwizzleProperties(exprType);
        debugLog(`[provideCompletionItems] Swizzle properties for ${exprType}: ${swizzleProps.length} items`);

        for (const prop of swizzleProps) {
          if (!current || prop.toLowerCase().startsWith(current.toLowerCase())) {
            const item = new vscode.CompletionItem(prop, vscode.CompletionItemKind.Property);
            item.sortText = '00_' + prop;
            items.push(item);
          }
        }

        if (items.length > 0) {
          debugLog(`[provideCompletionItems] Returning ${items.length} swizzle completion items`);
          return items;
        }
      }
    }
  }

  let memberAccessMatch = beforeCursor.match(/([A-Za-z_][A-Za-z0-9_]*)\s*[\.:]\s*$/);
  if (!memberAccessMatch) {
    memberAccessMatch = beforeCursor.match(/([A-Za-z_][A-Za-z0-9_]*)\s*[\.:]\s*$/);
  }

  if (!memberAccessMatch && context?.triggerCharacter === '.') {
    const beforeDot = beforeCursor.replace(/\.\s*$/, '');
    memberAccessMatch = beforeDot.match(/([A-Za-z_][A-Za-z0-9_]*)\s*$/);
  }

  if (memberAccessMatch) {
    const varName = memberAccessMatch[1]!;
    let varType: string | null = null;

    if (varName === 'OUT' || varName === 'out') {
      const funcReturnType = getFunctionReturnTypeAtPosition(document, position.line);
      if (funcReturnType) {
        varType = funcReturnType;
      }
    }

    if (!varType && (varName === 'IN' || varName === 'in')) {
      const funcParamType = getFunctionParameterTypeAtPosition(document, position.line);
      if (funcParamType) {
        varType = funcParamType;
      }
    }

    if (!varType) {
      varType = getVariableTypeAtPosition(document, varName, position.line);
    }

    const atomTypes = new Set([
      'Surface',
      'LightingData',
      'DirectionalLight',
      'SimplePointLight',
      'PointLight',
      'SimpleSpotLight',
      'DiskLight'
    ]);
    if (!varType && atomTypes.has(varName)) {
      varType = varName;
    }

    debugLog(`[provideCompletionItems] Variable '${varName}' has type: ${varType}`);

    if (varType) {
      debugLog(`[provideCompletionItems] structMembers.has('${varType}'): ${structMembers.has(varType)}`);
      if (structMembers.has(varType)) {
        const members = structMembers.get(varType)!;
        debugLog(
          `[provideCompletionItems] Found ${members.size} members for type '${varType}': ${Array.from(members).join(', ')}`
        );
      }
    }

    if (varType && atomTypeMembers.has(varType)) {
      const members = atomTypeMembers.get(varType)!;
      for (const member of members) {
        if (!current || member.toLowerCase().startsWith(current.toLowerCase())) {
          const isMethod = atomMethodIndex.has(`${varType}.${member}`) || atomMethodIndex.has(`${varType}::${member}`);
          const item = new vscode.CompletionItem(
            member,
            isMethod ? vscode.CompletionItemKind.Method : vscode.CompletionItemKind.Property
          );
          item.sortText = '00_' + member;
          items.push(item);
        }
      }
      return items;
    } else if (varType && atomTypeMembers.has(varType)) {
      const members = atomTypeMembers.get(varType)!;
      for (const member of members) {
        if (!current || member.toLowerCase().startsWith(current.toLowerCase())) {
          const item = new vscode.CompletionItem(member, vscode.CompletionItemKind.Property);
          item.sortText = '00_' + member;
          items.push(item);
        }
      }
      return items;
    } else if (varType && structMembers.has(varType)) {
      const members = structMembers.get(varType)!;
      for (const member of members) {
        if (!current || member.toLowerCase().startsWith(current.toLowerCase())) {
          const item = new vscode.CompletionItem(member, vscode.CompletionItemKind.Property);
          item.sortText = '00_' + member;
          items.push(item);
        }
      }
      return items;
    } else if (varType && isVectorType(varType)) {
      const swizzleProps = getSwizzleProperties(varType);
      for (const prop of swizzleProps) {
        if (!current || prop.toLowerCase().startsWith(current.toLowerCase())) {
          const item = new vscode.CompletionItem(prop, vscode.CompletionItemKind.Property);
          item.sortText = '00_' + prop;
          items.push(item);
        }
      }
      return items;
    } else if (varType && textureTypes.has(varType)) {
      const textureMethods: { name: string; kind: vscode.CompletionItemKind }[] = [
        { name: 'Sample', kind: vscode.CompletionItemKind.Method },
        { name: 'SampleLevel', kind: vscode.CompletionItemKind.Method },
        { name: 'SampleGrad', kind: vscode.CompletionItemKind.Method },
        { name: 'SampleBias', kind: vscode.CompletionItemKind.Method },
        { name: 'SampleCmp', kind: vscode.CompletionItemKind.Method },
        { name: 'SampleCmpLevelZero', kind: vscode.CompletionItemKind.Method },
        { name: 'Load', kind: vscode.CompletionItemKind.Method },
        { name: 'GetDimensions', kind: vscode.CompletionItemKind.Method },
        { name: 'Gather', kind: vscode.CompletionItemKind.Method },
        { name: 'GatherRed', kind: vscode.CompletionItemKind.Method },
        { name: 'GatherGreen', kind: vscode.CompletionItemKind.Method },
        { name: 'GatherBlue', kind: vscode.CompletionItemKind.Method },
        { name: 'GatherAlpha', kind: vscode.CompletionItemKind.Method }
      ];

      for (const method of textureMethods) {
        if (!current || method.name.toLowerCase().startsWith(current.toLowerCase())) {
          const item = new vscode.CompletionItem(method.name, method.kind);
          item.sortText = '00_' + method.name;
          items.push(item);
        }
      }
      return items;
    }
  }

  for (const sym of indexedSymbols) {
    const item = new vscode.CompletionItem(sym, vscode.CompletionItemKind.Text);
    if (current && sym.startsWith(current)) {
      item.sortText = '0_' + sym;
    } else {
      item.sortText = '1_' + sym;
    }
    items.push(item);
  }

  return items;
}
