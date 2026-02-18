import * as path from 'path';
import * as vscode from 'vscode';

import { debugLog } from '../logger';
import { readTextFileCached } from '../fsCache';
import {
  atomMethodIndex,
  atomTypeMembers,
  fileTextCache,
  functionIndex,
  macroIndex,
  srgMembers,
  structIndex
} from '../indexer/state';
import { extractStructDeclarations } from '../indexer/parsers/structs';
import { builtinDocs } from './builtinDocs';
import { semanticDocs } from './semanticDocs';

const wordPattern = /[A-Za-z_][A-Za-z0-9_]*/;

export function provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
  const range = document.getWordRangeAtPosition(position, wordPattern);
  if (!range) return;

  const word = document.getText(range);
  const lineText = document.lineAt(position.line).text;
  const memberStart = range.start.character;
  const beforeMember = lineText.substring(0, memberStart);
  const afterMember = lineText.substring(range.end.character);

  if (!beforeMember.match(/[A-Za-z_][A-Za-z0-9_]*\s*[\.:]\s*$/) && afterMember.trim().startsWith('(')) {
    const funcInfo = functionIndex.get(word);
    if (funcInfo) {
      try {
        const funcFileContent = readTextFileCached(funcInfo.uri.fsPath, fileTextCache);
        if (!funcFileContent) {
          throw new Error('Failed to read file');
        }
        const funcLines = funcFileContent.split(/\r?\n/);
        if (funcInfo.line < funcLines.length) {
          let funcLine = (funcLines[funcInfo.line] ?? '').trim();
          let fullSignature = funcLine;
          if (funcLine.includes('(') && !funcLine.includes(')')) {
            for (let i = funcInfo.line + 1; i < funcLines.length && i < funcInfo.line + 10; i++) {
              funcLine = (funcLines[i] ?? '').trim();
              fullSignature += ' ' + funcLine;
              if (funcLine.includes(')')) {
                break;
              }
            }
          }
          if (fullSignature.endsWith('{')) {
            fullSignature = fullSignature.substring(0, fullSignature.length - 1).trim();
          }
          const md = new vscode.MarkdownString();
          md.isTrusted = false;
          md.appendCodeblock(fullSignature, 'hlsl');
          md.appendMarkdown(`\n\nDefined in: \`${path.basename(funcInfo.uri.fsPath)}\``);
          return new vscode.Hover(md, range);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        debugLog(`Error reading function file: ${msg}`);
      }

      const md = new vscode.MarkdownString();
      md.isTrusted = false;
      md.appendCodeblock(`${word}(...)`, 'hlsl');
      md.appendMarkdown(`\n**Function**\n\nDefined in: \`${path.basename(funcInfo.uri.fsPath)}\``);
      return new vscode.Hover(md, range);
    }
  }

  const memberAccessMatch = beforeMember.match(/([A-Za-z_][A-Za-z0-9_]*)\s*[\.:]\s*$/);
  if (memberAccessMatch) {
    const varName = memberAccessMatch[1];
    const atomTypes = new Set(['Surface', 'LightingData']);
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

    let varType: string | undefined;
    if (atomTypes.has(varName)) {
      varType = varName;
    } else if (textureTypes.has(varName)) {
      varType = varName;
    } else {
      const text = document.getText();
      const lines = text.split(/\r?\n/);
      const variableTypes = new Map<string, string>();

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        const pascalTypeMatch = line.match(/\b([A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;=]/);
        if (pascalTypeMatch) {
          const typeName = pascalTypeMatch[1];
          const vName = pascalTypeMatch[2];
          if (atomTypes.has(typeName) || textureTypes.has(typeName)) {
            variableTypes.set(vName, typeName);
          }
        }
        const textureTypeMatch = line.match(/\b(Texture\w*|RWTexture\w*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;=]/);
        if (textureTypeMatch) {
          const typeName = textureTypeMatch[1];
          const vName = textureTypeMatch[2];
          if (textureTypes.has(typeName)) {
            variableTypes.set(vName, typeName);
          }
        }
      }

      varType = variableTypes.get(varName);
    }

    if (varType && atomTypes.has(varType) && atomTypeMembers.has(varType)) {
      const members = atomTypeMembers.get(varType);
      if (members && members.has(word)) {
        const key1 = `${varType}.${word}`;
        const key2 = `${varType}::${word}`;
        const methodInfo = atomMethodIndex.get(key1) || atomMethodIndex.get(key2);
        if (methodInfo) {
          try {
            const methodFileContent = readTextFileCached(methodInfo.uri.fsPath, fileTextCache);
            if (!methodFileContent) {
              throw new Error('Failed to read file');
            }
            const methodLines = methodFileContent.split(/\r?\n/);
            if (methodInfo.line < methodLines.length) {
              let methodLine = (methodLines[methodInfo.line] ?? '').trim();
              if (methodLine.endsWith('{')) {
                methodLine = methodLine.substring(0, methodLine.length - 1).trim();
              }
              const md = new vscode.MarkdownString();
              md.isTrusted = false;
              md.appendCodeblock(methodLine, 'hlsl');
              md.appendMarkdown(`\n**Member of** \`${varType}\`\n\nDefined in: \`${path.basename(methodInfo.uri.fsPath)}\``);
              return new vscode.Hover(md, range);
            }
          } catch {
          }
          const md = new vscode.MarkdownString();
          md.isTrusted = false;
          md.appendCodeblock(`${varType}.${word}(...)`, 'hlsl');
          md.appendMarkdown(`\n**Method of** \`${varType}\``);
          return new vscode.Hover(md, range);
        }

        const md = new vscode.MarkdownString();
        md.isTrusted = false;
        md.appendCodeblock(`${varType}.${word}`, 'hlsl');
        md.appendMarkdown(`\n**Property of** \`${varType}\``);
        return new vscode.Hover(md, range);
      }
    } else if (varType && textureTypes.has(varType)) {
      const textureMethodDocs = builtinDocs.get(word);
      if (textureMethodDocs) {
        const md = new vscode.MarkdownString();
        md.isTrusted = false;
        md.appendMarkdown(textureMethodDocs);
        md.appendMarkdown(`\n\n**Method of** \`${varType}\``);
        return new vscode.Hover(md, range);
      }
    }
  }

  const srgMemberMatch = lineText
    .substring(Math.max(0, range.start.character - 50), range.end.character)
    .match(/([A-Za-z_][A-Za-z0-9_]*)\s*::\s*([A-Za-z_][A-Za-z0-9_]*)/);
  if (srgMemberMatch && srgMemberMatch[2] === word) {
    const srgName = srgMemberMatch[1];
    const members = srgMembers.get(srgName);
    if (members && members.has(word)) {
      const md = new vscode.MarkdownString();
      md.isTrusted = false;
      md.appendCodeblock(`${srgName}::${word}`, 'hlsl');
      md.appendMarkdown(`\n**Member of** \`${srgName}\`\n\nShaderResourceGroup member from O3DE Atom engine.`);
      return new vscode.Hover(md, range);
    }
  }

  let structInfo: { uri: vscode.Uri; line: number } | undefined;
  const text = document.getText();
  const currentDocStructs = extractStructDeclarations(text, document.uri.fsPath);
  if (currentDocStructs.structs.has(word)) {
    const localStructInfo = currentDocStructs.structs.get(word)!;
    structInfo = { uri: document.uri, line: localStructInfo.line };
  } else if (structIndex.has(word)) {
    const info = structIndex.get(word)!;
    structInfo = { uri: info.uri, line: info.line };
  }

  if (structInfo) {
    try {
      const structFileContent = readTextFileCached(structInfo.uri.fsPath, fileTextCache);
      if (!structFileContent) {
        throw new Error('Failed to read file');
      }
      const structLines = structFileContent.split(/\r?\n/);
      if (structInfo.line < structLines.length) {
        const structLine = (structLines[structInfo.line] ?? '').trim();
        let fullDefinition = structLine;

        if (structLine.match(/\b(?:struct|class|typedef)\s+/)) {
          let braceCount = 0;
          let foundBrace = false;
          for (let i = structInfo.line; i < structLines.length && i < structInfo.line + 50; i++) {
            const line = structLines[i] ?? '';
            for (const char of line) {
              if (char === '{') {
                braceCount++;
                foundBrace = true;
              } else if (char === '}') {
                braceCount--;
                if (foundBrace && braceCount === 0) {
                  const definitionLines = structLines.slice(structInfo.line, i + 1);
                  fullDefinition = definitionLines.join('\n').trim();
                  break;
                }
              }
            }
            if (foundBrace && braceCount === 0) break;
          }
          if (!foundBrace || braceCount !== 0) {
            fullDefinition = structLine;
          }
        }

        const md = new vscode.MarkdownString();
        md.isTrusted = false;
        md.appendCodeblock(fullDefinition, 'hlsl');
        md.appendMarkdown(`\n\n**Type**\n\nDefined in: \`${path.basename(structInfo.uri.fsPath)}\``);
        return new vscode.Hover(md, range);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      debugLog(`Error reading struct file: ${msg}`);
    }

    const md = new vscode.MarkdownString();
    md.isTrusted = false;
    md.appendCodeblock(`struct ${word}`, 'hlsl');
    md.appendMarkdown(`\n\n**Type**\n\nDefined in: \`${path.basename(structInfo.uri.fsPath)}\``);
    return new vscode.Hover(md, range);
  }

  const macroInfo = macroIndex.get(word);
  if (macroInfo) {
    const md = new vscode.MarkdownString();
    md.isTrusted = false;
    md.appendCodeblock(`#define ${word} ${macroInfo.value}`, 'c');
    if (macroInfo.doc) {
      md.appendMarkdown('\n');
      md.appendMarkdown(macroInfo.doc);
    }
    return new vscode.Hover(md, range);
  }

  const builtin = builtinDocs.get(word);
  if (builtin) {
    const md = new vscode.MarkdownString();
    md.isTrusted = false;
    md.appendMarkdown(builtin);
    return new vscode.Hover(md, range);
  }

  const semantic = semanticDocs.get(word);
  if (semantic) {
    const md = new vscode.MarkdownString();
    md.isTrusted = false;
    md.appendMarkdown(semantic);
    return new vscode.Hover(md, range);
  }

  if (word.startsWith('SRG_')) {
    const srgSemantic = semanticDocs.get(word);
    if (srgSemantic) {
      const md = new vscode.MarkdownString();
      md.isTrusted = false;
      md.appendMarkdown(srgSemantic);
      return new vscode.Hover(md, range);
    }
  }

  return;
}
