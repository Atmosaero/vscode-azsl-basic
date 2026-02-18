import * as vscode from 'vscode';

import { macroIndex } from '../indexer/state';
import { debugLog } from '../logger';

let traceCodeActions = false;

export function setTraceCodeActions(enabled: boolean): void {
  try {
    traceCodeActions = !!enabled;
  } catch {
  }
}

export function provideCodeActions(
  document: vscode.TextDocument,
  range: vscode.Range,
  context: vscode.CodeActionContext,
  token: vscode.CancellationToken
): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
  const actions: vscode.CodeAction[] = [];

  if (traceCodeActions) {
    debugLog(
      `[provideCodeActions] Called with ${context.diagnostics.length} diagnostics, range: ${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`
    );
  }

  for (const diagnostic of context.diagnostics) {
    if (traceCodeActions) {
      debugLog(
        `[provideCodeActions] Checking diagnostic: "${diagnostic.message}" at ${diagnostic.range.start.line}:${diagnostic.range.start.character}`
      );
    }

    const rangeIntersects = range.intersection(diagnostic.range) !== undefined;
    if (traceCodeActions) {
      debugLog(`[provideCodeActions] Range intersects: ${rangeIntersects}`);
    }

    const isShaderVariantFallbackError =
      diagnostic.message.includes('ShaderVariantFallback') ||
      (diagnostic.message.includes('non-static options') && diagnostic.message.includes('SRG must be designated'));

    if (traceCodeActions) {
      debugLog(`[provideCodeActions] Diagnostic message: "${diagnostic.message}"`);
      debugLog(`[provideCodeActions] isShaderVariantFallbackError=${isShaderVariantFallbackError}`);
    }

    if (isShaderVariantFallbackError) {
      if (traceCodeActions) {
        debugLog(`[provideCodeActions] Matched ShaderVariantFallback error`);
      }

      if (!rangeIntersects && diagnostic.range.start.line !== 0) {
        if (traceCodeActions) {
          debugLog(`[provideCodeActions] Skipping: range doesn't intersect and not line 0`);
        }
        continue;
      }

      const text = document.getText();
      const lines = text.split(/\r?\n/);
      let hasVariantFallback = false;

      for (let i = 0; i < lines.length; i++) {
        const line = (lines[i] ?? '').trim();
        if (line.startsWith('//') || line.startsWith('/*')) {
          continue;
        }
        if (line.match(/ShaderResourceGroup\s+\w+\s*:\s*SRG_PerDraw/)) {
          hasVariantFallback = true;
          if (traceCodeActions) {
            debugLog(`[provideCodeActions] Found existing SRG with SRG_PerDraw at line ${i + 1}`);
          }
          break;
        }
      }

      if (hasVariantFallback) {
        if (traceCodeActions) {
          debugLog(`[provideCodeActions] Skipping: SRG with SRG_PerDraw already exists`);
        }
        continue;
      }

      if (traceCodeActions) {
        debugLog(`[provideCodeActions] No existing SRG with SRG_PerDraw found, creating Quick Fix`);
      }

      const action = new vscode.CodeAction('Add ShaderVariantFallback SRG', vscode.CodeActionKind.QuickFix);
      action.diagnostics = [diagnostic];
      action.isPreferred = true;
      action.edit = new vscode.WorkspaceEdit();

      const linesForInsert = text.split(/\r?\n/);
      let insertLine = 0;

      for (let i = 0; i < linesForInsert.length; i++) {
        const line = (linesForInsert[i] ?? '').trim();
        if (line.startsWith('//') || line.startsWith('/*')) {
          continue;
        }
        if (line.startsWith('#include')) {
          insertLine = i + 1;
        } else if (line.startsWith('ShaderResourceGroup') || line.startsWith('struct') || line.startsWith('option')) {
          break;
        }
      }

      if (traceCodeActions) {
        debugLog(`[provideCodeActions] Inserting SRG at line ${insertLine}`);
      }

      const srgCode = `\nShaderResourceGroup VariantFallbackSrg : SRG_PerDraw\n{\n}\n`;
      const insertPos = new vscode.Position(insertLine, 0);
      action.edit.insert(document.uri, insertPos, srgCode);
      actions.push(action);

      if (traceCodeActions) {
        debugLog(
          `[provideCodeActions] Created Quick Fix action: Add ShaderVariantFallback SRG at line ${insertLine}, actions.length=${actions.length}`
        );
      }
    }

    if (diagnostic.message.includes('Declaration for semantic') && diagnostic.message.includes('was not found')) {
      const semanticMatch = diagnostic.message.match(/semantic\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (semanticMatch) {
        const wrongSemantic = semanticMatch[1]!;
        const line = document.lineAt(diagnostic.range.start.line);
        const lineText = line.text;
        const commonSemantics = ['SRG_PerDraw', 'SRG_PerMaterial', 'SRG_PerPass', 'SRG_PerPass_WithFallback', 'SRG_PerScene', 'SRG_PerView'];

        for (const correctSemantic of commonSemantics) {
          if (correctSemantic.startsWith(wrongSemantic) && wrongSemantic.length < correctSemantic.length) {
            const action = new vscode.CodeAction(`Change to ${correctSemantic}`, vscode.CodeActionKind.QuickFix);
            action.diagnostics = [diagnostic];
            action.isPreferred = true;
            action.edit = new vscode.WorkspaceEdit();

            const semanticRegex = new RegExp(`:\\s*${wrongSemantic.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`);
            const match = lineText.match(semanticRegex);
            if (match) {
              const startPos = lineText.indexOf(match[0]) + match[0].indexOf(wrongSemantic);
              const endPos = startPos + wrongSemantic.length;
              const replaceRange = new vscode.Range(diagnostic.range.start.line, startPos, diagnostic.range.start.line, endPos);
              action.edit.replace(document.uri, replaceRange, correctSemantic);
              actions.push(action);
            }
            break;
          }
        }
      }
    }
  }

  if (traceCodeActions) {
    debugLog(`[provideCodeActions] Returning ${actions.length} actions`);
  }

  return actions;
}
