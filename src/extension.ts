import * as vscode from 'vscode';

import { registerIncludeLinkProviders } from './includesProvider';
import { registerDiagnostics } from './diagnostics';
import { registerCodeActions } from './codeActions';
import { registerMacroIndexing } from './macros';
import { registerCompletionProvider } from './completionProvider';
import { registerHoverProvider } from './hoverProvider';
import { registerDefinitionProviders } from './definitions';
import { registerReferenceProvider } from './references';
import { registerSignatureHelpProvider } from './signatureHelp';
import { registerSymbolProviders } from './symbols';
import { registerFormattingProvider } from './formatting';
import { registerContentProviders } from './contentProviders';
import { registerSemanticTokens } from './semanticTokens';
import { registerConfigWatcher } from './configWatcher';
import { handleConfigChanged } from './configChange';
import { cmdReindex } from './commands/reindex';
import { cmdSetGemPath } from './commands/setGemPath';
import { requestHeaderIndex } from './indexer/requestHeaderIndex';
import { getGemPath } from './config';
import {
  provideAtomMethodDefinition,
  provideBuiltinTypeDefinition,
  provideFunctionDefinition,
  provideMacroDefinition,
  provideSrgMemberDefinition,
  provideSrgSemanticDefinition,
  provideStructDefinition
} from './providers/definitionsRuntime';
import { provideBuiltinDocContent, provideSrgMemberDocContent } from './providers/contentRuntime';
import { provideHover } from './providers/hoverRuntime';
import { provideCompletionItems } from './providers/completionRuntime';
import { legend as azslLegend, provideDocumentSemanticTokens } from './providers/semanticTokensRuntime';
import { resolveIncludeTarget } from './providers/includesRuntime';
import { indexDocumentMacros } from './providers/macrosRuntime';
import { provideReferences } from './providers/referencesRuntime';
import { provideSignatureHelp } from './providers/signatureHelpRuntime';
import { provideDocumentSymbols, provideWorkspaceSymbols } from './providers/symbolsRuntime';
import { provideDocumentFormattingEdits } from './providers/formattingRuntime';
import { provideCodeActions } from './providers/codeActionsRuntime';
import { reindexForGemPathChange } from './providers/configHooksRuntime';
import { setTraceCodeActions } from './providers/codeActionsRuntime';
import { debugLog } from './logger';
import { validateDocument } from './providers/diagnosticsRuntime';

export function activate(context: vscode.ExtensionContext) {
  const reindex = vscode.commands.registerCommand('azsl.reindex', async () => {
    return await cmdReindex(doc => indexDocumentMacros(doc));
  });
  const setGemPath = vscode.commands.registerCommand('azsl.setGemPath', async () => {
    return await cmdSetGemPath();
  });
  context.subscriptions.push(reindex, setGemPath);

  try {
    void requestHeaderIndex(getGemPath(), (msg: string) => debugLog(msg));
  } catch {
  }

  registerIncludeLinkProviders(context, (includePath: string) => resolveIncludeTarget(includePath), (msg: string) => debugLog(msg));

  registerDiagnostics(context, (doc, collection) => validateDocument(doc, collection));

  registerCodeActions(context, (document, range, ctx, token) => provideCodeActions(document, range, ctx, token) ?? []);

  registerMacroIndexing(context, doc => indexDocumentMacros(doc));

  registerConfigWatcher(context, e =>
    handleConfigChanged(e, {
      setTraceCodeActions,
      reindexForGemPathChange
    })
  );

  registerCompletionProvider(context, (document, position, token, ctx) => provideCompletionItems(document, position, token, ctx) ?? []);

  registerSignatureHelpProvider(context, (document, position, token, ctx) => provideSignatureHelp(document, position, token, ctx));

  registerHoverProvider(context, (document, position) => provideHover(document, position));

  registerReferenceProvider(context, (document, position, options, token) => provideReferences(document, position, options, token) ?? []);

  registerSymbolProviders(context, {
    documentSymbols: (document, token) => provideDocumentSymbols(document, token),
    workspaceSymbols: (query, token) => provideWorkspaceSymbols(query, token)
  });

  registerFormattingProvider(context, (document, options, token) => provideDocumentFormattingEdits(document, options, token));

  registerDefinitionProviders(context, {
    macro: (document, position) => provideMacroDefinition(document, position),
    builtinType: (document, position) => provideBuiltinTypeDefinition(document, position),
    srgSemantic: (document, position) => provideSrgSemanticDefinition(document, position),
    srgMember: (document, position) => provideSrgMemberDefinition(document, position),
    struct: (document, position) => provideStructDefinition(document, position),
    functionDef: (document, position) => provideFunctionDefinition(document, position),
    atomMethod: (document, position) => provideAtomMethodDefinition(document, position)
  });

  registerContentProviders(
    context,
    (uri: vscode.Uri) => provideBuiltinDocContent(uri),
    (uri: vscode.Uri) => provideSrgMemberDocContent(uri)
  );

  registerSemanticTokens(context, azslLegend, doc => provideDocumentSemanticTokens(doc));
}

export function deactivate() {
  return;
}
