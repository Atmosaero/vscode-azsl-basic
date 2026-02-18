import * as vscode from 'vscode';

export function registerIncludeLinkProviders(
  context: vscode.ExtensionContext,
  resolveIncludeTarget: (includePath: string) => vscode.Uri | undefined,
  debugLog?: (msg: string) => void
) {
  const includeRegexAll = /#\s*include\s*[<"]([^>"]+)[>"]/g;

  const linkProvider = vscode.languages.registerDocumentLinkProvider({ language: 'azsl' }, {
    provideDocumentLinks(document) {
      const text = document.getText();
      const links: vscode.DocumentLink[] = [];
      let m: RegExpExecArray | null;
      while ((m = includeRegexAll.exec(text)) !== null) {
        const match = m[0];
        const inner = m[1];
        const start = m.index + match.indexOf(inner);
        const end = start + inner.length;
        const startPos = document.positionAt(start);
        const endPos = document.positionAt(end);
        const target = resolveIncludeTarget(inner);
        if (target) {
          links.push(new vscode.DocumentLink(new vscode.Range(startPos, endPos), target));
        }
      }
      return links;
    }
  });

  const defProvider = vscode.languages.registerDefinitionProvider({ language: 'azsl' }, {
    provideDefinition(document, position) {
      const line = document.lineAt(position.line).text;
      const includeRegexLine = /#\s*include\s*[<"]([^>"]+)[>"]/;
      const matchLine = line.match(includeRegexLine);
      if (!matchLine) {
        return;
      }

      const includePath = matchLine[1];
      const matchIndex = matchLine.index || 0;
      const fullMatch = matchLine[0];

      const openChar = fullMatch.includes('<') ? '<' : '"';
      const closeChar = fullMatch.includes('>') ? '>' : '"';
      const quoteStart = fullMatch.indexOf(openChar);
      const quoteEnd = fullMatch.lastIndexOf(closeChar);

      const pathStart = matchIndex + quoteStart + 1;
      const pathEnd = matchIndex + quoteEnd;

      try {
        debugLog?.(
          `defProvider: line="${line.trim()}", matchIndex=${matchIndex}, pathStart=${pathStart}, pathEnd=${pathEnd}, cursor=${position.character}, includePath="${includePath}"`
        );
      } catch {
      }

      if (position.character < pathStart || position.character > pathEnd) {
        return;
      }

      const target = resolveIncludeTarget(includePath);
      if (!target) {
        try {
          debugLog?.(`defProvider: Could not resolve include: ${includePath}`);
        } catch {
        }
        return;
      }

      try {
        debugLog?.(`defProvider: Resolved include: ${includePath} -> ${target.fsPath}`);
      } catch {
      }

      return new vscode.Location(target, new vscode.Position(0, 0));
    }
  });

  context.subscriptions.push(linkProvider, defProvider);
}
