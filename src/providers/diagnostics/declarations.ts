export type ExtractedDeclarations = {
  declarations: Set<string>;
  knownStructs: Set<string>;
  classMembers: Map<string, Set<string>>;
  variableTypes: Map<string, string>;
  structMemberTypes: Map<string, Map<string, string>>;
};

/**
 * Collects the lightweight declaration model consumed by diagnostics.
 * This is intentionally independent from VS Code so it can be tested without
 * an Extension Host. It is not intended to replace the AZSL compiler.
 */
export function extractDiagnosticDeclarations(text: string): ExtractedDeclarations {
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
      if (match?.[1]) declarations.add(match[1]);
    }

    const funcMatch = line.match(
      /\b(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|void|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*\{?/
    );
    if (funcMatch) {
      declarations.add(funcMatch[1]!);
      const params = (funcMatch[2] ?? '').split(',').map(param => param.trim()).filter(Boolean);
      for (const param of params) {
        const paramMatch = param.match(
          /^(?:(?:in|out|inout)\s+)?(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*:|$)/
        );
        if (paramMatch?.[1]) declarations.add(paramMatch[1]);
      }
    }

    const srgMatch = line.match(/\bShaderResourceGroup\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/);
    if (srgMatch) declarations.add(srgMatch[1]!);

    const macroMatch = line.match(/#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (macroMatch) declarations.add(macroMatch[1]!);
  }

  collectSrgMembers(lines, declarations, variableTypes);
  const structMemberTypes = collectStructMembers(lines, knownStructs, declarations);
  const classMembers = collectClassMembers(lines, knownStructs);
  return { declarations, knownStructs, classMembers, variableTypes, structMemberTypes };
}

function collectSrgMembers(lines: string[], declarations: Set<string>, variableTypes: Map<string, string>): void {
  let currentSrg: string | null = null;
  let braceDepth = 0;
  let awaitingBrace = false;

  for (const line of lines) {
    const start = line.match(/\bShaderResourceGroup\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/);
    if (start) {
      currentSrg = start[1]!;
      braceDepth = 0;
      awaitingBrace = !line.includes('{');
    }

    if (!currentSrg) continue;

    const opens = (line.match(/{/g) ?? []).length;
    const closes = (line.match(/}/g) ?? []).length;
    if (awaitingBrace && opens > 0) awaitingBrace = false;
    braceDepth += opens - closes;

    if (!awaitingBrace && braceDepth > 0) {
      const memberMatch = line.match(
        /^\s*(?:(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix)|(Texture\w*)(?:<[^>]+>)?|(Sampler(?:State|ComparisonState|\w*)?)|([A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:[;{]|$)/
      );
      if (memberMatch) {
        const memberName = memberMatch[4]!;
        const key = `${currentSrg}::${memberName}`;
        declarations.add(key);
        const type = memberMatch[1] ?? memberMatch[2] ?? memberMatch[3];
        if (type) variableTypes.set(key, type === 'Sampler' ? 'SamplerState' : type);
      }
    }

    if (!awaitingBrace && braceDepth <= 0 && closes > 0) currentSrg = null;
  }
}

function collectStructMembers(lines: string[], knownStructs: Set<string>, declarations: Set<string>): Map<string, Map<string, string>> {
  const memberTypes = new Map<string, Map<string, string>>();
  const memberPattern = /^\s*(?:(?:precise|noperspective|nointerpolation|centroid|sample)\s+)*((?:float|real|int|uint|bool|half|double)(?:[1-4](?:x[1-4])?)?|matrix(?:[1-4]x[1-4])?|Texture\w*(?:<[^>]+>)?|Sampler\w*|[A-Z][A-Za-z0-9_]*(?:<[^>]+>)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]*\]\s*)?(?::[^;]+)?;/;
  let currentStruct: string | null = null;
  let braceDepth = 0;

  for (const line of lines) {
    const start = line.match(/\bstruct\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
    if (start && knownStructs.has(start[1]!)) {
      currentStruct = start[1]!;
      memberTypes.set(currentStruct, memberTypes.get(currentStruct) ?? new Map());
      const openBrace = line.indexOf('{');
      const closeBrace = line.lastIndexOf('}');
      if (openBrace >= 0 && closeBrace > openBrace) {
        for (const declaration of line.substring(openBrace + 1, closeBrace).split(';')) {
          const member = `${declaration};`.match(memberPattern);
          if (!member) continue;
          declarations.add(`${currentStruct}.${member[2]!}`);
          memberTypes.get(currentStruct)!.set(member[2]!, member[1]!);
        }
        currentStruct = null;
        continue;
      }
    }
    if (!currentStruct) continue;

    braceDepth += (line.match(/{/g) ?? []).length - (line.match(/}/g) ?? []).length;
    if (braceDepth > 0) {
      const member = line.match(memberPattern);
      if (member) {
        declarations.add(`${currentStruct}.${member[2]!}`);
        memberTypes.get(currentStruct)!.set(member[2]!, member[1]!);
      }
    }
    if (braceDepth <= 0 && line.includes('}')) currentStruct = null;
  }
  return memberTypes;
}

function collectClassMembers(lines: string[], knownStructs: Set<string>): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  let currentClass: string | null = null;
  let braceDepth = 0;

  for (const line of lines) {
    const start = line.match(/\bclass\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
    if (start) {
      currentClass = start[1]!;
      knownStructs.add(currentClass);
      result.set(currentClass, result.get(currentClass) ?? new Set());
      braceDepth = 0;
    }
    if (!currentClass) continue;

    if (!/^\s*#/.test(line)) braceDepth += (line.match(/{/g) ?? []).length - (line.match(/}/g) ?? []).length;
    if (braceDepth > 0) {
      const member = line.match(
        /^\s*(?:precise\s+)?(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|Texture\w*|Sampler(?:State|ComparisonState|\w*)?|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;=\(]/
      );
      if (member) result.get(currentClass)!.add(member[1]!);
    }
    if (braceDepth <= 0 && line.includes('}')) currentClass = null;
  }
  return result;
}
