import * as vscode from 'vscode';

import type { SrgMemberInfo, SrgSemanticInfo } from '../state';

export type ParsedSrgSemantic = {
  name: string;
  line: number;
  uri: vscode.Uri;
};

export type ParsedSrg = {
  name: string;
  uri: vscode.Uri;
  line: number;
  members: Set<string>;
};

export type ParsedSrgDeclarations = {
  srgInfo: Map<string, ParsedSrg>;
  memberLocations: Map<string, SrgMemberInfo>;
};

export function extractSrgSemantics(text: string, filePath: string): ParsedSrgSemantic[] {
  const results: ParsedSrgSemantic[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';
    const match = line.match(/^\s*ShaderResourceGroupSemantic\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/);
    if (match) {
      const semanticName = match[1];
      results.push({ name: semanticName, line: i, uri: vscode.Uri.file(filePath) });
    }
  }
  return results;
}

export function extractSrgDeclarations(text: string, filePath: string): ParsedSrgDeclarations {
  const results = new Map<string, ParsedSrg>();
  const memberLocations = new Map<string, SrgMemberInfo>();
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';
    const match = line.match(/^\s*(?:partial\s+)?ShaderResourceGroup\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*[A-Za-z_][A-Za-z0-9_]*)?/);
    if (!match) continue;

    const srgName = match[1];
    let startLine = i;
    let braceDepth = 0;

    if (line.includes('{')) {
      braceDepth = 1;
    } else if (i + 1 < lines.length && (lines[i + 1] || '').trim().startsWith('{')) {
      startLine = i + 1;
      braceDepth = 1;
    } else {
      continue;
    }

    if (!results.has(srgName)) {
      results.set(srgName, {
        name: srgName,
        uri: vscode.Uri.file(filePath),
        line: i,
        members: new Set<string>()
      });
    }

    let inString = false;
    let inComment = false;
    let commentType: 'block' | null = null;

    for (let j = 0; j < line.length; j++) {
      if (line[j] === '"' && (j === 0 || line[j - 1] !== '\\')) {
        inString = !inString;
      }

      if (!inString) {
        if (line[j] === '/' && j + 1 < line.length && line[j + 1] === '/') {
          break;
        }
        if (line[j] === '/' && j + 1 < line.length && line[j + 1] === '*') {
          inComment = true;
          commentType = 'block';
          j++;
          continue;
        }
        if (inComment && commentType === 'block' && line[j] === '*' && j + 1 < line.length && line[j + 1] === '/') {
          inComment = false;
          commentType = null;
          j++;
          continue;
        }
        if (!inComment) {
          if (line[j] === '{') braceDepth++;
          else if (line[j] === '}') braceDepth--;
        }
      }
    }

    for (let j = startLine + 1; j < lines.length && braceDepth > 0; j++) {
      const srgLine = lines[j] || '';
      let lineBraceDepth = 0;

      inString = false;
      inComment = false;
      commentType = null;

      for (let k = 0; k < srgLine.length; k++) {
        if (srgLine[k] === '"' && (k === 0 || srgLine[k - 1] !== '\\')) {
          inString = !inString;
        }

        if (!inString) {
          if (srgLine[k] === '/' && k + 1 < srgLine.length && srgLine[k + 1] === '/') {
            break;
          }
          if (srgLine[k] === '/' && k + 1 < srgLine.length && srgLine[k + 1] === '*') {
            inComment = true;
            commentType = 'block';
            k++;
            continue;
          }
          if (inComment && commentType === 'block' && srgLine[k] === '*' && k + 1 < srgLine.length && srgLine[k + 1] === '/') {
            inComment = false;
            commentType = null;
            k++;
            continue;
          }
          if (!inComment) {
            if (srgLine[k] === '{') lineBraceDepth++;
            else if (srgLine[k] === '}') lineBraceDepth--;
          }
        }
      }

      braceDepth += lineBraceDepth;

      if (braceDepth > 0 && !inComment) {
        const trimmed = srgLine.trim();
        if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
          let angleDepth = 0;
          let lastSpaceAfterTemplate = -1;
          let foundMember = false;

          for (let ii = 0; ii < trimmed.length; ii++) {
            if (trimmed[ii] === '<') {
              angleDepth++;
            } else if (trimmed[ii] === '>') {
              angleDepth--;
              if (angleDepth === 0) {
                lastSpaceAfterTemplate = -1;
              }
            } else if (angleDepth === 0) {
              if (trimmed[ii] === ' ' || trimmed[ii] === '\t') {
                lastSpaceAfterTemplate = ii;
              } else if (trimmed[ii] === ';' || trimmed[ii] === '=' || trimmed[ii] === '(' || trimmed[ii] === '[' || trimmed[ii] === '{') {
                if (lastSpaceAfterTemplate >= 0) {
                  const memberName = trimmed.substring(lastSpaceAfterTemplate + 1, ii).trim();
                  if (memberName && /^[A-Za-z_][A-Za-z0-9_]*$/.test(memberName)) {
                    if (memberName !== 'ShaderResourceGroup' && memberName !== 'partial' && memberName !== 'static' && memberName !== 'const') {
                      results.get(srgName)!.members.add(memberName);
                      const memberKey = `${srgName}::${memberName}`;
                      if (!memberLocations.has(memberKey)) {
                        memberLocations.set(memberKey, {
                          uri: vscode.Uri.file(filePath),
                          line: j,
                          column: 0,
                          srgName,
                          memberName
                        });
                      }
                      foundMember = true;
                    }
                  }
                }
                break;
              }
            }
          }

          if (!foundMember && lastSpaceAfterTemplate >= 0 && j + 1 < lines.length) {
            const nextLine = lines[j + 1] || '';
            const nextTrimmed = nextLine.trim();
            if (nextTrimmed.startsWith('{')) {
              const memberName = trimmed.substring(lastSpaceAfterTemplate + 1).trim();
              if (memberName && /^[A-Za-z_][A-Za-z0-9_]*$/.test(memberName)) {
                if (memberName !== 'ShaderResourceGroup' && memberName !== 'partial' && memberName !== 'static' && memberName !== 'const') {
                  results.get(srgName)!.members.add(memberName);
                  const memberKey = `${srgName}::${memberName}`;
                  if (!memberLocations.has(memberKey)) {
                    memberLocations.set(memberKey, {
                      uri: vscode.Uri.file(filePath),
                      line: j,
                      column: 0,
                      srgName,
                      memberName
                    });
                  }
                }
              }
            }
          }

          const funcMatch = trimmed.match(/^\s*(?:[A-Za-z_][A-Za-z0-9_<>,\s]*\s+)*([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
          if (funcMatch) {
            const funcName = funcMatch[1];
            if (funcName !== 'ShaderResourceGroup' && funcName !== 'partial' && funcName !== 'static' && funcName !== 'const') {
              results.get(srgName)!.members.add(funcName);
              const memberKey = `${srgName}::${funcName}`;
              if (!memberLocations.has(memberKey)) {
                memberLocations.set(memberKey, {
                  uri: vscode.Uri.file(filePath),
                  line: j,
                  column: 0,
                  srgName,
                  memberName: funcName
                });
              }
            }
          }
        }
      }
    }
  }

  return { srgInfo: results, memberLocations };
}
