import * as vscode from 'vscode';

type ProgressReport = ((msg: string) => void) | null;

type OrchestratorEnv = {
  vscode: typeof vscode;
  getHeaderIndexToken: () => number;
  incHeaderIndexToken: () => number;

  getPendingHeaderIndexRoot: () => string | null;
  setPendingHeaderIndexRoot: (value: string | null) => void;

  getHeaderIndexInFlight: () => Promise<void> | null;
  setHeaderIndexInFlight: (value: Promise<void> | null) => void;

  getHeaderIndexProgressInFlight: () => Thenable<void> | null;
  setHeaderIndexProgressInFlight: (value: Thenable<void> | null) => void;

  setHeaderIndexProgressReport: (value: ProgressReport) => void;
  setHeaderIndexLastProgressAt: (value: number) => void;

  indexHeaders: (rootPath: string, token: number) => Promise<void>;
};

export async function requestHeaderIndex(rootPath: string, env: OrchestratorEnv): Promise<Thenable<void> | Promise<void> | null> {
  env.incHeaderIndexToken();
  env.setPendingHeaderIndexRoot(rootPath);

  const existingInFlight = env.getHeaderIndexInFlight();
  if (existingInFlight) {
    return existingInFlight;
  }

  if (!env.getHeaderIndexProgressInFlight()) {
    const progressThenable = env.vscode.window.withProgress(
        {
          location: env.vscode.ProgressLocation.Notification,
          title: 'AZSL: Indexing Atom headers',
          cancellable: true
        },
        async (progress, token) => {
          env.setHeaderIndexProgressReport((msg: string) => {
            try {
              progress.report({ message: msg });
            } catch {
            }
          });

          env.setHeaderIndexLastProgressAt(0);
          try {
            const report = (msg: string) => {
              try {
                progress.report({ message: msg });
              } catch {
              }
            };
            report('Starting...');
          } catch {
          }

          token.onCancellationRequested(() => {
            try {
              env.setPendingHeaderIndexRoot(null);
              env.incHeaderIndexToken();
              const report = (msg: string) => {
                try {
                  progress.report({ message: msg });
                } catch {
                }
              };
              report('Cancel requested...');
            } catch {
            }
          });

          const inFlight = (async () => {
            while (env.getPendingHeaderIndexRoot()) {
              const nextRoot = env.getPendingHeaderIndexRoot();
              env.setPendingHeaderIndexRoot(null);
              const myToken = env.getHeaderIndexToken();
              if (nextRoot) {
                await env.indexHeaders(nextRoot, myToken);
              }
            }
          })();

          env.setHeaderIndexInFlight(inFlight);

          try {
            await inFlight;
          } finally {
            env.setHeaderIndexInFlight(null);
          }
        }
      );

    const progressPromise = Promise.resolve(progressThenable).finally(() => {
      env.setHeaderIndexProgressInFlight(null);
      env.setHeaderIndexProgressReport(null);
    });

    env.setHeaderIndexProgressInFlight(progressPromise);
  }

  return env.getHeaderIndexProgressInFlight();
}
