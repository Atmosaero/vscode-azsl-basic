import * as vscode from 'vscode';

export type ParsedStruct = {
  name: string;
  uri: vscode.Uri;
  line: number;
};

export type ParsedStructDeclarations = {
  structs: Map<string, ParsedStruct>;
  members: Map<string, Set<string>>;
};

export function extractStructDeclarations(text: string, filePath: string): ParsedStructDeclarations {
  const results = new Map<string, ParsedStruct>();
  const structMembersMap = new Map<string, Set<string>>();
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';

    let match = line.match(/^\s*(?:struct|class)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*[A-Za-z_][A-Za-z0-9_]*)?/);
    if (!match) {
      match = line.match(/^\s*typedef\s+(?:struct|class)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*[A-Za-z_][A-Za-z0-9_]*)?/);
      if (!match) {
        match = line.match(/^\s*typedef\s+[A-Za-z_][A-Za-z0-9_<>,\s]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/);
      }
    }

    if (!match) continue;

    const structName = match[1];
    let startLine = i;
    let braceDepth = 0;
    let typedefAliasAfterBrace: string | null = null;

    if (line.includes('typedef')) {
      const aliasMatch = line.match(/}\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/);
      if (aliasMatch) typedefAliasAfterBrace = aliasMatch[1];
    }

    let isSingleLineStruct = false;

    if (line.includes('{')) {
      braceDepth = 1;
      if (line.includes('}') && line.includes(';')) {
        isSingleLineStruct = true;
        braceDepth = 0;
      }
    } else if (i + 1 < lines.length && (lines[i + 1] || '').trim().startsWith('{')) {
      startLine = i + 1;
      braceDepth = 1;
    } else if (typedefAliasAfterBrace) {
      continue;
    } else {
      if (line.includes('typedef') && !line.includes('struct') && !line.includes('class')) {
        if (!results.has(structName)) {
          results.set(structName, {
            name: structName,
            uri: vscode.Uri.file(filePath),
            line: i
          });
        }
      }
      continue;
    }

    if (!results.has(structName)) {
      results.set(structName, {
        name: structName,
        uri: vscode.Uri.file(filePath),
        line: i
      });
      structMembersMap.set(structName, new Set<string>());
    }

    const currentMembers = structMembersMap.get(structName)!;

    if (isSingleLineStruct) {
      braceDepth = 1;
      const trimmed = line.trim();
      const braceStart = trimmed.indexOf('{');
      const braceEnd = trimmed.indexOf('}');
      if (braceStart >= 0 && braceEnd > braceStart) {
        const structContent = trimmed.substring(braceStart + 1, braceEnd).trim();
        const memberDecls = structContent.split(';').filter(s => s.trim().length > 0);
        for (const memberDecl of memberDecls) {
          const memberTrimmed = memberDecl.trim();
          let memberMatch = memberTrimmed.match(/^\s*(?:precise\s+|noperspective\s+)*(?:precise\s+|noperspective\s+)?(?:(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler(?:State|ComparisonState|\w*)?|[A-Z][A-Za-z0-9_<>,\s]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;:]?/);
          if (!memberMatch) {
            memberMatch = memberTrimmed.match(/^\s*(?:precise\s+|noperspective\s+)*(?:precise\s+|noperspective\s+)?([A-Za-z_][A-Za-z0-9_<>,\s]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;:]?/);
          }
          if (
            memberMatch &&
            !memberTrimmed.includes('(') &&
            !memberTrimmed.includes(')') &&
            !memberTrimmed.includes('enum') &&
            !memberTrimmed.includes('struct') &&
            !memberTrimmed.includes('class')
          ) {
            const memberName = memberMatch[memberMatch.length - 1];
            currentMembers.add(memberName);
          }
        }
      }
      braceDepth = 0;
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

    if (!isSingleLineStruct) {
      for (let j = startLine + 1; j < lines.length && braceDepth > 0; j++) {
        const structLine = lines[j] || '';
        let lineBraceDepth = 0;

        inString = false;
        inComment = false;
        commentType = null;

        if (braceDepth === 1 && structLine.includes('}')) {
          const aliasMatch = structLine.match(/}\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/);
          if (aliasMatch) {
            const aliasName = aliasMatch[1];
            if (!results.has(aliasName)) {
              results.set(aliasName, {
                name: aliasName,
                uri: vscode.Uri.file(filePath),
                line: i
              });
            }
          }
        }

        for (let k = 0; k < structLine.length; k++) {
          if (structLine[k] === '"' && (k === 0 || structLine[k - 1] !== '\\')) {
            inString = !inString;
          }

          if (!inString) {
            if (structLine[k] === '/' && k + 1 < structLine.length && structLine[k + 1] === '/') {
              break;
            }
            if (structLine[k] === '/' && k + 1 < structLine.length && structLine[k + 1] === '*') {
              inComment = true;
              commentType = 'block';
              k++;
              continue;
            }
            if (inComment && commentType === 'block' && structLine[k] === '*' && k + 1 < structLine.length && structLine[k + 1] === '/') {
              inComment = false;
              commentType = null;
              k++;
              continue;
            }
            if (!inComment) {
              if (structLine[k] === '{') lineBraceDepth++;
              else if (structLine[k] === '}') lineBraceDepth--;
            }
          }
        }

        braceDepth += lineBraceDepth;

        if (braceDepth > 0) {
          const trimmed = structLine.trim();
          if (!(trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.length === 0)) {
            let memberMatch = trimmed.match(/^\s*(?:noperspective\s+)?(?:(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler(?:State|ComparisonState|\w*)?|[A-Z][A-Za-z0-9_<>,\s]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;:]/);
            if (!memberMatch) {
              memberMatch = trimmed.match(/^\s*(?:noperspective\s+)?([A-Za-z_][A-Za-z0-9_<>,\s]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;:]/);
            }

            if (memberMatch && !trimmed.includes('{') && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
              const memberName = memberMatch[memberMatch.length - 1];
              if (!trimmed.includes('(') && !trimmed.includes(')') && !trimmed.includes('enum') && !trimmed.includes('struct') && !trimmed.includes('class')) {
                currentMembers.add(memberName);
              }
            }
          }
        }

        if (braceDepth === 0 && line.includes('typedef')) {
          const aliasMatch = structLine.match(/}\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/);
          if (aliasMatch) {
            const aliasName = aliasMatch[1];
            if (!results.has(aliasName)) {
              results.set(aliasName, {
                name: aliasName,
                uri: vscode.Uri.file(filePath),
                line: i
              });
              structMembersMap.set(aliasName, new Set<string>(currentMembers));
            }
          }
        }
      }
    }
  }

  return { structs: results, members: structMembersMap };
}
