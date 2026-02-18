import * as vscode from 'vscode';

export type MacroInfo = {
  value: string;
  doc: string;
  uri: vscode.Uri;
  line: number;
};

export type AtomMethodInfo = {
  uri: vscode.Uri;
  line: number;
  column: number;
};

export type SrgSemanticInfo = {
  uri: vscode.Uri;
  line: number;
};

export type SrgInfo = {
  uri: vscode.Uri;
  line: number;
};

export type SrgMemberInfo = {
  uri: vscode.Uri;
  line: number;
  column: number;
  srgName: string;
  memberName: string;
  type?: string;
};

export type StructInfo = {
  uri: vscode.Uri;
  line: number;
};

export type FunctionInfo = {
  uri: vscode.Uri;
  line: number;
  column: number;
};

export type OptionInfo = {
  uri: vscode.Uri;
  line: number;
  isStatic: boolean;
};

export type FileTextCacheEntry = {
  mtimeMs: number;
  text: string;
};

export const indexedSymbols = new Set<string>();
export const headersPathIndex = new Map<string, string>();
export const headersBasenameIndex = new Map<string, string[]>();

export const macroIndex = new Map<string, MacroInfo>();
export const atomMethodIndex = new Map<string, AtomMethodInfo>();
export const atomTypeMembers = new Map<string, Set<string>>();

export const srgSemanticIndex = new Map<string, SrgSemanticInfo>();
export const srgMembers = new Map<string, Set<string>>();
export const srgMemberIndex = new Map<string, SrgMemberInfo>();
export const srgIndex = new Map<string, SrgInfo>();

export const structIndex = new Map<string, StructInfo>();
export const structMembers = new Map<string, Set<string>>();

export const functionIndex = new Map<string, FunctionInfo>();
export const optionIndex = new Map<string, OptionInfo>();

export const fileTextCache = new Map<string, FileTextCacheEntry>();
