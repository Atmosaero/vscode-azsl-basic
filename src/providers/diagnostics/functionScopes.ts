import { scanLexicalLines } from './lexicalLines';

export type FunctionParameter = {
  name: string;
  type: string;
  line: number;
  hasDefault: boolean;
};

export type FunctionScope = {
  name: string;
  startLine: number;
  signatureEndLine: number;
  endLine: number;
  returnType: string;
  firstParamType: string | null;
  parameters: FunctionParameter[];
};

const typePattern = '(?:void|float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\\w*(?:<[^>]+>)?|Sampler\\w*|[A-Z][A-Za-z0-9_]*(?:<[^>]+>)?)';
const signatureStartPattern = new RegExp(`^\\s*(?:static\\s+|inline\\s+)*(${typePattern})\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*\\(`);
const parameterPattern = new RegExp(`^(?:(?:const|in|out|inout|triangle|line|point|lineadj|triangleadj)\\s+)*(${typePattern})\\s+([A-Za-z_][A-Za-z0-9_]*)(?:\\s*\\[[^\\]]*\\])?(?:\\s*:[^=]+)?(?:\\s*=\\s*[\\s\\S]+)?$`);

function splitParameters(parameters: string): string[] {
  const result: string[] = [];
  let start = 0;
  let angleDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let index = 0; index < parameters.length; index++) {
    const character = parameters[index];
    if (character === '<') angleDepth++;
    else if (character === '>') angleDepth = Math.max(0, angleDepth - 1);
    else if (character === '(') parenDepth++;
    else if (character === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (character === '[') bracketDepth++;
    else if (character === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (character === ',' && angleDepth === 0 && parenDepth === 0 && bracketDepth === 0) {
      result.push(parameters.substring(start, index).trim());
      start = index + 1;
    }
  }
  const last = parameters.substring(start).trim();
  if (last) result.push(last);
  return result;
}

function findParameterLine(lines: readonly string[], startLine: number, endLine: number, name: string): number {
  const pattern = new RegExp(`\\b${name}\\b`);
  for (let line = startLine; line <= endLine; line++) {
    if (pattern.test(lines[line] ?? '')) return line;
  }
  return startLine;
}

export function analyzeFunctionScopes(text: string): FunctionScope[] {
  const lexicalLines = scanLexicalLines(text);
  const codeLines = lexicalLines.map(line => line.code);
  const scopes: FunctionScope[] = [];

  for (let startLine = 0; startLine < lexicalLines.length; startLine++) {
    const startMatch = codeLines[startLine]!.match(signatureStartPattern);
    if (!startMatch) continue;

    let signatureEndLine = startLine;
    let signatureText = '';
    let parenDepth = 0;
    let sawOpenParen = false;
    for (; signatureEndLine < lexicalLines.length; signatureEndLine++) {
      const code = codeLines[signatureEndLine]!;
      signatureText += `${code} `;
      for (const character of code) {
        if (character === '(') {
          parenDepth++;
          sawOpenParen = true;
        } else if (character === ')') {
          parenDepth--;
        }
      }
      if (sawOpenParen && parenDepth <= 0) break;
      if (signatureEndLine - startLine >= 64) break;
    }
    if (!sawOpenParen || parenDepth > 0) continue;

    const openParen = signatureText.indexOf('(');
    const closeParen = signatureText.lastIndexOf(')');
    if (openParen < 0 || closeParen < openParen) continue;
    const parameters = splitParameters(signatureText.substring(openParen + 1, closeParen))
      .map(parameter => parameter.match(parameterPattern))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map(match => ({
        type: match[1]!,
        name: match[2]!,
        line: findParameterLine(codeLines, startLine, signatureEndLine, match[2]!),
        hasDefault: match[0]!.includes('=')
      }));

    let bodyStartLine = signatureEndLine;
    while (bodyStartLine < lexicalLines.length && !codeLines[bodyStartLine]!.includes('{')) {
      if (/;\s*$/.test(codeLines[bodyStartLine]!)) break;
      bodyStartLine++;
    }
    if (bodyStartLine >= lexicalLines.length || !codeLines[bodyStartLine]!.includes('{')) continue;

    let bodyDepth = 0;
    let endLine = bodyStartLine;
    for (; endLine < lexicalLines.length; endLine++) {
      bodyDepth += lexicalLines[endLine]!.braceDelta;
      if (bodyDepth <= 0) break;
    }

    scopes.push({
      name: startMatch[2]!,
      startLine,
      signatureEndLine,
      endLine: Math.min(endLine, lexicalLines.length - 1),
      returnType: startMatch[1]!,
      firstParamType: parameters[0]?.type ?? null,
      parameters
    });
    startLine = Math.min(endLine, lexicalLines.length - 1);
  }

  return scopes;
}

export function findFunctionScope(scopes: readonly FunctionScope[], line: number): FunctionScope | null {
  for (let index = scopes.length - 1; index >= 0; index--) {
    const scope = scopes[index]!;
    if (scope.startLine <= line && line <= scope.endLine) return scope;
  }
  return null;
}
