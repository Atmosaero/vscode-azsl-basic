import * as vscode from 'vscode';

import { requestHeaderIndex as requestHeaderIndexCore } from './orchestrator';
import { indexHeaders } from './indexHeaders';
import { indexShaderQualityMacros } from './indexShaderQualityMacros';
import { debugLog as defaultDebugLog } from '../logger';

let headerIndexToken = 0;
let headerIndexInFlight: Promise<void> | null = null;
let pendingHeaderIndexRoot: string | null = null;
let headerIndexProgressInFlight: Thenable<void> | null = null;
let headerIndexProgressReport: ((msg: string) => void) | null = null;
let headerIndexLastProgressAt = 0;

export async function requestHeaderIndex(rootPath: string, debugLog: (msg: string) => void = defaultDebugLog): Promise<Thenable<void> | Promise<void> | null> {
  return await requestHeaderIndexCore(rootPath, {
    vscode,
    getHeaderIndexToken: () => headerIndexToken,
    incHeaderIndexToken: () => ++headerIndexToken,

    getPendingHeaderIndexRoot: () => pendingHeaderIndexRoot,
    setPendingHeaderIndexRoot: (value: string | null) => {
      pendingHeaderIndexRoot = value;
    },

    getHeaderIndexInFlight: () => headerIndexInFlight,
    setHeaderIndexInFlight: (value: Promise<void> | null) => {
      headerIndexInFlight = value;
    },

    getHeaderIndexProgressInFlight: () => headerIndexProgressInFlight,
    setHeaderIndexProgressInFlight: (value: Thenable<void> | null) => {
      headerIndexProgressInFlight = value;
    },

    setHeaderIndexProgressReport: value => {
      headerIndexProgressReport = value;
    },

    setHeaderIndexLastProgressAt: value => {
      headerIndexLastProgressAt = value;
    },

    indexHeaders: (nextRoot: string, token: number) =>
      indexHeaders(nextRoot, token, {
        debugLog,
        getCurrentHeaderIndexToken: () => headerIndexToken,
        getProgressReport: () => headerIndexProgressReport,
        getLastProgressAt: () => headerIndexLastProgressAt,
        setLastProgressAt: value => {
          headerIndexLastProgressAt = value;
        },
        indexShaderQualityMacros: async () => await indexShaderQualityMacros(debugLog)
      })
  });
}
