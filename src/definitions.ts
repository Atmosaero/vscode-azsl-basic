import * as vscode from 'vscode';

type ProvideDefinitionFn = (document: vscode.TextDocument, position: vscode.Position) => vscode.ProviderResult<vscode.Definition>;

export function registerDefinitionProviders(context: vscode.ExtensionContext, fns: {
  macro: ProvideDefinitionFn;
  builtinType: ProvideDefinitionFn;
  srgSemantic: ProvideDefinitionFn;
  srgMember: ProvideDefinitionFn;
  struct: ProvideDefinitionFn;
  functionDef: ProvideDefinitionFn;
  atomMethod: ProvideDefinitionFn;
}) {
  const macroDef = vscode.languages.registerDefinitionProvider({ language: 'azsl' }, { provideDefinition: fns.macro });
  const builtinTypeDef = vscode.languages.registerDefinitionProvider({ language: 'azsl' }, { provideDefinition: fns.builtinType });
  const srgSemanticDef = vscode.languages.registerDefinitionProvider({ language: 'azsl' }, { provideDefinition: fns.srgSemantic });
  const srgMemberDef = vscode.languages.registerDefinitionProvider({ language: 'azsl' }, { provideDefinition: fns.srgMember });
  const structDef = vscode.languages.registerDefinitionProvider({ language: 'azsl' }, { provideDefinition: fns.struct });
  const functionDef = vscode.languages.registerDefinitionProvider({ language: 'azsl' }, { provideDefinition: fns.functionDef });
  const atomMethodDef = vscode.languages.registerDefinitionProvider({ language: 'azsl' }, { provideDefinition: fns.atomMethod });

  context.subscriptions.push(macroDef, builtinTypeDef, srgSemanticDef, srgMemberDef, structDef, functionDef, atomMethodDef);
}
