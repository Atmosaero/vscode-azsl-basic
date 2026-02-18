import * as vscode from 'vscode';

import * as config from './config';
import * as logger from './logger';

export type LegacyConfigHooks = {
  setTraceCodeActions?: (enabled: boolean) => void;
  reindexForGemPathChange?: () => Promise<void>;
};

export async function handleConfigChanged(e: vscode.ConfigurationChangeEvent, legacy: LegacyConfigHooks) {
  if (e.affectsConfiguration(config.configKeys.debugLogToConsole)) {
    const v = config.getDebugLogToConsole(false);
    logger.setLogToConsole(!!v);
  }

  if (e.affectsConfiguration(config.configKeys.debugTraceCodeActions)) {
    const v = config.getDebugTraceCodeActions(false);
    legacy.setTraceCodeActions?.(!!v);
  }

  if (e.affectsConfiguration(config.configKeys.gemPath)) {
    await legacy.reindexForGemPathChange?.();
  }
}
