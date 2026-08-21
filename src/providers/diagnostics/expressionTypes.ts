export type VariableTypeLookup = (variableName: string) => string | null;

export function isVectorType(type: string | null | undefined): boolean {
  return Boolean(type && /^(float|int|uint|bool|real|half)[2-4]$/.test(type));
}

export function getSwizzleProperties(type: string): string[] {
  const dimension = Number(type.match(/(\d)$/)?.[1] ?? 0);
  if (dimension < 2 || dimension > 4) return [];

  const result = new Set<string>();
  const alphabets = [['x', 'y', 'z', 'w'], ['r', 'g', 'b', 'a']];
  for (const alphabet of alphabets) {
    const components = alphabet.slice(0, dimension);
    for (let length = 1; length <= 4; length++) {
      appendPermutations(components, length, [], result);
    }
  }
  return [...result].sort();
}

function appendPermutations(components: string[], length: number, prefix: string[], result: Set<string>): void {
  if (prefix.length === length) {
    result.add(prefix.join(''));
    return;
  }
  for (const component of components) appendPermutations(components, length, [...prefix, component], result);
}

export function isValidVectorSwizzle(type: string, property: string): boolean {
  if (!isVectorType(type) || property.length < 1 || property.length > 4) return false;
  const dimension = Number(type.match(/(\d)$/)?.[1] ?? 0);
  const xyzw = 'xyzw'.substring(0, dimension);
  const rgba = 'rgba'.substring(0, dimension);
  return [...property].every(character => xyzw.includes(character)) || [...property].every(character => rgba.includes(character));
}

export function getVectorSwizzleType(type: string, property: string): string | null {
  if (!isValidVectorSwizzle(type, property)) return null;
  const base = type.replace(/[2-4]$/, '');
  return property.length === 1 ? base : `${base}${property.length}`;
}

export function extractFunctionCallArgs(text: string, functionName: string): string[] | null {
  const pattern = new RegExp(`\\b${functionName}\\s*\\(`, 'g');
  let match: RegExpExecArray | null;
  let lastMatch: RegExpExecArray | null = null;
  while ((match = pattern.exec(text)) !== null) lastMatch = match;
  if (!lastMatch) return null;

  const start = lastMatch.index + lastMatch[0].length;
  let depth = 1;
  let argumentStart = start;
  const argumentsFound: string[] = [];
  for (let position = start; position < text.length; position++) {
    const character = text[position];
    if (character === '(') depth++;
    else if (character === ')') depth--;
    else if (character === ',' && depth === 1) {
      argumentsFound.push(text.substring(argumentStart, position).trim());
      argumentStart = position + 1;
    }
    if (depth === 0) {
      argumentsFound.push(text.substring(argumentStart, position).trim());
      return argumentsFound;
    }
  }
  return null;
}

export function inferExpressionType(
  expression: string,
  getVariableType: VariableTypeLookup,
  log: (message: string) => void = () => undefined
): string | null {
  const trimmed = expression.trim();
  if (!trimmed) return null;

  if (/\bmul\s*\(/.test(trimmed)) {
    const args = extractFunctionCallArgs(trimmed, 'mul');
    log(`[inferExpressionType] mul args: ${args ? JSON.stringify(args) : 'null'}`);
    if (args && args.length >= 2) {
      const secondArgument = args[1]!.trim();
      const constructor = secondArgument.match(/(float|int|uint|bool|real|half)([2-4])\s*\(/);
      if (constructor) return constructor[1]! + constructor[2]!;
      const variable = secondArgument.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
      const variableType = variable ? getVariableType(variable[1]!) : null;
      if (isVectorType(variableType)) return variableType;
    }
  }

  const constructor = trimmed.match(/(float|int|uint|bool|real|half)([2-4])\s*\(/);
  return constructor ? constructor[1]! + constructor[2]! : null;
}
