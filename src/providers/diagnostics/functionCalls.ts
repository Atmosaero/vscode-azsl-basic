import type { FunctionScope } from './functionScopes';

export type FunctionCallIssue = {
  line: number;
  start: number;
  end: number;
  message: string;
};

export type FunctionCallModel = {
  functions: readonly FunctionScope[];
  isKnownFunction(name: string): boolean;
  getVariableType(name: string, line: number): string | null;
};

type ParsedCall = {
  name: string;
  nameStart: number;
  openParen: number;
  closeParen: number;
  arguments: string[];
};

const callPattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
const nonFunctionCalls = new Set(['if', 'for', 'while', 'switch', 'return', 'sizeof']);

export function collectFunctionCallIssues(lines: readonly string[], model: FunctionCallModel): FunctionCallIssue[] {
  const text = lines.join('\n');
  const lineStarts = getLineStarts(text);
  const issues: FunctionCallIssue[] = [];
  const signatures = groupSignatures(model.functions);

  for (const call of parseCalls(text)) {
    const position = getPosition(lineStarts, call.nameStart);
    const previous = previousNonWhitespace(text, call.nameStart);
    if (previous === '.' || previous === ':') continue;
    if (nonFunctionCalls.has(call.name)) continue;
    if (isFunctionDeclaration(call, position.line, model.functions)) continue;
    if (looksLikeFunctionDeclaration(text, lineStarts, call)) continue;

    const localOverloads = signatures.get(call.name);
    if (localOverloads) {
      const arityMatches = localOverloads.filter(signature => {
        const required = signature.parameters.filter(parameter => !parameter.hasDefault).length;
        return required <= call.arguments.length && call.arguments.length <= signature.parameters.length;
      });
      if (arityMatches.length === 0) {
        const expected = [...new Set(localOverloads.map(signature => signature.parameters.length))].sort((a, b) => a - b);
        issues.push({
          line: position.line,
          start: position.column,
          end: position.column + call.name.length,
          message: `no matching function for call to '${call.name}': expected ${formatExpectedCounts(expected)}, got ${call.arguments.length}`
        });
        continue;
      }

      if (!arityMatches.some(signature => argumentsMatch(signature, call.arguments, position.line, model, signatures))) {
        const actualTypes = call.arguments.map(argument => inferArgumentType(argument, position.line, model, signatures) ?? '?');
        issues.push({
          line: position.line,
          start: position.column,
          end: position.column + call.name.length,
          message: `no matching function for call to '${call.name}' with argument types (${actualTypes.join(', ')})`
        });
      }
      continue;
    }

    if (!model.isKnownFunction(call.name)) {
      issues.push({
        line: position.line,
        start: position.column,
        end: position.column + call.name.length,
        message: `use of undeclared function '${call.name}'`
      });
    }
  }

  collectStreamAppendIssues(text, lineStarts, model, signatures, issues);
  return issues;
}

function collectStreamAppendIssues(
  text: string,
  lineStarts: readonly number[],
  model: FunctionCallModel,
  signatures: ReadonlyMap<string, readonly FunctionScope[]>,
  issues: FunctionCallIssue[]
): void {
  const pattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*(Append)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const root = match[1]!;
    const method = match[2]!;
    const methodOffset = match.index + match[0].lastIndexOf(method);
    const position = getPosition(lineStarts, methodOffset);
    const streamType = model.getVariableType(root, position.line);
    const elementType = streamType?.match(/^(?:Point|Line|Triangle)Stream\s*<\s*([^>]+)\s*>$/)?.[1]?.trim();
    if (!elementType) continue;

    const openParen = match.index + match[0].lastIndexOf('(');
    const closeParen = findClosingParen(text, openParen);
    if (closeParen < 0) continue;
    const args = splitArguments(text.substring(openParen + 1, closeParen));
    if (args.length !== 1) {
      issues.push({
        line: position.line,
        start: position.column,
        end: position.column + method.length,
        message: `no matching method for '${streamType}.Append': expected 1 argument, got ${args.length}`
      });
      continue;
    }

    const actualType = inferArgumentType(args[0]!, position.line, model, signatures);
    if (actualType && normalizeType(actualType) !== normalizeType(elementType)) {
      issues.push({
        line: position.line,
        start: position.column,
        end: position.column + method.length,
        message: `cannot append value of type '${actualType}' to '${streamType}'`
      });
    }
  }
}

function parseCalls(text: string): ParsedCall[] {
  const calls: ParsedCall[] = [];
  callPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = callPattern.exec(text)) !== null) {
    const openParen = match.index + match[0].lastIndexOf('(');
    const closeParen = findClosingParen(text, openParen);
    if (closeParen < 0) continue;
    calls.push({
      name: match[1]!,
      nameStart: match.index,
      openParen,
      closeParen,
      arguments: splitArguments(text.substring(openParen + 1, closeParen))
    });
  }
  return calls;
}

function findClosingParen(text: string, openParen: number): number {
  let depth = 0;
  for (let index = openParen; index < text.length; index++) {
    if (text[index] === '(') depth++;
    else if (text[index] === ')' && --depth === 0) return index;
  }
  return -1;
}

function splitArguments(text: string): string[] {
  if (!text.trim()) return [];
  const result: string[] = [];
  let start = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '(') parenDepth++;
    else if (character === ')') parenDepth--;
    else if (character === '[') bracketDepth++;
    else if (character === ']') bracketDepth--;
    else if (character === '{') braceDepth++;
    else if (character === '}') braceDepth--;
    else if (character === ',' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      result.push(text.substring(start, index).trim());
      start = index + 1;
    }
  }
  result.push(text.substring(start).trim());
  return result;
}

function argumentsMatch(
  signature: FunctionScope,
  args: readonly string[],
  line: number,
  model: FunctionCallModel,
  signatures: ReadonlyMap<string, readonly FunctionScope[]>
): boolean {
  return args.every((argument, index) => {
    const actual = inferArgumentType(argument, line, model, signatures);
    const parameter = signature.parameters[index]!;
    return !actual || areCompatibleTypes(parameter.type, actual);
  });
}

function inferArgumentType(
  expression: string,
  line: number,
  model: FunctionCallModel,
  signatures: ReadonlyMap<string, readonly FunctionScope[]>
): string | null {
  const value = expression.trim().replace(/^\((.*)\)$/s, '$1').trim();
  if (/^(?:true|false)$/.test(value)) return 'bool';
  if (/^[+-]?\d+[uU]$/.test(value)) return 'uint';
  if (/^[+-]?\d+$/.test(value)) return 'int';
  if (/^[+-]?(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?[fF]?$/.test(value)) return 'float';

  const constructor = value.match(/^((?:float|real|int|uint|bool|half|double)(?:[1-4](?:x[1-4])?)?)\s*\(/);
  if (constructor) return constructor[1]!;

  const functionCall = value.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
  if (functionCall) {
    const returnTypes = signatures.get(functionCall[1]!)?.map(signature => signature.returnType);
    if (returnTypes && new Set(returnTypes).size === 1) return returnTypes[0]!;
  }

  const variable = value.match(/^([A-Za-z_][A-Za-z0-9_]*)$/);
  return variable ? model.getVariableType(variable[1]!, line) : null;
}

function areCompatibleTypes(expected: string, actual: string): boolean {
  const normalizedExpected = normalizeType(expected);
  const normalizedActual = normalizeType(actual);
  if (normalizedExpected === normalizedActual) return true;
  const numeric = /^(?:float|real|half|double|int|uint)(?:[1-4])?$/;
  return numeric.test(normalizedExpected) && numeric.test(normalizedActual);
}

function normalizeType(type: string): string {
  return type.replace(/\s+/g, '');
}

function groupSignatures(functions: readonly FunctionScope[]): Map<string, FunctionScope[]> {
  const result = new Map<string, FunctionScope[]>();
  for (const signature of functions) {
    const overloads = result.get(signature.name) ?? [];
    overloads.push(signature);
    result.set(signature.name, overloads);
  }
  return result;
}

function isFunctionDeclaration(call: ParsedCall, line: number, functions: readonly FunctionScope[]): boolean {
  return functions.some(signature => signature.startLine === line && signature.name === call.name);
}

function looksLikeFunctionDeclaration(text: string, lineStarts: readonly number[], call: ParsedCall): boolean {
  const position = getPosition(lineStarts, call.nameStart);
  const prefix = text.substring(lineStarts[position.line]!, call.nameStart);
  return /^\s*(?:(?:static|inline)\s+)*(?:void|(?:float|real|int|uint|bool|half|double)(?:[1-4](?:x[1-4])?)?|matrix(?:[1-4]x[1-4])?|[A-Z][A-Za-z0-9_]*(?:\s*<[^>]+>)?)\s+$/.test(prefix);
}

function formatExpectedCounts(counts: readonly number[]): string {
  if (counts.length === 1) return `${counts[0]} argument${counts[0] === 1 ? '' : 's'}`;
  return `${counts.slice(0, -1).join(', ')} or ${counts[counts.length - 1]} arguments`;
}

function previousNonWhitespace(text: string, offset: number): string | null {
  for (let index = offset - 1; index >= 0; index--) {
    if (!/\s/.test(text[index]!)) return text[index]!;
  }
  return null;
}

function getLineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index++) if (text[index] === '\n') starts.push(index + 1);
  return starts;
}

function getPosition(lineStarts: readonly number[], offset: number): { line: number; column: number } {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (lineStarts[middle]! <= offset) low = middle + 1;
    else high = middle - 1;
  }
  const line = Math.max(0, high);
  return { line, column: offset - lineStarts[line]! };
}
