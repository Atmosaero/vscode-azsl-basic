import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export type DebugLogFn = (message: string) => void;

export function resolveIncludeTarget(
  includeText: string,
  root: string | undefined,
  headersPathIndex: Map<string, string>,
  headersBasenameIndex: Map<string, string[]>,
  debugLog: DebugLogFn
): vscode.Uri | undefined {
  if (!root) {
    debugLog(`resolveIncludeTarget: no root path configured`);
    return undefined;
  }
  const normalized = includeText.replace(/\\/g, '/');
  debugLog(`resolveIncludeTarget: trying to resolve "${normalized}" (root: ${root})`);

  const pickBestCandidate = (candidates: string[] | undefined) => {
    if (!candidates || candidates.length === 0) return undefined;
    let best: string | null = null;
    let bestScore = -Infinity;
    for (const candidate of candidates) {
      const candidateRel = path.relative(root, candidate).replace(/\\/g, '/');
      let score = 0;
      if (candidateRel === normalized) score += 1000;
      if (candidateRel.endsWith('/' + normalized)) score += 800;
      if (normalized.startsWith('Atom/')) {
        const withoutAtom = normalized.substring(5);
        if (candidateRel === withoutAtom) score += 950;
        if (candidateRel.endsWith('/' + withoutAtom)) score += 750;
      }
      if (candidateRel.includes('ShaderLib')) score += 50;
      if (candidateRel.includes('/Atom/')) score += 20;
      score += Math.max(0, 200 - candidateRel.length);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return best || undefined;
  };

  const tryCandidateFile = (candidate: string, label: string) => {
    debugLog(`resolveIncludeTarget: checking ${label}: ${candidate}`);
    if (fs.existsSync(candidate)) {
      debugLog(`resolveIncludeTarget: found via ${label}: ${candidate}`);
      return vscode.Uri.file(candidate);
    }
    return undefined;
  };

  const tryHeadersPathIndex = (key: string, label: string) => {
    if (headersPathIndex.has(key)) {
      const found = headersPathIndex.get(key);
      debugLog(`resolveIncludeTarget: found in headersPathIndex (${label}): ${found}`);
      return found ? vscode.Uri.file(found) : undefined;
    }
    return undefined;
  };

  if (normalized.startsWith('Atom/')) {
    const withoutAtom = normalized.substring(5);
    const cand1 = path.join(root, withoutAtom);
    const cand2 = path.join(root, 'Atom', withoutAtom);
    const foundCand1 = tryCandidateFile(cand1, 'Atom/ path (without prefix)');
    if (foundCand1) return foundCand1;
    const foundCand2 = tryCandidateFile(cand2, 'Atom/ path (root/Atom/...)');
    if (foundCand2) return foundCand2;

    const foundKey1 = tryHeadersPathIndex(withoutAtom, 'without Atom/');
    if (foundKey1) return foundKey1;

    const atomPrefixed = 'Atom/' + withoutAtom;
    const foundKey2 = tryHeadersPathIndex(atomPrefixed, 'Atom/ + withoutAtom');
    if (foundKey2) return foundKey2;

    for (const [rel, abs] of headersPathIndex.entries()) {
      if (rel.endsWith('/' + withoutAtom) || rel === withoutAtom) {
        debugLog(`resolveIncludeTarget: found via suffix match (without Atom/): ${abs} (rel: ${rel})`);
        return vscode.Uri.file(abs);
      }
    }
  }

  const directCand1 = path.join(root, normalized);
  const directFound1 = tryCandidateFile(directCand1, 'direct root + normalized');
  if (directFound1) return directFound1;

  const directCand2 = path.join(root, 'Atom', normalized);
  const directFound2 = tryCandidateFile(directCand2, 'direct root/Atom + normalized');
  if (directFound2) return directFound2;

  const foundNormalized = tryHeadersPathIndex(normalized, 'normalized');
  if (foundNormalized) return foundNormalized;

  const atomPrefixedNormalized = normalized.startsWith('Atom/') ? normalized : 'Atom/' + normalized;
  const foundAtomPrefixedNormalized = tryHeadersPathIndex(atomPrefixedNormalized, 'Atom/ + normalized');
  if (foundAtomPrefixedNormalized) return foundAtomPrefixedNormalized;

  for (const [rel, abs] of headersPathIndex.entries()) {
    if (rel.endsWith('/' + normalized) || rel === normalized) {
      debugLog(`resolveIncludeTarget: found via suffix match: ${abs} (rel: ${rel})`);
      return vscode.Uri.file(abs);
    }
  }

  const base = path.basename(normalized);
  const byBase = headersBasenameIndex.get(base);
  if (byBase && byBase.length === 1) {
    debugLog(`resolveIncludeTarget: found via basename: ${byBase[0]}`);
    return vscode.Uri.file(byBase[0]);
  }

  if (byBase && byBase.length > 1) {
    const best = pickBestCandidate(byBase);
    if (best) {
      debugLog(`resolveIncludeTarget: selected best basename candidate: ${best}`);
      return vscode.Uri.file(best);
    }
  }

  debugLog(`resolveIncludeTarget: could not resolve "${normalized}"`);
  return undefined;
}

export function resolveIncludeWithFallback(
  includePath: string,
  primary: vscode.Uri | undefined,
  documentDir: string,
  workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined
): vscode.Uri | undefined {
  if (primary) return primary;

  try {
    if (documentDir) {
      const relCandidate = path.join(documentDir, includePath);
      if (fs.existsSync(relCandidate)) {
        return vscode.Uri.file(relCandidate);
      }
    }
  } catch {}

  try {
    const folders = workspaceFolders || [];
    for (const f of folders) {
      const wsCandidate = path.join(f.uri.fsPath, includePath);
      if (fs.existsSync(wsCandidate)) {
        return vscode.Uri.file(wsCandidate);
      }
    }
  } catch {}

  return undefined;
}
