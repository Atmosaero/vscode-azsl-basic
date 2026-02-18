import * as path from 'path';
import * as vscode from 'vscode';

import { srgMembers } from '../indexer/state';
import { builtinDocs } from './builtinDocs';

export function provideSrgMemberDocContent(uri: vscode.Uri): string | null {
  if (uri.path.startsWith('/srg/')) {
    const parts = uri.path.split('/');
    if (parts.length >= 4) {
      const srgName = parts[2];
      const memberName = path.basename(parts[3], '.azsli');
      const members = srgMembers.get(srgName);
      if (members && members.has(memberName)) {
        let content = `/*\n * ${srgName}::${memberName}\n *\n`;
        content += ` * Member of ShaderResourceGroup: ${srgName}\n */\n\n`;
        content += `// Example usage:\n`;
        content += `${srgName}::${memberName};\n`;
        return content;
      }
    }
  }
  return null;
}

export function provideBuiltinDocContent(uri: vscode.Uri): string {
  const typeName = path.basename(uri.path, '.azsli');
  const doc = builtinDocs.get(typeName);
  if (doc) {
    let content = `/*\n * Built-in HLSL/AZSL Type: ${typeName}\n *\n`;
    const lines = doc.split('\n');
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (line.trim().startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeBlockContent = [];
        } else {
          inCodeBlock = false;
          if (codeBlockContent.length > 0) {
            content += ' *\n';
            for (const codeLine of codeBlockContent) {
              content += ` * ${codeLine}\n`;
            }
            content += ' *\n';
          }
          codeBlockContent = [];
        }
        continue;
      }
      if (inCodeBlock) {
        codeBlockContent.push(line);
        continue;
      }
      if (line.trim() === '') {
        content += ' *\n';
      } else {
        let cleanLine = line
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/`([^`]+)`/g, '$1')
          .replace(/^#+\s*/, '')
          .trim();
        if (cleanLine.match(/^[-*]\s/)) {
          cleanLine = cleanLine.replace(/^[-*]\s/, '  - ');
        }
        if (cleanLine) {
          content += ` * ${cleanLine}\n`;
        }
      }
    }
    if (inCodeBlock && codeBlockContent.length > 0) {
      content += ' *\n';
      for (const codeLine of codeBlockContent) {
        content += ` * ${codeLine}\n`;
      }
      content += ' *\n';
    }
    content += ' */\n\n';
    content += `// Example usage:\n`;
    if (typeName.startsWith('Texture')) {
      if (typeName === 'RWTexture2D') {
        content += `${typeName}<float4> m_texture;\n`;
      } else {
        content += `${typeName} m_texture;\n`;
      }
    } else if (typeName.startsWith('Sampler')) {
      content += `${typeName} m_sampler;\n`;
    } else if (
      [
        'MaxAnisotropy',
        'MinFilter',
        'MagFilter',
        'MipFilter',
        'ReductionType',
        'AddressU',
        'AddressV',
        'AddressW',
        'MinLOD',
        'MaxLOD'
      ].includes(typeName)
    ) {
      content += `Sampler m_sampler\n{\n    ${typeName} = `;
      if (typeName === 'MaxAnisotropy') {
        content += `4;\n`;
      } else if (typeName === 'MinLOD' || typeName === 'MaxLOD') {
        content += `0.0;\n`;
      } else if (['MinFilter', 'MagFilter', 'MipFilter'].includes(typeName)) {
        content += `Linear;\n`;
      } else if (['AddressU', 'AddressV', 'AddressW'].includes(typeName)) {
        content += `Wrap;\n`;
      } else if (typeName === 'ReductionType') {
        content += `Filter;\n`;
      }
      content += `};\n`;
    } else if (['Point', 'Linear'].includes(typeName)) {
      content += `MinFilter = ${typeName};\nMagFilter = ${typeName};\nMipFilter = ${typeName};\n`;
    } else if (['Wrap', 'Clamp', 'Mirror', 'Border'].includes(typeName)) {
      content += `AddressU = ${typeName};\nAddressV = ${typeName};\n`;
    } else if (typeName === 'Filter') {
      content += `ReductionType = ${typeName};\n`;
    } else {
      content += `${typeName} m_resource;\n`;
    }
    return content;
  }
  return `// Built-in type: ${typeName}\n// No documentation available.`;
}
