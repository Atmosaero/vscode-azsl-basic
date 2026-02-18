import * as vscode from 'vscode';

export type ParsedAtomMethod = {
  key: string;
  uri: vscode.Uri;
  line: number;
  column: number;
};

export type ParsedAtomMethodsResult = {
  methods: ParsedAtomMethod[];
  properties: Map<string, Set<string>>;
};

const atomTypeAliases: Record<string, string[]> = {
  Surface: ['SurfaceData_StandardPBR', 'SurfaceData_BasePBR', 'Surface'],
  LightingData: ['LightingData_BasePBR', 'LightingData']
};

export function extractAtomMethods(text: string, filePath: string): ParsedAtomMethodsResult {
  const results: ParsedAtomMethod[] = [];
  const properties = new Map<string, Set<string>>();
  const lines = text.split(/\r?\n/);

  let currentClass: string | null = null;
  let inClass = false;
  let classBraceLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
      continue;
    }

    const classMatch = line.match(/\b(?:class|struct)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[:\{]?/);
    if (classMatch) {
      currentClass = classMatch[1];
      inClass = true;
      classBraceLevel = 0;

      for (let j = 0; j < line.length; j++) {
        if (line[j] === '{') classBraceLevel++;
        else if (line[j] === '}') classBraceLevel--;
      }

      if (classBraceLevel === 0 && !line.includes('{')) {
        if (i + 1 < lines.length && (lines[i + 1] || '').trim().startsWith('{')) {
          classBraceLevel = 1;
        }
      }

      continue;
    }

    if (inClass) {
      for (let j = 0; j < line.length; j++) {
        if (line[j] === '{') classBraceLevel++;
        else if (line[j] === '}') classBraceLevel--;
      }

      if (classBraceLevel < 0 && line.includes('};')) {
        inClass = false;
        currentClass = null;
        classBraceLevel = 0;
        continue;
      }
    }

    if (inClass && currentClass) {
      let atomType: string | null = null;
      for (const [type, aliases] of Object.entries(atomTypeAliases)) {
        if (aliases.includes(currentClass)) {
          atomType = type;
          break;
        }
      }

      if (atomType && !line.includes('(') && !trimmedLine.startsWith('#')) {
        const propertyMatch = line.match(
          /^\s*(?:precise\s+)?(?:real(?:[1-4](?:x[1-4])?)?|float(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]+\])?\s*[;=]/
        );

        if (propertyMatch) {
          const propertyName = propertyMatch[1];
          if (atomType === 'Surface' && (propertyName === 'alpha' || propertyName === 'transmission')) {
            continue;
          }
          if (!properties.has(atomType)) {
            properties.set(atomType, new Set<string>());
          }
          properties.get(atomType)!.add(propertyName);
        }
      }

      const methodMatch = line.match(
        /\b(?:void|real|real2|real3|real4|float|float2|float3|float4|int|uint|bool|half|double|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/
      );

      if (methodMatch) {
        const methodName = methodMatch[1];
        const methodStart = methodMatch.index ?? -1;

        if (
          line.match(
            /^\s*(?:void|real|real2|real3|real4|float|float2|float3|float4|int|uint|bool|half|double|[A-Z][A-Za-z0-9_]*)\s+[A-Za-z_][A-Za-z0-9_]*\s*[;=]/
          ) &&
          !line.includes('(')
        ) {
          continue;
        }

        let parenCount = 0;
        let paramEnd = -1;
        for (let j = methodStart + methodMatch[0].length; j < line.length; j++) {
          if (line[j] === '(') parenCount++;
          else if (line[j] === ')') {
            if (parenCount === 0) {
              paramEnd = j;
              break;
            }
            parenCount--;
          }
        }

        if (paramEnd >= 0) {
          const afterParams = line.substring(paramEnd + 1).trim();
          if (
            afterParams.match(/^[;{]/) ||
            afterParams.startsWith('const') ||
            afterParams === '' ||
            afterParams.match(/^\{\s*return/)
          ) {
            const column = line.indexOf(methodName);
            for (const [atomType, aliases] of Object.entries(atomTypeAliases)) {
              if (aliases.includes(currentClass)) {
                const key1 = `${atomType}::${methodName}`;
                const key2 = `${atomType}.${methodName}`;
                results.push({ key: key1, uri: vscode.Uri.file(filePath), line: i, column });
                results.push({ key: key2, uri: vscode.Uri.file(filePath), line: i, column });
                break;
              }
            }
          }
        }
      }
    }

    const implMatch = line.match(
      /\b(?:void|real|real2|real3|real4|float|float2|float3|float4|int|uint|bool|half|double|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)::([A-Za-z_][A-Za-z0-9_]*)\s*\(/
    );

    if (implMatch) {
      const className = implMatch[1];
      const methodName = implMatch[2];
      const implStart = implMatch.index ?? -1;

      let parenCount = 0;
      let paramEnd = -1;
      for (let j = implStart + implMatch[0].length; j < line.length; j++) {
        if (line[j] === '(') parenCount++;
        else if (line[j] === ')') {
          if (parenCount === 0) {
            paramEnd = j;
            break;
          }
          parenCount--;
        }
      }

      if (paramEnd >= 0) {
        const afterParams = line.substring(paramEnd + 1).trim();
        if (afterParams.match(/^\s*\{/) || line.match(/\{\s*$/)) {
          const column = line.indexOf(methodName);
          for (const [atomType, aliases] of Object.entries(atomTypeAliases)) {
            if (aliases.includes(className)) {
              const key1 = `${atomType}::${methodName}`;
              const key2 = `${atomType}.${methodName}`;
              results.push({ key: key1, uri: vscode.Uri.file(filePath), line: i, column });
              results.push({ key: key2, uri: vscode.Uri.file(filePath), line: i, column });
              break;
            }
          }
        }
      }
    }
  }

  return { methods: results, properties };
}
