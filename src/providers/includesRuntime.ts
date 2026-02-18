import * as vscode from 'vscode';

import * as includes from '../includes';
import { getGemPath } from '../config';
import { headersBasenameIndex, headersPathIndex } from '../indexer/state';
import { debugLog } from '../logger';

export function resolveIncludeTarget(includePath: string): vscode.Uri | undefined {
  try {
    return includes.resolveIncludeTarget(includePath, getGemPath(), headersPathIndex, headersBasenameIndex, debugLog);
  } catch {
    return undefined;
  }
}
