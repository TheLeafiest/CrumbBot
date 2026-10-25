import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const shaPattern = /^[0-9a-f]{7,40}$/;

/**
 * The commit the current release was built from: the manifest's "version", minus the
 * "-dirty.HHMMSS" suffix a build from uncommitted changes gets
 */
export function readReleaseSha(manifestPath: string): string {
  const { version } = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: unknown };
  const sha = typeof version === 'string' ? version.replace(/-dirty\.\d+$/, '') : '';

  if (!shaPattern.test(sha)) {
    throw new Error(`${manifestPath} has no usable "version" (got ${JSON.stringify(version)})`);
  }

  return sha;
}

/**
 * The commit a bead was closed in, from its close reason: "(7d9a9bb) ..." (brisk-anvil's
 * convention for community beads) or "Fixed in 7d9a9bb" (older beads). Null when there is none,
 * e.g. a decline or duplicate, which never counts as shipped
 */
export function closeSha(closeReason: string | null | undefined): string | null {
  const reason = closeReason?.trim() ?? '';

  return (/^\(([0-9a-f]{7,40})\)/.exec(reason) ?? /^Fixed in ([0-9a-f]{7,40})\b/i.exec(reason))?.[1] ?? null;
}

/**
 * The bead a close reason says this one duplicates, e.g. "duplicate of gameTest-keq"
 */
export function duplicateOf(closeReason: string | null | undefined): string | null {
  return /duplicate of ([A-Za-z][\w-]*-[\w.]+)/i.exec(closeReason ?? '')?.[1] ?? null;
}

export type ReleaseCheck = 'released' | 'not-yet' | 'unknown-commit';

/**
 * Whether a commit is part of the release, via `git merge-base --is-ancestor`
 */
export function checkReleased(repoPath: string, sha: string, releaseSha: string): ReleaseCheck {
  const { status } = spawnSync('git', ['-C', repoPath, 'merge-base', '--is-ancestor', sha, releaseSha], { stdio: 'ignore' });

  // 0: an ancestor (released), 1: not an ancestor, anything else: git doesn't know the commit
  return status === 0 ? 'released' : status === 1 ? 'not-yet' : 'unknown-commit';
}
