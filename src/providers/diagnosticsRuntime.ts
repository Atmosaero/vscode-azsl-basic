import * as path from 'path';
import * as vscode from 'vscode';

import * as includes from '../includes';
import { atomTypeMembers, headersPathIndex, indexedSymbols, macroIndex, optionIndex, srgMembers, srgMemberIndex, srgSemanticIndex, structIndex, structMembers } from '../indexer/state';
import { debugLog } from '../logger';
import { extractStructDeclarations } from '../indexer/parsers/structs';
import { resolveIncludeTarget } from './includesRuntime';

function clampPosition(document: vscode.TextDocument, pos: vscode.Position): vscode.Position {
  const line = Math.max(0, Math.min(pos.line, Math.max(0, document.lineCount - 1)));
  const lineText = document.lineAt(line).text;
  const character = Math.max(0, Math.min(pos.character, lineText.length));
  return new vscode.Position(line, character);
}

function clampRange(document: vscode.TextDocument, range: vscode.Range): vscode.Range {
  const start = clampPosition(document, range.start);
  const end = clampPosition(document, range.end);
  if (end.isBefore(start)) {
    return new vscode.Range(start, start);
  }
  return new vscode.Range(start, end);
}

function safeSetDiagnostics(
  document: vscode.TextDocument,
  diagnosticCollection: vscode.DiagnosticCollection,
  diagnostics: vscode.Diagnostic[]
): void {
  const clamped = diagnostics.map(d => {
    const r = clampRange(document, d.range);
    const copy = new vscode.Diagnostic(r, d.message, d.severity);
    copy.code = d.code;
    copy.source = d.source;
    copy.relatedInformation = d.relatedInformation;
    copy.tags = d.tags;
    return copy;
  });

  try {
    diagnosticCollection.set(document.uri, clamped);
  } catch (e) {
    debugLog(`[diagnostics] diagnosticCollection.set failed for ${document.uri.toString()}: ${String(e)}`);
  }
}

const builtinIdentifiers = new Set([
  'max', 'min', 'saturate', 'clamp', 'smoothstep', 'normalize', 'length', 'dot', 'cross',
  'pow', 'floor', 'ceil', 'frac', 'lerp', 'step', 'ddx', 'ddy', 'abs', 'mul', 'round',
  'sin', 'cos', 'sqrt', 'fmod',
  'clip', 'ddx_fine', 'ddy_fine', 'rcp', 'exp', 'transpose',
  'branch',
  'numthreads',
  'Sample', 'SampleCmp', 'GetDimensions',
  'float', 'float2', 'float3', 'float4', 'float2x2', 'float3x3', 'float4x4',
  'real', 'real2', 'real3', 'real4', 'real3x3', 'real3x4', 'real4x4',
  'int', 'int2', 'int3', 'int4', 'uint', 'uint2', 'uint3', 'uint4', 'bool',
  'half', 'double', 'matrix', 'void',
  'Texture2D', 'Texture3D', 'TextureCube', 'Texture2DArray', 'RWTexture2D',
  'Sampler', 'SamplerState', 'SamplerComparisonState',
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return',
  'true', 'false',
  'struct', 'cbuffer', 'tbuffer', 'namespace', 'class', 'static', 'const', 'groupshared',
  'uniform', 'volatile', 'option', 'noperspective', 'inline',
  'POSITION', 'NORMAL', 'TEXCOORD0', 'TEXCOORD1', 'TEXCOORD2', 'TEXCOORD3', 'TEXCOORD4', 'TEXCOORD5', 'TEXCOORD6',
  'UV0', 'UV1', 'UV2', 'UV3',
  'SV_Position', 'SV_Target', 'SV_Target0', 'SV_InstanceID', 'SV_VertexID',
  'COLOR0', 'COLOR1', 'TANGENT', 'BINORMAL'
]);

const samplerPropertyNames = new Set([
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
]);

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

const samplerPropertyNumericKind: Record<string, 'int' | 'float'> = {
  MaxAnisotropy: 'int',
  MinLOD: 'float',
  MaxLOD: 'float',
  MipLODBias: 'float'
};

type ExtractedDecls = {
  declarations: Set<string>;
  knownStructs: Set<string>;
  classMembers: Map<string, Set<string>>;
  variableTypes: Map<string, string>;
};

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

function getExpressionType(document: vscode.TextDocument, expression: string, lineNum: number, getVariableTypeAtLine: (varName: string) => string | null): string | null {
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
        const varType = getVariableTypeAtLine(varMatch[1]!);
        if (varType && isVectorType(varType)) {
          debugLog(`[getExpressionType] mul() with vector variable: ${varType}`);
          return varType;
        }
      }
      const memberMatch = secondArg.match(/([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)/);
      if (memberMatch) {
        const varName = memberMatch[1]!;
        const memberName = memberMatch[2]!;
        const varType = getVariableTypeAtLine(varName);
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

function extractDeclarations(text: string): ExtractedDecls {
  const declarations = new Set<string>();
  const lines = text.split(/\r?\n/);
  const knownStructs = new Set<string>();
  const variableTypes = new Map<string, string>();

  for (const line of lines) {
    const structMatch = line.match(/\bstruct\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
    if (structMatch) {
      declarations.add(structMatch[1]!);
      knownStructs.add(structMatch[1]!);
    }

    const patterns = [
      /\bconst\s+(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix|Texture\w*|Sampler(?:State|ComparisonState|\w*)?|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]*\]\s*)?[;=]/,
      /\b(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix|Texture\w*|Sampler(?:State|ComparisonState|\w*)?|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]*\]\s*)?[;=]/
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        declarations.add(match[1]);
      }
    }

    const funcMatch = line.match(
      /\b(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|void|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*\{?/
    );
    if (funcMatch) {
      const funcName = funcMatch[1]!;
      declarations.add(funcName);

      const paramsStr = funcMatch[2];
      if (paramsStr && paramsStr.trim()) {
        const params = paramsStr
          .split(',')
          .map(p => p.trim())
          .filter(p => p);

        for (const param of params) {
          const paramMatch = param.match(
            /^(?:(?:in|out|inout)\s+)?(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*:|$)/
          );
          if (paramMatch && paramMatch[1]) {
            declarations.add(paramMatch[1]);
          }
        }
      }
    }

    const srgMatch = line.match(/\bShaderResourceGroup\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/);
    if (srgMatch) declarations.add(srgMatch[1]!);
  }

  let inSrg = false;
  let currentSrg = '';
  let pendingSrg = false;
  let pendingSrgName = '';
  let srgBraceDepth = 0;
  let awaitingSrgOpenBrace = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const srgStart = line.match(/\bShaderResourceGroup\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/);
    if (srgStart) {
      pendingSrg = true;
      pendingSrgName = srgStart[1]!;
      inSrg = false;
      currentSrg = '';
      srgBraceDepth = 0;
      awaitingSrgOpenBrace = false;
    }

    if (pendingSrg) {
      const opensHere = (line.match(/{/g) || []).length;
      const closesHere = (line.match(/}/g) || []).length;
      const opensNextLine = i + 1 < lines.length && (lines[i + 1] ?? '').trim().startsWith('{');
      if (opensHere > 0 || opensNextLine) {
        inSrg = true;
        currentSrg = pendingSrgName;
        pendingSrg = false;

        if (opensHere > 0) {
          srgBraceDepth = opensHere - closesHere;
          awaitingSrgOpenBrace = false;
        } else {
          srgBraceDepth = 0;
          awaitingSrgOpenBrace = true;
        }
      }
    }

    if (inSrg) {
      srgBraceDepth += (line.match(/{/g) || []).length;
      srgBraceDepth -= (line.match(/}/g) || []).length;
      if (awaitingSrgOpenBrace && (line.match(/{/g) || []).length > 0) {
        awaitingSrgOpenBrace = false;
      }
      if (!awaitingSrgOpenBrace && srgBraceDepth <= 0) {
        inSrg = false;
        currentSrg = '';
        pendingSrg = false;
        pendingSrgName = '';
        awaitingSrgOpenBrace = false;
        continue;
      }
    }

    if (inSrg && currentSrg) {
      let memberMatch = line.match(
        /^\s*(?:(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix|(Texture\w*)|(Sampler(?:State|ComparisonState|\w*)?)|([A-Z][A-Za-z0-9_]*)))\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;{]/
      );

      if (!memberMatch && i + 1 < lines.length) {
        const nextLine = lines[i + 1] ?? '';
        if (nextLine.trim().startsWith('{')) {
          memberMatch = line.match(
            /^\s*(?:(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix|(Texture\w*)|(Sampler(?:State|ComparisonState|\w*)?)|([A-Z][A-Za-z0-9_]*)))\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/
          );
        }
      }

      if (memberMatch) {
        const memberName = memberMatch[4]!;
        declarations.add(`${currentSrg}::${memberName}`);

        const textureType = memberMatch[1];
        const samplerType = memberMatch[2];
        const typeName = memberMatch[3];

        if (textureType) {
          variableTypes.set(`${currentSrg}::${memberName}`, textureType);
        } else if (samplerType) {
          const normalizedSamplerType = samplerType === 'Sampler' ? 'SamplerState' : samplerType;
          variableTypes.set(`${currentSrg}::${memberName}`, normalizedSamplerType);
        } else if (typeName) {
          variableTypes.set(`${currentSrg}::${memberName}`, typeName);
        }
      }
    }
  }

  for (const line of lines) {
    const macroMatch = line.match(/#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (macroMatch) declarations.add(macroMatch[1]!);
  }

  let inStruct = false;
  let currentStruct = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const structStart = line.match(/\bstruct\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
    if (structStart && knownStructs.has(structStart[1]!)) {
      inStruct = true;
      currentStruct = structStart[1]!;
    }

    if (line.includes('}') && inStruct) {
      inStruct = false;
      currentStruct = '';
    }

    if (inStruct && currentStruct) {
      const memberMatch = line.match(/^\s*(?:float|int|uint|bool|half|double|noperspective|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/);
      if (memberMatch) {
        declarations.add(`${currentStruct}.${memberMatch[1]!}`);
      }
    }
  }

  const classMembers = new Map<string, Set<string>>();
  let inClass = false;
  let currentClass = '';
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const classStart = line.match(/\bclass\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
    if (classStart) {
      inClass = true;
      currentClass = classStart[1]!;
      knownStructs.add(currentClass);
      braceDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      if (!classMembers.has(currentClass)) {
        classMembers.set(currentClass, new Set());
      }
    }

    if (inClass && currentClass) {
      if (!/^\s*#/.test(line)) {
        braceDepth += (line.match(/\{/g) || []).length;
        braceDepth -= (line.match(/\}/g) || []).length;
      }

      const memberMatch = line.match(
        /^\s*(?:precise\s+)?(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|Texture\w*|Sampler(?:State|ComparisonState|\w*)?|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;=\(]/
      );
      if (memberMatch) {
        const memberName = memberMatch[1]!;
        classMembers.get(currentClass)!.add(memberName);
      }

      if (braceDepth <= 0 && line.includes('}')) {
        inClass = false;
        currentClass = '';
        braceDepth = 0;
      }
    }
  }

  return { declarations, knownStructs, classMembers, variableTypes };
}

export function validateDocument(document: vscode.TextDocument, diagnosticCollection: vscode.DiagnosticCollection): void {
  if (document.languageId !== 'azsl') {
    const fsPath = document.uri.fsPath.toLowerCase();
    if (!fsPath.endsWith('.azsl') && !fsPath.endsWith('.azsli') && !fsPath.endsWith('.srgi')) {
      return;
    }
  }

  if (headersPathIndex.size === 0) {
    safeSetDiagnostics(document, diagnosticCollection, []);
    return;
  }

  {
    const builtinSrgSemantics = [
      'SRG_PerDraw',
      'SRG_PerMaterial',
      'SRG_PerObject',
      'SRG_PerPass',
      'SRG_PerPass_WithFallback',
      'SRG_PerScene',
      'SRG_PerView',
      'SRG_PerSubMesh',
      'SRG_RayTracingGlobal',
      'SRG_RayTracingLocal'
    ];
    for (const semantic of builtinSrgSemantics) {
      if (!srgSemanticIndex.has(semantic)) {
        srgSemanticIndex.set(semantic, {
          uri: vscode.Uri.parse('azsl-builtin://srg-semantics'),
          line: 0
        });
      }
    }
  }

  if (!atomTypeMembers.has('Surface')) {
    atomTypeMembers.set('Surface', new Set(['CalculateRoughnessA', 'SetAlbedoAndSpecularF0', 'GetDefaultNormal', 'GetSpecularF0']));
  }
  if (!atomTypeMembers.has('LightingData')) {
    atomTypeMembers.set(
      'LightingData',
      new Set(['Init', 'FinalizeLighting', 'CalculateMultiscatterCompensation', 'GetSpecularNdotV'])
    );
  }

  const fileName = document.fileName.split(/[/\\]/).pop() ?? '';
  const text = document.getText();

  const documentDir = (() => {
    try {
      return path.dirname(document.uri.fsPath);
    } catch {
      return '';
    }
  })();

  const { declarations, knownStructs, classMembers, variableTypes: extractedVariableTypes } = extractDeclarations(text);
  const diagnostics: vscode.Diagnostic[] = [];
  const lines = text.split(/\r?\n/);

  for (const sym of builtinIdentifiers) declarations.add(sym);
  for (const sym of indexedSymbols) declarations.add(sym);
  for (const name of macroIndex.keys()) declarations.add(name);

  const pascalCaseTypes = new Set<string>();
  for (const line of lines) {
    const typeMatch = line.match(/\b([A-Z][A-Za-z0-9_]+)\s+[A-Za-z_][A-Za-z0-9_]*\s*[;=,\[\(]/);
    if (typeMatch && !builtinIdentifiers.has(typeMatch[1]!)) {
      pascalCaseTypes.add(typeMatch[1]!);
    }
    const funcTypeMatch = line.match(/\b([A-Z][A-Za-z0-9_]+)\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/);
    if (funcTypeMatch && !builtinIdentifiers.has(funcTypeMatch[1]!)) {
      pascalCaseTypes.add(funcTypeMatch[1]!);
    }
  }

  for (const t of pascalCaseTypes) declarations.add(t);

  const atomTypes = new Set([
    'ForwardPassOutput', 'Surface', 'LightingData',
    'DirectionalLight', 'SimplePointLight', 'PointLight', 'SimpleSpotLight', 'DiskLight',
    'ViewSrg', 'SceneSrg', 'ObjectSrg'
  ]);
  for (const t of atomTypes) declarations.add(t);

  const currentDocStructs = extractStructDeclarations(text, document.uri.fsPath);
  for (const [structName, structInfo] of currentDocStructs.structs.entries()) {
    if (!structIndex.has(structName)) {
      structIndex.set(structName, { uri: structInfo.uri, line: structInfo.line });
      debugLog(`[validateDocument] Added local struct to index: ${structName} at line ${structInfo.line + 1}`);
    } else {
      const info = structIndex.get(structName)!;
      debugLog(
        `[validateDocument] Struct ${structName} already indexed from gem at ${path.basename(info.uri.fsPath)}:${info.line + 1}, skipping local definition`
      );
    }

    if (!structMembers.has(structName)) {
      structMembers.set(structName, new Set());
    }

    const existingMembers = structMembers.get(structName)!;
    const members = currentDocStructs.members.get(structName);

    if (members) {
      for (const member of members) {
        existingMembers.add(member);
        debugLog(`[validateDocument] Local struct ${structName} has member: ${member}`);
      }
    }
  }

  if (!atomTypeMembers.has('Surface')) {
    atomTypeMembers.set(
      'Surface',
      new Set([
        'position', 'normal', 'vertexNormal', 'metallic', 'roughnessLinear',
        'opacityAffectsSpecularFactor', 'opacityAffectsEmissiveFactor',
        'albedo', 'roughnessA',
        'CalculateRoughnessA', 'SetAlbedoAndSpecularF0', 'GetDefaultNormal', 'GetSpecularF0'
      ])
    );
  }

  if (!atomTypeMembers.has('LightingData')) {
    atomTypeMembers.set(
      'LightingData',
      new Set([
        'diffuseResponse', 'specularResponse', 'diffuseLighting', 'specularLighting',
        'diffuseAmbientOcclusion', 'specularOcclusion',
        'Init', 'FinalizeLighting'
      ])
    );
  }

  if (!atomTypeMembers.has('ForwardPassOutput')) {
    atomTypeMembers.set(
      'ForwardPassOutput',
      new Set([
        'm_color', 'm_diffuseColor', 'm_specularColor', 'm_albedo',
        'm_specularF0', 'm_normal', 'm_scatterDistance', 'm_depth'
      ])
    );
  }

  if (!structMembers.has('ForwardPassOutput')) {
    structMembers.set(
      'ForwardPassOutput',
      new Set([
        'm_color', 'm_diffuseColor', 'm_specularColor', 'm_albedo',
        'm_specularF0', 'm_normal', 'm_scatterDistance', 'm_depth'
      ])
    );
  }

  if (!structMembers.has('DirectionalLight')) {
    structMembers.set(
      'DirectionalLight',
      new Set([
        'm_direction', 'm_angularRadius', 'm_rgbIntensityLux',
        'm_affectsGIFactor', 'm_affectsGI', 'm_lightingChannelMask', 'm_padding'
      ])
    );
    debugLog(
      `[validateDocument] Added DirectionalLight members to structMembers: ${Array.from(structMembers.get('DirectionalLight')!).join(', ')}`
    );
  } else {
    debugLog(
      `[validateDocument] DirectionalLight already in structMembers with ${structMembers.get('DirectionalLight')!.size} members: ${Array.from(structMembers.get('DirectionalLight')!).join(', ')}`
    );
  }

  const variableTypes = new Map(extractedVariableTypes);

  const variableDeclarations = new Map<string, { type: string; line: number; braceDepth: number }[]>();
  const functionReturnTypes = new Map<number, string | null>();
  const functionScopes: { startLine: number; returnType: string | null; firstParamType: string | null; endLine: number | null }[] = [];

  const getVariableTypeAtLine = (varName: string, lineNum: number, currentBraceDepth: number): string | null => {
    if (!variableDeclarations.has(varName)) {
      if (variableTypes.has(varName)) {
        return variableTypes.get(varName)!;
      }
      return null;
    }

    const declarations = variableDeclarations.get(varName)!;
    let bestMatch: { type: string; line: number; braceDepth: number } | null = null;
    let bestBraceDepth = -1;

    for (const decl of declarations) {
      if (decl.line <= lineNum && decl.braceDepth <= currentBraceDepth) {
        if (decl.braceDepth > bestBraceDepth) {
          bestBraceDepth = decl.braceDepth;
          bestMatch = decl;
        } else if (decl.braceDepth === bestBraceDepth && decl.line > (bestMatch ? bestMatch.line : -1)) {
          bestMatch = decl;
        }
      }
    }

    if (bestMatch) {
      debugLog(
        `[getVariableTypeAtLine] Found ${varName} at line ${lineNum + 1}, braceDepth ${currentBraceDepth}: type=${bestMatch.type} (declared at line ${bestMatch.line + 1}, braceDepth ${bestMatch.braceDepth})`
      );
      return bestMatch.type;
    }

    if (variableTypes.has(varName)) {
      debugLog(`[getVariableTypeAtLine] Using fallback variableTypes for ${varName} at line ${lineNum + 1}`);
      return variableTypes.get(varName)!;
    }

    debugLog(`[getVariableTypeAtLine] No declaration found for ${varName} at line ${lineNum + 1}, braceDepth ${currentBraceDepth}`);
    return null;
  };

  let currentFunctionStart = -1;
  let currentFunctionReturnType: string | null = null;
  let currentFunctionFirstParamType: string | null = null;
  let currentBraceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    const funcSigMatch = line.match(
      /^\s*((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/
    );

    if (funcSigMatch && !line.trim().startsWith('//')) {
      const returnType = funcSigMatch[1]!;
      const funcName = funcSigMatch[2]!;

      currentFunctionStart = i;
      currentFunctionReturnType = returnType;

      const funcParams = line.match(
        /\b((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:[,:)]|$)/
      );

      if (funcParams) {
        const paramMatch = funcParams[0].match(
          /\b((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)/
        );

        if (paramMatch) {
          currentFunctionFirstParamType = paramMatch[1]!;
          debugLog(
            `[validateDocument] Found function ${funcName} with return type ${returnType} and first param type ${currentFunctionFirstParamType} at line ${i + 1}`
          );
        } else {
          debugLog(`[validateDocument] Found function ${funcName} with return type ${returnType} at line ${i + 1}`);
        }
      } else {
        debugLog(`[validateDocument] Found function ${funcName} with return type ${returnType} at line ${i + 1}`);
      }
    }

    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;
    const prevBraceDepth = currentBraceDepth;
    currentBraceDepth += openBraces - closeBraces;

    if (currentFunctionStart >= 0 && prevBraceDepth === 0 && currentBraceDepth > 0) {
      const existingScope = functionScopes.find(s => s.startLine === currentFunctionStart);
      if (!existingScope) {
        functionScopes.push({
          startLine: currentFunctionStart,
          returnType: currentFunctionReturnType,
          firstParamType: currentFunctionFirstParamType,
          endLine: null
        });

        debugLog(
          `[validateDocument] Function body started at line ${i + 1}, return type: ${currentFunctionReturnType}, first param type: ${currentFunctionFirstParamType}, startLine: ${currentFunctionStart + 1}`
        );
      }
    }

    if (currentFunctionStart >= 0 && prevBraceDepth === 1 && currentBraceDepth === 0) {
      const scope = functionScopes.find(s => s.startLine === currentFunctionStart);
      if (scope) {
        scope.endLine = i;
        functionReturnTypes.set(scope.startLine, scope.returnType);
        debugLog(
          `[validateDocument] Function ended at line ${i + 1}, startLine: ${currentFunctionStart + 1}, returnType: ${scope.returnType}`
        );
      }

      currentFunctionStart = -1;
      currentFunctionReturnType = null;
      currentFunctionFirstParamType = null;
    }
  }

  debugLog(`[validateDocument] Total functions found: ${functionScopes.length}`);
  for (const scope of functionScopes) {
    debugLog(
      `[validateDocument] Function scope: startLine=${scope.startLine + 1}, endLine=${scope.endLine ? scope.endLine + 1 : 'null'}, returnType=${scope.returnType}, firstParamType=${scope.firstParamType || 'null'}`
    );
  }

  const isAzslFile = fileName.endsWith('.azsl') && !fileName.endsWith('.azsli');
  const nonStaticOptions: { name: string; line: number; fromIndex: boolean }[] = [];
  let hasShaderVariantFallback = false;

  const variantFallbackSemantics = new Set(['SRG_PerDraw', 'SRG_PerPass_WithFallback', 'SRG_RayTracingGlobal']);

  if (isAzslFile) {
    for (const [optionName, optionInfo] of optionIndex.entries()) {
      if (!optionInfo.isStatic) {
        nonStaticOptions.push({ name: optionName, line: -1, fromIndex: true });
        debugLog(`[validateDocument] Found non-static option from index: ${optionName}`);
      }
    }
  }

  let inMultiLineComment = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i] ?? '';
    const trimmedLine = line.trim();

    if (inMultiLineComment) {
      const commentEnd = line.indexOf('*/');
      if (commentEnd !== -1) {
        inMultiLineComment = false;
        line = line.substring(commentEnd + 2);
      } else {
        continue;
      }
    }

    const multiLineStart = line.indexOf('/*');
    if (multiLineStart !== -1) {
      const commentEnd = line.indexOf('*/', multiLineStart + 2);
      if (commentEnd !== -1) {
        line = line.substring(0, multiLineStart) + line.substring(commentEnd + 2);
      } else {
        inMultiLineComment = true;
        line = line.substring(0, multiLineStart);
      }
    }

    const singleLineComment = line.indexOf('//');
    if (singleLineComment !== -1) {
      line = line.substring(0, singleLineComment);
    }

    const processedLine = line.trim();
    if (!processedLine) {
      continue;
    }

    const optionMatch = processedLine.match(/^\s*option\s+(?:bool|int|uint)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[=;]/);
    if (optionMatch) {
      if (!processedLine.includes('static')) {
        const optionName = optionMatch[1]!;
        if (!nonStaticOptions.some(o => o.name === optionName)) {
          nonStaticOptions.push({ name: optionName, line: i, fromIndex: false });
          debugLog(`[validateDocument] Found non-static option in current file: ${optionName} at line ${i + 1}`);
        }
      }
    }

    const srgMatch = processedLine.match(/(?:partial\s+)?ShaderResourceGroup\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*)/);
    if (srgMatch) {
      const srgName = srgMatch[1]!;
      const semanticName = srgMatch[2]!;

      if (!srgSemanticIndex.has(semanticName)) {
        const errorMessage = `Declaration for semantic ${semanticName} used in SRG ${srgName} was not found`;
        diagnostics.push(
          new vscode.Diagnostic(new vscode.Range(i, 0, i, (lines[i] ?? '').length), errorMessage, vscode.DiagnosticSeverity.Error)
        );
        debugLog(
          `[validateDocument] Error: Semantic ${semanticName} used in SRG ${srgName} at line ${i + 1} was not found`
        );
      }

      if (variantFallbackSemantics.has(semanticName)) {
        hasShaderVariantFallback = true;
        debugLog(
          `[validateDocument] Found SRG with ShaderVariantFallback semantic: ${srgName} : ${semanticName} at line ${i + 1}`
        );
      }
    }
  }

  if (isAzslFile) {
    debugLog(
      `[validateDocument] ShaderVariantFallback check: nonStaticOptions=${nonStaticOptions.length}, hasShaderVariantFallback=${hasShaderVariantFallback}`
    );

    if (nonStaticOptions.length > 0 && !hasShaderVariantFallback) {
      const errorMessage = `If you have non-static options, one SRG must be designated as the default ShaderVariantFallback`;
      diagnostics.push(
        new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, lines[0] ? lines[0].length : 0),
          errorMessage,
          vscode.DiagnosticSeverity.Error
        )
      );

      debugLog(
        `[validateDocument] Global error: Found ${nonStaticOptions.length} non-static option(s) (${nonStaticOptions.map(o => o.name).join(', ')}) but no SRG with ShaderVariantFallback semantic`
      );
    }
  }

  const getCurrentFunctionReturnType = (lineNum: number): string | null => {
    debugLog(`[getCurrentFunctionReturnType] Checking line ${lineNum + 1}, functionScopes.length = ${functionScopes.length}`);
    for (let j = functionScopes.length - 1; j >= 0; j--) {
      const scope = functionScopes[j]!;
      debugLog(
        `[getCurrentFunctionReturnType] Scope ${j}: startLine=${scope.startLine + 1}, endLine=${scope.endLine ? scope.endLine + 1 : 'null'}, returnType=${scope.returnType}`
      );
      if (scope.startLine <= lineNum && (!scope.endLine || lineNum <= scope.endLine)) {
        debugLog(`[getCurrentFunctionReturnType] Found matching scope, returnType=${scope.returnType}`);
        return scope.returnType;
      }
    }
    debugLog(`[getCurrentFunctionReturnType] No matching scope found for line ${lineNum + 1}`);
    return null;
  };

  const getCurrentFunctionParameterType = (lineNum: number): string | null => {
    debugLog(`[getCurrentFunctionParameterType] Checking line ${lineNum + 1}, functionScopes.length = ${functionScopes.length}`);
    for (let j = functionScopes.length - 1; j >= 0; j--) {
      const scope = functionScopes[j]!;
      debugLog(
        `[getCurrentFunctionParameterType] Scope ${j}: startLine=${scope.startLine + 1}, endLine=${scope.endLine ? scope.endLine + 1 : 'null'}, firstParamType=${scope.firstParamType || 'null'}`
      );
      if (scope.startLine <= lineNum && (!scope.endLine || lineNum <= scope.endLine)) {
        debugLog(`[getCurrentFunctionParameterType] Found matching scope, firstParamType=${scope.firstParamType || 'null'}`);
        return scope.firstParamType;
      }
    }
    debugLog(`[getCurrentFunctionParameterType] No matching scope found for line ${lineNum + 1}`);
    return null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    if (line.includes('(') && !line.trim().startsWith('//')) {
      const funcParams = line.match(
        /\b((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:[,:)]|$)/g
      );
      if (funcParams) {
        for (const param of funcParams) {
          const paramMatch = param.match(
            /\b((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)/
          );
          if (paramMatch) {
            const fullType = paramMatch[1]!;
            const varName = paramMatch[2]!;
            debugLog(`[validateDocument] Found function param: ${varName} : ${fullType} on line ${i + 1}`);
            if (/^Texture/.test(fullType)) {
              variableTypes.set(varName, fullType);
              debugLog(`[validateDocument] Set variableTypes[${varName}] = ${fullType} (Texture param)`);
            } else if (/^Sampler/.test(fullType)) {
              variableTypes.set(varName, fullType);
              debugLog(`[validateDocument] Set variableTypes[${varName}] = ${fullType} (Sampler param)`);
            } else if (/^(float|int|uint|real|half|double)([2-4])?$/.test(fullType)) {
              variableTypes.set(varName, fullType);
              debugLog(`[validateDocument] Set variableTypes[${varName}] = ${fullType} (vector/scalar param)`);
            } else if (
              knownStructs.has(fullType) ||
              atomTypes.has(fullType) ||
              pascalCaseTypes.has(fullType) ||
              structIndex.has(fullType) ||
              structMembers.has(fullType)
            ) {
              variableTypes.set(varName, fullType);
              debugLog(`[validateDocument] Set variableTypes[${varName}] = ${fullType} (struct/type param)`);
            }
          }
        }
      }
    }
  }

  let varBraceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;
    varBraceDepth += openBraces - closeBraces;

    const constVarDeclMatch = line.match(
      /\bconst\s+((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;=]/
    );
    if (constVarDeclMatch) {
      const fullType = constVarDeclMatch[1]!;
      const varName = constVarDeclMatch[2]!;
      if (!variableDeclarations.has(varName)) {
        variableDeclarations.set(varName, []);
      }
      variableDeclarations.get(varName)!.push({ type: fullType, line: i, braceDepth: varBraceDepth });
      if (/^Texture/.test(fullType)) {
        variableTypes.set(varName, fullType);
      } else if (/^Sampler/.test(fullType)) {
        variableTypes.set(varName, fullType);
      } else if (/^(float|int|uint|real|half|double)([2-4])?$/.test(fullType)) {
        variableTypes.set(varName, fullType);
      } else if (
        knownStructs.has(fullType) ||
        atomTypes.has(fullType) ||
        pascalCaseTypes.has(fullType) ||
        structIndex.has(fullType) ||
        structMembers.has(fullType)
      ) {
        variableTypes.set(varName, fullType);
      }
    }

    const varDeclMatch = line.match(
      /\b((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;=]/
    );
    if (varDeclMatch) {
      let fullType = varDeclMatch[1]!;
      const varName = varDeclMatch[2]!;

      if (varName === 'OUT' || varName === 'out') {
        const funcReturnType = getCurrentFunctionReturnType(i);
        if (funcReturnType) {
          fullType = funcReturnType;
          debugLog(`[validateDocument] OUT variable at line ${i + 1} - using function return type: ${fullType} (was: ${varDeclMatch[1]})`);
        } else {
          debugLog(`[validateDocument] OUT variable at line ${i + 1} - no function return type found, keeping original type: ${fullType}`);
        }
      }

      if (varName === 'IN' || varName === 'in') {
        const funcParamType = getCurrentFunctionParameterType(i);
        if (funcParamType) {
          fullType = funcParamType;
          debugLog(`[validateDocument] IN variable at line ${i + 1} - using function first param type: ${fullType} (was: ${varDeclMatch[1]})`);
        } else {
          debugLog(`[validateDocument] IN variable at line ${i + 1} - no function param type found, keeping original type: ${fullType}`);
        }
      }

      debugLog(`[validateDocument] Found var decl: ${varName} : ${fullType} on line ${i + 1}, braceDepth=${varBraceDepth}`);
      if (!variableDeclarations.has(varName)) {
        variableDeclarations.set(varName, []);
      }
      variableDeclarations.get(varName)!.push({ type: fullType, line: i, braceDepth: varBraceDepth });

      if (/^Texture/.test(fullType)) {
        variableTypes.set(varName, fullType);
        debugLog(`[validateDocument] Set variableTypes[${varName}] = ${fullType} (Texture)`);
      } else if (/^Sampler/.test(fullType)) {
        variableTypes.set(varName, fullType);
        debugLog(`[validateDocument] Set variableTypes[${varName}] = ${fullType} (Sampler)`);
      } else if (/^(float|int|uint|real|half|double)([2-4])?$/.test(fullType)) {
        variableTypes.set(varName, fullType);
        debugLog(`[validateDocument] Set variableTypes[${varName}] = ${fullType} (vector/scalar)`);
      } else if (
        knownStructs.has(fullType) ||
        atomTypes.has(fullType) ||
        pascalCaseTypes.has(fullType) ||
        structIndex.has(fullType) ||
        structMembers.has(fullType)
      ) {
        variableTypes.set(varName, fullType);
        debugLog(
          `[validateDocument] Set variableTypes[${varName}] = ${fullType} (struct/type) - knownStructs=${knownStructs.has(fullType)}, atomTypes=${atomTypes.has(fullType)}, structIndex=${structIndex.has(fullType)}, structMembers=${structMembers.has(fullType)}`
        );
      } else {
        debugLog(
          `[validateDocument] Skipped variableTypes[${varName}] = ${fullType} (unknown type) - knownStructs=${knownStructs.has(fullType)}, atomTypes=${atomTypes.has(fullType)}, structIndex=${structIndex.has(fullType)}, structMembers=${structMembers.has(fullType)}`
        );
      }
    }
  }

  const methodClassContext = new Map<number, string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const methodMatch = line.match(/\b([A-Za-z_][A-Za-z0-9_]*)\s*::\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (methodMatch) {
      const className = methodMatch[1]!;
      if (classMembers.has(className)) {
        let methodBraceDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        let methodStart = i;
        if (methodBraceDepth === 0 && !line.includes('{')) {
          methodStart = i + 1;
        }
        for (let j = methodStart; j < lines.length; j++) {
          const methodLine = lines[j] ?? '';
          if (!/^\s*#/.test(methodLine)) {
            methodBraceDepth += (methodLine.match(/\{/g) || []).length;
            methodBraceDepth -= (methodLine.match(/\}/g) || []).length;
          }
          if (j >= methodStart) {
            methodClassContext.set(j, className);
          }
          if (methodBraceDepth <= 0 && methodLine.includes('}')) {
            break;
          }
        }
      }
    }
  }

  let validationBraceDepth = 0;
  let inBlockComment = false;
  let samplerBlockState: { pendingSampler: boolean; inSampler: boolean; braceDepth: number } | null = null;

  const getVariableTypeAtLineForExpression = (varName: string, lineNum: number): string | null => {
    return getVariableTypeAtLine(varName, lineNum, validationBraceDepth);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;
    validationBraceDepth += openBraces - closeBraces;

    if (!samplerBlockState) {
      samplerBlockState = {
        pendingSampler: false,
        inSampler: false,
        braceDepth: 0
      };
    }

    if (!samplerBlockState.inSampler) {
      if (/^\s*Sampler\b/.test(line)) {
        samplerBlockState.pendingSampler = true;
      }

      // Allow the opening brace to appear on a subsequent line.
      if (samplerBlockState.pendingSampler) {
        if (line.includes('{')) {
          samplerBlockState.inSampler = true;
          samplerBlockState.pendingSampler = false;
          samplerBlockState.braceDepth = 1;
        } else {
          // Keep pendingSampler=true until we see the opening '{' or we hit a ';' (declaration without block).
          if (line.includes(';')) {
            samplerBlockState.pendingSampler = false;
          }
        }
      }
    } else {
      const propMatch = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (propMatch) {
        const prop = propMatch[1]!;
        if (!samplerPropertyNames.has(prop)) {
          const startCol = line.indexOf(prop);
          const endCol = startCol >= 0 ? startCol + prop.length : line.length;
          const range = new vscode.Range(i, Math.max(0, startCol), i, Math.max(0, endCol));
          diagnostics.push(new vscode.Diagnostic(range, `unknown sampler property: ${prop}`, vscode.DiagnosticSeverity.Error));
        } else if (Object.prototype.hasOwnProperty.call(samplerPropertyEnumValues, prop)) {
          const withoutLineComment = line.replace(/\/\/.*$/, '');
          const eqIdx = withoutLineComment.indexOf('=');
          const afterEq = eqIdx >= 0 ? withoutLineComment.substring(eqIdx + 1) : '';
          const rhs = afterEq.replace(/;.*$/, '').trim();
          const expectedValues = samplerPropertyEnumValues[prop]!;
          const expected = expectedValues.map(v => `'${v}'`).join(', ');
          const rhsTokenMatch = rhs.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
          const rhsToken = rhsTokenMatch?.[1] ?? null;

          if (rhs.length === 0) {
            let nextToken: { text: string; line: number; col: number } | null = null;

            for (let look = i + 1; look < lines.length; look++) {
              const lookLineRaw = lines[look] ?? '';
              const lookLine = lookLineRaw.replace(/\/\/.*$/, '');
              const trimmedLook = lookLine.trim();
              if (trimmedLook.length === 0) continue;
              if (/^\s*#/.test(lookLineRaw)) continue;

              const m = lookLine.match(/\b([A-Za-z_][A-Za-z0-9_]*)\b/);
              if (m) {
                const tokenText = m[1]!;
                const tokenCol = lookLine.indexOf(tokenText);
                nextToken = { text: tokenText, line: look, col: Math.max(0, tokenCol) };
              }
              break;
            }

            if (nextToken) {
              const isKeyword = samplerPropertyNames.has(nextToken.text);
              const extra = isKeyword ? ` (${nextToken.text} is a keyword)` : '';
              const range = new vscode.Range(nextToken.line, nextToken.col, nextToken.line, nextToken.col + nextToken.text.length);
              diagnostics.push(
                new vscode.Diagnostic(
                  range,
                  `syntax error: mismatched input '${nextToken.text}' expecting {${expected}}${extra}`,
                  vscode.DiagnosticSeverity.Error
                )
              );
            } else if (eqIdx >= 0) {
              const range = new vscode.Range(i, eqIdx, i, eqIdx + 1);
              diagnostics.push(
                new vscode.Diagnostic(range, `syntax error: missing value for '${prop}' (expecting {${expected}})`, vscode.DiagnosticSeverity.Error)
              );
            }
          } else if (rhsToken) {
            const isAllowed = expectedValues.includes(rhsToken);
            if (!isAllowed) {
              const tokenCol = withoutLineComment.indexOf(rhsToken, eqIdx >= 0 ? eqIdx + 1 : 0);
              const range = new vscode.Range(i, Math.max(0, tokenCol), i, Math.max(0, tokenCol) + rhsToken.length);
              diagnostics.push(
                new vscode.Diagnostic(
                  range,
                  `syntax error: mismatched input '${rhsToken}' expecting {${expected}} (${rhsToken} was unexpected)`,
                  vscode.DiagnosticSeverity.Error
                )
              );
            }
          }
        } else if (Object.prototype.hasOwnProperty.call(samplerPropertyNumericKind, prop)) {
          const kind = samplerPropertyNumericKind[prop]!;
          const withoutLineComment = line.replace(/\/\/.*$/, '');
          const eqIdx = withoutLineComment.indexOf('=');
          const afterEq = eqIdx >= 0 ? withoutLineComment.substring(eqIdx + 1) : '';
          const rhs = afterEq.replace(/;.*$/, '').trim();

          const expecting = kind === 'int' ? 'IntegerLiteral' : 'FloatingLiteral';
          const isNumberLiteral = (s: string): boolean => /^([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?f?\b/.test(s);
          const isIntegerLiteral = (s: string): boolean => /^[0-9]+[uU]?\b/.test(s);

          const getNextToken = (): { text: string; line: number; col: number } | null => {
            for (let look = i + 1; look < lines.length; look++) {
              const lookLineRaw = lines[look] ?? '';
              const lookLine = lookLineRaw.replace(/\/\/.*$/, '');
              const trimmedLook = lookLine.trim();
              if (trimmedLook.length === 0) continue;
              if (/^\s*#/.test(lookLineRaw)) continue;

              const m = lookLine.match(/\b([A-Za-z_][A-Za-z0-9_]*)\b/);
              if (m) {
                const tokenText = m[1]!;
                const tokenCol = lookLine.indexOf(tokenText);
                return { text: tokenText, line: look, col: Math.max(0, tokenCol) };
              }
              break;
            }
            return null;
          };

          if (rhs.length === 0) {
            const nextToken = getNextToken();
            if (nextToken) {
              const isKeyword = samplerPropertyNames.has(nextToken.text);
              const extra = isKeyword ? ` (${nextToken.text} is a keyword)` : '';
              const range = new vscode.Range(nextToken.line, nextToken.col, nextToken.line, nextToken.col + nextToken.text.length);
              diagnostics.push(
                new vscode.Diagnostic(
                  range,
                  `syntax error: mismatched input '${nextToken.text}' expecting ${expecting}${extra}`,
                  vscode.DiagnosticSeverity.Error
                )
              );
            } else if (eqIdx >= 0) {
              const range = new vscode.Range(i, eqIdx, i, eqIdx + 1);
              diagnostics.push(new vscode.Diagnostic(range, `syntax error: missing value for '${prop}' (expecting ${expecting})`, vscode.DiagnosticSeverity.Error));
            }
          } else {
            const identMatch = rhs.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
            if (identMatch) {
              const tokenText = identMatch[1]!;
              const tokenCol = withoutLineComment.indexOf(tokenText, eqIdx >= 0 ? eqIdx + 1 : 0);
              const isKeyword = samplerPropertyNames.has(tokenText);
              const extra = isKeyword ? ` (${tokenText} is a keyword)` : ` (${tokenText} was unexpected)`;
              const range = new vscode.Range(i, Math.max(0, tokenCol), i, Math.max(0, tokenCol) + tokenText.length);
              diagnostics.push(
                new vscode.Diagnostic(
                  range,
                  `syntax error: mismatched input '${tokenText}' expecting ${expecting}${extra}`,
                  vscode.DiagnosticSeverity.Error
                )
              );
            } else if (!isNumberLiteral(rhs)) {
              const firstNonSpace = afterEq.search(/\S/);
              const col = eqIdx >= 0 ? eqIdx + 1 + Math.max(0, firstNonSpace) : 0;
              const range = new vscode.Range(i, col, i, col + 1);
              diagnostics.push(new vscode.Diagnostic(range, `syntax error: mismatched input '${rhs[0] ?? ''}' expecting ${expecting}`, vscode.DiagnosticSeverity.Error));
            } else if (kind === 'int' && !isIntegerLiteral(rhs)) {
              const firstNonSpace = afterEq.search(/\S/);
              const col = eqIdx >= 0 ? eqIdx + 1 + Math.max(0, firstNonSpace) : 0;
              const endCol = col + rhs.length;
              const range = new vscode.Range(i, col, i, endCol);
              diagnostics.push(new vscode.Diagnostic(range, `syntax error: mismatched input '${rhs}' expecting ${expecting}`, vscode.DiagnosticSeverity.Error));
            }
          }
        }
      }

      samplerBlockState.braceDepth += openBraces - closeBraces;
      if (samplerBlockState.braceDepth <= 0 || /^\s*};\s*$/.test(line)) {
        samplerBlockState.inSampler = false;
        samplerBlockState.pendingSampler = false;
        samplerBlockState.braceDepth = 0;
      }
    }

    if (/^\s*\/\//.test(line)) {
      continue;
    }

    if (/^\s*#/.test(line)) {
      const includeMatch = line.match(/^\s*#\s*include\s*[<\"]([^>\"]+)[>\"]/);
      if (includeMatch) {
        const includePath = includeMatch[1]!;
        let target = resolveIncludeTarget(includePath);
        try {
          target = includes.resolveIncludeWithFallback(includePath, target, documentDir, vscode.workspace.workspaceFolders);
        } catch {
        }
        if (!target) {
          const isProjectProvidedSrgi = !includePath.includes('/') && /\.srgi$/i.test(includePath);
          if (isProjectProvidedSrgi) {
            continue;
          }
          const startCol = line.indexOf(includePath);
          const endCol = startCol >= 0 ? startCol + includePath.length : line.length;
          const range = new vscode.Range(i, Math.max(0, startCol), i, Math.max(0, endCol));
          diagnostics.push(new vscode.Diagnostic(range, `could not resolve include: ${includePath}`, vscode.DiagnosticSeverity.Error));
        }
      }
      continue;
    }

    if (methodClassContext.has(i)) {
      const className = methodClassContext.get(i)!;
      if (classMembers.has(className)) {
        const members = classMembers.get(className)!;
        for (const member of members) {
          declarations.add(member);
        }
      }
    }

    let lineWithoutStrings = line;
    lineWithoutStrings = lineWithoutStrings.replace(/"[^"]*"/g, '""');
    const blockCommentStart = lineWithoutStrings.indexOf('/*');
    const blockCommentEnd = lineWithoutStrings.indexOf('*/');
    if (blockCommentStart >= 0) {
      if (blockCommentEnd >= 0 && blockCommentEnd > blockCommentStart) {
        inBlockComment = false;
      } else {
        inBlockComment = true;
      }
    } else if (blockCommentEnd >= 0 && inBlockComment) {
      inBlockComment = false;
    }

    const originalHasComment = /\/\//.test(line) || /\/\*/.test(line) || inBlockComment;
    lineWithoutStrings = lineWithoutStrings.replace(/\/\*[\s\S]*?\*\//g, '');
    lineWithoutStrings = lineWithoutStrings.replace(/\/\/.*$/g, '');
    const trimmedAfterComments = lineWithoutStrings.trim();

    if (trimmedAfterComments.length > 0) {
      const hasDotAtEnd = /\.\s*$/.test(trimmedAfterComments);
      if (hasDotAtEnd) {
        debugLog(`[SYNTAX CHECK] Line ${i + 1}: has dot at end`);
        debugLog(`  Original line: "${line}"`);
        debugLog(`  Has comment: ${originalHasComment}, inBlockComment: ${inBlockComment}`);
        debugLog(`  After removing comments: "${trimmedAfterComments}"`);
      }

      if (!originalHasComment && !inBlockComment) {
        const syntaxErrorMatch = trimmedAfterComments.match(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*;$/);
        if (syntaxErrorMatch) {
          debugLog(`[SYNTAX ERROR] Line ${i + 1}: Found identifier.; pattern`);
          const varName = syntaxErrorMatch[1]!;
          const pos = lineWithoutStrings.indexOf(varName);
          if (pos >= 0) {
            const range = new vscode.Range(i, pos, i, pos + varName.length);
            diagnostics.push(new vscode.Diagnostic(range, `syntax error: incomplete member access`, vscode.DiagnosticSeverity.Error));
          }
        }

        const incompleteAccessMatch = trimmedAfterComments.match(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*$/);
        if (incompleteAccessMatch) {
          debugLog(`[SYNTAX ERROR] Line ${i + 1}: Found identifier. pattern (no semicolon)`);
          debugLog(`  Matched identifier: "${incompleteAccessMatch[1]}"`);
          const varName = incompleteAccessMatch[1]!;
          const pos = lineWithoutStrings.indexOf(varName);
          if (pos >= 0) {
            const range = new vscode.Range(i, pos, i, pos + varName.length);
            diagnostics.push(new vscode.Diagnostic(range, `syntax error: incomplete member access`, vscode.DiagnosticSeverity.Error));
          }
        }

        const looksLikeStatementNeedingSemicolon = () => {
          if (trimmedAfterComments.endsWith(';')) return false;
          if (trimmedAfterComments.endsWith('.') || /::\s*$/.test(trimmedAfterComments)) return false;
          if (trimmedAfterComments.endsWith('{') || trimmedAfterComments.endsWith('}') || trimmedAfterComments.endsWith(',')) return false;
          if (/^[A-Z_][A-Z0-9_]*$/.test(trimmedAfterComments)) return false;
          for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
            const nl = (lines[j] || '').trim();
            if (!nl) continue;
            if (nl.startsWith('//')) continue;
            if (nl.startsWith('{')) return false;
            break;
          }
          if (/^\s*(if|for|while|switch)\b/.test(trimmedAfterComments)) return false;
          if (/^\s*(struct|class|namespace|ShaderResourceGroup|cbuffer|tbuffer)\b/.test(trimmedAfterComments)) return false;
          if (/^\s*return\b/.test(trimmedAfterComments)) return false;
          if (/^\s*(break|continue)\b/.test(trimmedAfterComments)) return false;
          if (/[^=!<>]=[^=]/.test(trimmedAfterComments)) return true;
          if (
            /^\s*(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|[A-Z][A-Za-z0-9_]*)\s+[A-Za-z_][A-Za-z0-9_]*\s*$/.test(
              trimmedAfterComments
            )
          )
            return true;
          return false;
        };

        if (looksLikeStatementNeedingSemicolon()) {
          const endCol = (lines[i] ?? '').length;
          const startCol = Math.max(0, endCol - 1);
          const range = new vscode.Range(i, startCol, i, endCol);
          diagnostics.push(new vscode.Diagnostic(range, `missing ';' at end of statement`, vscode.DiagnosticSeverity.Error));
        }
      } else if (hasDotAtEnd) {
        debugLog(`[SYNTAX CHECK] Line ${i + 1}: Skipped check because original line has comment or in block comment`);
      }
    }

    const incompleteDeclMatch = lineWithoutStrings.match(
      /^\s*(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|[A-Z][A-Za-z0-9_]*)\s*(?:\/\/.*)?$/
    );
    if (incompleteDeclMatch) {
      const trimmed = lineWithoutStrings.trim();
      if (/^[A-Z_][A-Z0-9_]*$/.test(trimmed)) {
        continue;
      }
      if (!trimmed.match(/\breturn\s+/) && !trimmed.match(/\([^)]*\)\s*$/) && !trimmed.match(/^\s*\/\//)) {
        const typeMatch = trimmed.match(
          /^(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|[A-Z][A-Za-z0-9_]*)/
        );
        if (typeMatch) {
          const typeName = typeMatch[0]!;
          const pos = lineWithoutStrings.indexOf(typeName);
          const range = new vscode.Range(i, pos, i, pos + typeName.length);
          diagnostics.push(new vscode.Diagnostic(range, `syntax error: incomplete variable declaration`, vscode.DiagnosticSeverity.Error));
        }
      }
    }

    const identifierRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
    let match: RegExpExecArray | null;
    while ((match = identifierRegex.exec(lineWithoutStrings)) !== null) {
      const identifier = match[1]!;
      const pos = match.index;
      const beforeMatch = lineWithoutStrings.substring(0, pos);
      const afterMatch = lineWithoutStrings.substring(pos + identifier.length);

      if (builtinIdentifiers.has(identifier)) {
        continue;
      }
      if (declarations.has(identifier)) {
        continue;
      }
      if (/^\s*\(/.test(afterMatch) && declarations.has(identifier)) {
        continue;
      }

      debugLog(`[validateDocument] Checking identifier '${identifier}' on line ${i + 1}, col ${pos}`);

      if (/\./.test(beforeMatch) || /::/.test(beforeMatch)) {
        const beforeAccess = beforeMatch.trim();
        const srgBeforeMemberMatch = beforeAccess.match(/([A-Za-z_][A-Za-z0-9_]*)::\s*$/);
        if (srgBeforeMemberMatch) {
          const srgName = srgBeforeMemberMatch[1]!;
          const fullSrgMember = `${srgName}::${identifier}`;
          debugLog(`[validateDocument] Checking SRG member pattern: ${fullSrgMember}`);
          let memberFound = false;
          if (declarations.has(fullSrgMember)) {
            debugLog(`[validateDocument] Found SRG member in declarations: ${fullSrgMember}`);
            memberFound = true;
          } else if (srgMembers.has(srgName)) {
            const members = srgMembers.get(srgName)!;
            if (members.has(identifier)) {
              debugLog(`[validateDocument] Found SRG member in srgMembers: ${fullSrgMember}`);
              memberFound = true;
            }
          } else if (srgMemberIndex.has(fullSrgMember)) {
            debugLog(`[validateDocument] Found SRG member in srgMemberIndex: ${fullSrgMember}`);
            memberFound = true;
          }
          if (memberFound) {
            continue;
          }
          if (atomTypes.has(srgName) || declarations.has(srgName) || srgMembers.has(srgName)) {
            debugLog(`[validateDocument] SRG ${srgName} exists but member ${identifier} not found`);
            const range = new vscode.Range(i, pos, i, pos + identifier.length);
            diagnostics.push(new vscode.Diagnostic(range, `no member named '${identifier}' in SRG '${srgName}'`, vscode.DiagnosticSeverity.Error));
            continue;
          }
        }

        const srgMemberMatch = beforeAccess.match(/([A-Za-z_][A-Za-z0-9_]*)::([A-Za-z_][A-Za-z0-9_]*)\s*\.(?![^.]*\.)/);
        const expressionBeforeDot = beforeAccess.substring(0, beforeAccess.lastIndexOf('.'));
        let exprType: string | null = null;
        if (expressionBeforeDot.trim().endsWith(')')) {
          exprType = getExpressionType(document, expressionBeforeDot, i, v => getVariableTypeAtLineForExpression(v, i));
          if (exprType) {
            debugLog(`[validateDocument] Found expression type: ${exprType} for '${expressionBeforeDot}'`);
          }
        }

        let varMatch: RegExpExecArray | null = null;
        if (!srgMemberMatch && !exprType) {
          const allMatches: RegExpExecArray[] = [];
          let m: RegExpExecArray | null;
          const varPattern = /([A-Za-z_][A-Za-z0-9_]*)\s*\./g;
          while ((m = varPattern.exec(beforeAccess)) !== null) {
            allMatches.push(m);
          }
          if (allMatches.length > 0) {
            varMatch = allMatches[allMatches.length - 1]!;
          }
        }

        let varName: string | null = null;
        let varType: string | null = exprType;
        debugLog(
          `[validateDocument] Member access on line ${i + 1}, col ${pos}: beforeAccess="${beforeAccess}", identifier="${identifier}", exprType=${exprType}`
        );

        if (srgMemberMatch) {
          const srgName = srgMemberMatch[1]!;
          const memberName = srgMemberMatch[2]!;
          const fullName = `${srgName}::${memberName}`;
          debugLog(`[validateDocument] SRG member access: ${fullName}`);
          let memberExists = declarations.has(fullName) || srgMemberIndex.has(fullName);
          if (!memberExists && srgMembers.has(srgName)) {
            const members = srgMembers.get(srgName)!;
            memberExists = members.has(memberName);
          }
          if (!memberExists) {
            if (atomTypes.has(srgName) || declarations.has(srgName) || srgMembers.has(srgName)) {
              debugLog(`[validateDocument] SRG ${srgName} exists but member ${memberName} not found`);
              const memberNamePos = line.indexOf(memberName, pos - 100);
              if (memberNamePos >= 0) {
                const range = new vscode.Range(i, memberNamePos, i, memberNamePos + memberName.length);
                diagnostics.push(new vscode.Diagnostic(range, `no member named '${memberName}' in SRG '${srgName}'`, vscode.DiagnosticSeverity.Error));
              }
              continue;
            }
          }

          if (variableTypes.has(fullName)) {
            varType = variableTypes.get(fullName)!;
            debugLog(`[validateDocument] Found varType for ${fullName}: ${varType}`);
          } else {
            debugLog(`[validateDocument] No varType found for ${fullName}, checking srgMemberIndex...`);
            if (srgMemberIndex.has(fullName)) {
              const memberInfo = srgMemberIndex.get(fullName);
              if (memberInfo && memberInfo.type) {
                varType = memberInfo.type;
                debugLog(`[validateDocument] Found varType from srgMemberIndex for ${fullName}: ${varType}`);
              }
            }
            if (!varType && srgMembers.has(srgName)) {
              const members = srgMembers.get(srgName)!;
              if (members.has(memberName)) {
                debugLog(`[validateDocument] Member ${fullName} exists but type unknown`);
              }
            }
          }
        } else if (varMatch) {
          varName = varMatch[1]!;
          debugLog(`[validateDocument] Variable access: ${varName} on line ${i + 1}, checking member '${identifier}'`);

          const expressionBeforeDot2 = beforeAccess.substring(0, beforeAccess.lastIndexOf('.'));
          const exprType2 = getExpressionType(document, expressionBeforeDot2, i, v => getVariableTypeAtLineForExpression(v, i));
          if (exprType2) {
            varType = exprType2;
            debugLog(`[validateDocument] Inferred type from expression '${expressionBeforeDot2}': ${varType}`);
          } else {
            const exprMatch = beforeAccess.match(/([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\./);
            if (exprMatch) {
              const funcName = exprMatch[1]!;
              if (funcName === 'mul') {
                const mulArgs = extractFunctionCallArgs(expressionBeforeDot2, 'mul');
                if (mulArgs && mulArgs.length >= 2) {
                  const secondArg = mulArgs[1]!.trim();
                  const vectorMatch = secondArg.match(/(float|int|uint|bool|real|half)([2-4])\s*\(/);
                  if (vectorMatch) {
                    varType = vectorMatch[1]! + vectorMatch[2]!;
                    debugLog(`[validateDocument] Inferred type from mul() second arg constructor: ${varType}`);
                  } else {
                    const varMatch2 = secondArg.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
                    if (varMatch2) {
                      const argVarType = getVariableTypeAtLineForExpression(varMatch2[1]!, i);
                      if (argVarType && isVectorType(argVarType)) {
                        varType = argVarType;
                        debugLog(`[validateDocument] Inferred type from mul() second arg variable: ${varType}`);
                      }
                    }
                  }
                }
              }
            }
          }

          if (!varType && (varName === 'OUT' || varName === 'out')) {
            const funcReturnType = getCurrentFunctionReturnType(i);
            if (funcReturnType) {
              varType = funcReturnType;
              debugLog(`[validateDocument] OUT variable at line ${i + 1} - using function return type: ${varType}`);
            }
          }

          if (!varType && (varName === 'IN' || varName === 'in')) {
            const funcParamType = getCurrentFunctionParameterType(i);
            if (funcParamType) {
              varType = funcParamType;
              debugLog(`[validateDocument] IN variable at line ${i + 1} - using function first param type: ${varType}`);
            }
          }

          if (!varType) {
            varType = getVariableTypeAtLine(varName, i, validationBraceDepth);
            if (varType) {
              debugLog(`[validateDocument] Found varType for ${varName} using getVariableTypeAtLine: ${varType}`);
            }
          }

          if (!varType) {
            debugLog(`[validateDocument] ${varName} not in variableTypes, checking SRG members...`);
            for (const [srgName, members] of srgMembers.entries()) {
              if (members.has(varName)) {
                const fullName = `${srgName}::${varName}`;
                if (variableTypes.has(fullName)) {
                  varType = variableTypes.get(fullName)!;
                  debugLog(`[validateDocument] Found varType for ${fullName}: ${varType}`);
                  break;
                }
              }
            }
            if (!varType && (atomTypes.has(varName) || pascalCaseTypes.has(varName) || knownStructs.has(varName) || structIndex.has(varName))) {
              varType = varName;
              debugLog(`[validateDocument] Using varName as varType: ${varType} (found in atomTypes/pascalCaseTypes/knownStructs/structIndex)`);
            }
            if (!varType) {
              debugLog(
                `[validateDocument] No varType found for ${varName} - atomTypes.has=${atomTypes.has(varName)}, structIndex.has=${structIndex.has(varName)}, structMembers.has=${structMembers.has(varName)}`
              );
            }
          }
        }

        if (srgMemberMatch && !varType) {
          const srgName = srgMemberMatch[1]!;
          const memberName = srgMemberMatch[2]!;
          const fullName = `${srgName}::${memberName}`;
          let memberExists = declarations.has(fullName) || srgMemberIndex.has(fullName);
          if (!memberExists && srgMembers.has(srgName)) {
            const members = srgMembers.get(srgName)!;
            memberExists = members.has(memberName);
          }
          if (memberExists) {
            const isValidSwizzle = /^[xyzwrgba]{1,4}$/.test(identifier);
            debugLog(
              `[validateDocument] SRG member ${fullName} exists but type unknown, checking swizzle: identifier='${identifier}', isValidSwizzle=${isValidSwizzle}`
            );
            if (!isValidSwizzle) {
              const range = new vscode.Range(i, pos, i, pos + identifier.length);
              diagnostics.push(new vscode.Diagnostic(range, `invalid swizzle property '${identifier}'`, vscode.DiagnosticSeverity.Error));
            } else {
              debugLog(`[validateDocument] Valid swizzle for SRG member ${fullName}`);
            }
            continue;
          }

          debugLog(`[validateDocument] Checking atomTypeMembers for '${varType}': has=${varType ? atomTypeMembers.has(varType) : false}`);
          if (varType && atomTypeMembers.has(varType)) {
            const members = atomTypeMembers.get(varType)!;
            debugLog(`[validateDocument] atomTypeMembers['${varType}'] has '${identifier}': ${members.has(identifier)}`);
            if (members.has(identifier)) {
              debugLog(`[validateDocument] Found member '${identifier}' in atomTypeMembers['${varType}']`);
              continue;
            }
            const range = new vscode.Range(i, pos, i, pos + identifier.length);
            diagnostics.push(new vscode.Diagnostic(range, `no member named '${identifier}' in type '${varType}'`, vscode.DiagnosticSeverity.Error));
            continue;
          }

          debugLog(
            `[validateDocument] Checking structMembers/structIndex/atomTypes for '${varType}': structIndex.has=${varType ? structIndex.has(varType) : false}, structMembers.has=${varType ? structMembers.has(varType) : false}, atomTypes.has=${varType ? atomTypes.has(varType) : false}`
          );

          if (varType && (structIndex.has(varType) || structMembers.has(varType) || atomTypes.has(varType))) {
            if (structMembers.has(varType)) {
              const members = structMembers.get(varType)!;
              debugLog(`[validateDocument] structMembers['${varType}'] has ${members.size} members: ${Array.from(members).join(', ')}`);
              debugLog(`[validateDocument] structMembers['${varType}'] has '${identifier}': ${members.has(identifier)}`);
              if (members.has(identifier)) {
                debugLog(`[validateDocument] Found member '${identifier}' in structMembers['${varType}']`);
                continue;
              }
              if (/^[xyzwrgba]{1,4}$/.test(identifier) && beforeAccess.includes('.') && beforeAccess.lastIndexOf('.') !== beforeAccess.indexOf('.')) {
                continue;
              }
              debugLog(`[validateDocument] Member '${identifier}' NOT found in structMembers['${varType}']`);
              const range = new vscode.Range(i, pos, i, pos + identifier.length);
              diagnostics.push(new vscode.Diagnostic(range, `no member named '${identifier}' in struct '${varType}'`, vscode.DiagnosticSeverity.Error));
              continue;
            } else if (atomTypes.has(varType)) {
              debugLog(`[validateDocument] Type '${varType}' is in atomTypes but NOT in structMembers - this may indicate indexing issue`);
              const range = new vscode.Range(i, pos, i, pos + identifier.length);
              diagnostics.push(
                new vscode.Diagnostic(
                  range,
                  `no member named '${identifier}' in struct '${varType}' (type found but members not indexed)`,
                  vscode.DiagnosticSeverity.Error
                )
              );
              continue;
            }
          }

          if (varType && srgMembers.has(varType)) {
            if (srgMembers.get(varType)!.has(identifier)) {
              continue;
            }
            const range = new vscode.Range(i, pos, i, pos + identifier.length);
            diagnostics.push(new vscode.Diagnostic(range, `no member named '${identifier}' in type '${varType}'`, vscode.DiagnosticSeverity.Error));
            continue;
          }

          const textureMethods = new Set([
            'Sample',
            'SampleLevel',
            'SampleBias',
            'SampleGrad',
            'SampleCmp',
            'SampleCmpLevelZero',
            'Load',
            'GetDimensions',
            'Gather',
            'GatherRed',
            'GatherGreen',
            'GatherBlue',
            'GatherAlpha',
            'GatherCmp',
            'GatherCmpRed'
          ]);

          if (varType && /^Texture/.test(varType)) {
            if (!textureMethods.has(identifier)) {
              const range = new vscode.Range(i, pos, i, pos + identifier.length);
              diagnostics.push(
                new vscode.Diagnostic(
                  range,
                  `no member named '${identifier}' in type '${varType}'. Valid methods: ${Array.from(textureMethods).join(', ')}`,
                  vscode.DiagnosticSeverity.Error
                )
              );
              continue;
            }
          }

          continue;
        }

        if (srgMemberMatch || varMatch) {
          if (/^[xyzwrgba]{1,4}$/.test(identifier)) {
            continue;
          }
          debugLog(`[validateDocument] Skipping '${identifier}' on line ${i + 1}: member access attempted but no type found`);
          continue;
        }
      }

      if (/^[A-Z]/.test(identifier) && (pascalCaseTypes.has(identifier) || atomTypes.has(identifier))) {
        continue;
      }

      const trimmedBefore = beforeMatch.trim();
      if (/:\s*$/.test(beforeMatch)) {
        continue;
      }
      if (/\b(?:struct|ShaderResourceGroup|cbuffer|tbuffer|namespace|class)\s+$/.test(trimmedBefore)) {
        continue;
      }
      if (
        /\b(?:float(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|void|matrix|Texture\w*|Sampler\w*)\s+$/.test(
          trimmedBefore
        )
      ) {
        continue;
      }
      if (/\b[A-Z][A-Za-z0-9_]*\s+$/.test(trimmedBefore)) {
        continue;
      }
      if (/\([^)]*$/.test(beforeMatch) && /\)/.test(afterMatch)) {
        continue;
      }

      const srgMemberMatch2 = line.substring(Math.max(0, pos - 50), pos + identifier.length).match(/([A-Za-z_][A-Za-z0-9_]*)::([A-Za-z_][A-Za-z0-9_]*)/);
      if (srgMemberMatch2 && srgMemberMatch2[2] === identifier) {
        const fullSrgMember = `${srgMemberMatch2[1]}::${srgMemberMatch2[2]}`;
        if (declarations.has(fullSrgMember)) {
          continue;
        }
        if (atomTypes.has(srgMemberMatch2[1]!) || declarations.has(srgMemberMatch2[1]!)) {
          continue;
        }
        if (srgMembers.has(srgMemberMatch2[1]!)) {
          const members = srgMembers.get(srgMemberMatch2[1]!)!;
          if (members.has(identifier)) {
            continue;
          }
        }
      }

      let foundSrgMember = false;
      for (const decl of declarations) {
        if (decl.includes('::') && decl.endsWith(`::${identifier}`)) {
          foundSrgMember = true;
          break;
        }
      }
      if (foundSrgMember) {
        continue;
      }

      if (/[\d.eE+-]\s*$/.test(beforeMatch)) {
        continue;
      }
      if (/<[^>]*$/.test(beforeMatch) || /"[^"]*$/.test(beforeMatch)) {
        continue;
      }

      const atomFunctions = [
        'GetObjectToWorldMatrix',
        'GetObjectToWorldMatrixInverseTranspose',
        'ApplyIblForward',
        'ComputeShadowIndex',
        'EncodeNormalSignedOctahedron',
        'GetVisibility',
        'Init',
        'FinalizeLighting',
        'CalculateRoughnessA',
        'SetAlbedoAndSpecularF0',
        'GetSpecularF0',
        'GetDefaultNormal'
      ];
      if (atomFunctions.includes(identifier)) {
        continue;
      }

      const namespaceFuncMatch = line.substring(Math.max(0, pos - 50), pos + identifier.length).match(/([A-Z][A-Za-z0-9_]*)::([A-Za-z_][A-Za-z0-9_]*)/);
      if (namespaceFuncMatch && namespaceFuncMatch[2] === identifier) {
        continue;
      }

      if (/^[A-Z]/.test(identifier)) {
        continue;
      }

      if (/\?/.test(beforeMatch) || /:/.test(afterMatch.substring(0, 5))) {
        continue;
      }

      const followedBySemicolon = /^\s*;/.test(afterMatch);
      const followedByOperator = /^\s*[+\-*\/%<>!&|=]/.test(afterMatch);
      const followedByParen = /^\s*\(/.test(afterMatch);
      const followedByBracket = /^\s*\[/.test(afterMatch);
      const followedByComma = /^\s*,/.test(afterMatch);
      const followedByClosing = /^\s*[\)\]]/.test(afterMatch);
      const isUsage =
        followedBySemicolon || followedByOperator || followedByParen || followedByBracket || followedByComma || followedByClosing;

      if (!isUsage) {
        debugLog(`[validateDocument] Skipping '${identifier}' on line ${i + 1}: not a usage (isUsage=false)`);
        continue;
      }

      if (/^[a-z_]/.test(identifier)) {
        debugLog(`[validateDocument] Reporting undeclared identifier '${identifier}' on line ${i + 1}, col ${pos}`);
        const range = new vscode.Range(i, pos, i, pos + identifier.length);
        diagnostics.push(
          new vscode.Diagnostic(range, `use of undeclared identifier '${identifier}'`, vscode.DiagnosticSeverity.Error)
        );
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^\s*\/\//.test(line) || /^\s*#/.test(line)) {
      continue;
    }
    let lineWithoutComments = line;
    lineWithoutComments = lineWithoutComments.replace(/\/\*[\s\S]*?\*\//g, '');
    const commentIndex = lineWithoutComments.indexOf('//');
    if (commentIndex !== -1) {
      lineWithoutComments = lineWithoutComments.substring(0, commentIndex);
    }
    const trimmedLine = lineWithoutComments.trim();
    const incompleteDotMatch = trimmedLine.match(/([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*$/);
    if (incompleteDotMatch) {
      if (i + 1 < lines.length) {
        const nextLine = (lines[i + 1] ?? '').trim();
        if (
          /^(float|int|uint|bool|half|double|void|matrix|Texture|Sampler|struct|class|namespace|ShaderResourceGroup|cbuffer|tbuffer|#|\/\/|\/\*)/.test(
            nextLine
          ) ||
          /^[A-Z][A-Za-z0-9_]*\s+[A-Za-z_]/.test(nextLine)
        ) {
          const dotPos = line.lastIndexOf('.');
          const range = new vscode.Range(i, dotPos, i, dotPos + 1);
          diagnostics.push(new vscode.Diagnostic(range, `incomplete member access`, vscode.DiagnosticSeverity.Error));
        }
      } else {
        const dotPos = line.lastIndexOf('.');
        const range = new vscode.Range(i, dotPos, i, dotPos + 1);
        diagnostics.push(new vscode.Diagnostic(range, `incomplete member access`, vscode.DiagnosticSeverity.Error));
      }
    }

    const incompleteColonMatch = trimmedLine.match(/([A-Za-z_][A-Za-z0-9_]*)\s*::\s*$/);
    if (incompleteColonMatch) {
      if (i + 1 < lines.length) {
        const nextLine = (lines[i + 1] ?? '').trim();
        if (
          /^(float|int|uint|bool|half|double|void|matrix|Texture|Sampler|struct|class|namespace|ShaderResourceGroup|cbuffer|tbuffer|#|\/\/|\/\*)/.test(
            nextLine
          ) ||
          /^[A-Z][A-Za-z0-9_]*\s+[A-Za-z_]/.test(nextLine)
        ) {
          const colonPos = line.lastIndexOf('::');
          const range = new vscode.Range(i, colonPos, i, colonPos + 2);
          diagnostics.push(new vscode.Diagnostic(range, `incomplete member access`, vscode.DiagnosticSeverity.Error));
        }
      } else {
        const colonPos = line.lastIndexOf('::');
        const range = new vscode.Range(i, colonPos, i, colonPos + 2);
        diagnostics.push(new vscode.Diagnostic(range, `incomplete member access`, vscode.DiagnosticSeverity.Error));
      }
    }

    const dotSemicolonRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*;/g;
    let m: RegExpExecArray | null;
    while ((m = dotSemicolonRegex.exec(lineWithoutComments)) !== null) {
      const dotPos = m.index + m[1]!.length;
      const semicolonPos = lineWithoutComments.indexOf(';', dotPos);
      const range = new vscode.Range(i, dotPos, i, semicolonPos + 1);
      diagnostics.push(new vscode.Diagnostic(range, `syntax error: unexpected ';' after '.'`, vscode.DiagnosticSeverity.Error));
    }

    const doubleDotRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*\./g;
    while ((m = doubleDotRegex.exec(lineWithoutComments)) !== null) {
      const firstDotPos = m.index + m[1]!.length;
      const range = new vscode.Range(i, firstDotPos, i, firstDotPos + 2);
      diagnostics.push(new vscode.Diagnostic(range, `syntax error: unexpected '.' after '.'`, vscode.DiagnosticSeverity.Error));
    }

    const colonSemicolonRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\s*::\s*;/g;
    while ((m = colonSemicolonRegex.exec(lineWithoutComments)) !== null) {
      const colonPos = m.index + m[1]!.length;
      const semicolonPos = lineWithoutComments.indexOf(';', colonPos);
      const range = new vscode.Range(i, colonPos, i, semicolonPos + 1);
      diagnostics.push(new vscode.Diagnostic(range, `syntax error: unexpected ';' after '::'`, vscode.DiagnosticSeverity.Error));
    }
  }

  {
    let structBlockState: { pendingStruct: boolean; inStruct: boolean; braceDepth: number } | null = null;

    const getNextToken = (fromLineExclusive: number): { text: string; line: number; col: number } | null => {
      for (let look = fromLineExclusive + 1; look < lines.length; look++) {
        const raw = lines[look] ?? '';
        if (/^\s*#/.test(raw)) continue;
        const withoutBlockComments = raw.replace(/\/\*[\s\S]*?\*\//g, '');
        const withoutLineComment = withoutBlockComments.replace(/\/\/.*$/, '');
        const trimmed = withoutLineComment.trim();
        if (trimmed.length === 0) continue;

        const m = withoutLineComment.match(/\b([A-Za-z_][A-Za-z0-9_]*)\b/);
        if (!m) return null;
        const text = m[1]!;
        const col = withoutLineComment.indexOf(text);
        return { text, line: look, col: Math.max(0, col) };
      }
      return null;
    };

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i] ?? '';
      if (/^\s*\/\//.test(rawLine) || /^\s*#/.test(rawLine)) continue;

      const lineWithoutBlockComments = rawLine.replace(/\/\*[\s\S]*?\*\//g, '');
      const line = lineWithoutBlockComments.replace(/\/\/.*$/, '');
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;

      if (!structBlockState) {
        structBlockState = { pendingStruct: false, inStruct: false, braceDepth: 0 };
      }

      if (!structBlockState.inStruct) {
        if (/^\s*struct\b/.test(trimmed)) {
          structBlockState.pendingStruct = true;
          if (/{/.test(line)) {
            structBlockState.inStruct = true;
            structBlockState.pendingStruct = false;
            structBlockState.braceDepth = (line.match(/{/g)?.length ?? 0) - (line.match(/}/g)?.length ?? 0);
            if (structBlockState.braceDepth <= 0) {
              structBlockState.inStruct = false;
              structBlockState.braceDepth = 0;
            }
          }
        } else if (structBlockState.pendingStruct) {
          if (/{/.test(line)) {
            structBlockState.inStruct = true;
            structBlockState.pendingStruct = false;
            structBlockState.braceDepth = (line.match(/{/g)?.length ?? 0) - (line.match(/}/g)?.length ?? 0);
            if (structBlockState.braceDepth <= 0) {
              structBlockState.inStruct = false;
              structBlockState.braceDepth = 0;
            }
          }
        }
      } else {
        if (/[^:]\s*:\s*$/.test(line) && !/::\s*$/.test(line)) {
          const next = getNextToken(i);
          if (next) {
            const range = new vscode.Range(next.line, next.col, next.line, next.col + next.text.length);
            diagnostics.push(
              new vscode.Diagnostic(
                range,
                `syntax error: no viable alternative at input '${next.text}' (${next.text} was unexpected)`,
                vscode.DiagnosticSeverity.Error
              )
            );
          } else {
            const colonPos = line.lastIndexOf(':');
            const range = new vscode.Range(i, Math.max(0, colonPos), i, Math.max(0, colonPos) + 1);
            diagnostics.push(
              new vscode.Diagnostic(
                range,
                `syntax error: no viable alternative at input ':'`,
                vscode.DiagnosticSeverity.Error
              )
            );
          }
        }

        const open = line.match(/{/g)?.length ?? 0;
        const close = line.match(/}/g)?.length ?? 0;
        structBlockState.braceDepth += open - close;
        if (structBlockState.braceDepth <= 0) {
          structBlockState.inStruct = false;
          structBlockState.pendingStruct = false;
          structBlockState.braceDepth = 0;
        }
      }
    }
  }

  safeSetDiagnostics(document, diagnosticCollection, diagnostics);
}
