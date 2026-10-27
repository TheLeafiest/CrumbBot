import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ReleaseCheck } from './release.js';

/*
 * gameTest's RELEASE_NOTES.md, newest entry first. brisk-anvil's format: each entry is
 *
 *   ## 2026-10-26 · Phase 2: towers fight back
 *   Build: 4e2aae4
 *
 *   - markdown bullets...
 *
 * The heading never changes once it's out, so it is the key for "already posted"
 */

export interface ReleaseEntry {
  heading: string;
  // A commit the tester build contains; the entry waits until it is released
  build: string | null;
  body: string;
}

// Discord limits: thread titles 100 characters, messages 2,000
const maxTitleLength = 100;
const maxMessageLength = 2000;

export const releaseTagName = 'Release';
export const postedStatePath = join(homedir(), '.local', 'state', 'crumbbot', 'release-notes.json');

/**
 * Every entry in the file, newest first. Text before the first '## ' heading is the file's
 * own introduction and is skipped
 */
export function parseReleaseNotes(markdown: string): ReleaseEntry[] {
  const entries: { heading: string; lines: string[] }[] = [];

  for (const line of markdown.split('\n')) {
    const heading = /^## (.+?)\s*$/.exec(line)?.[1];

    if (heading) {
      entries.push({ heading, lines: [] });
    } else {
      entries.at(-1)?.lines.push(line);
    }
  }

  return entries.map(({ heading, lines }) => {
    const buildLine = lines.findIndex(line => /^Build:\s*\S+/i.test(line));
    const build = buildLine === -1 ? null : /^Build:\s*([0-9a-f]{7,40})\s*$/i.exec(lines[buildLine] ?? '')?.[1] ?? null;
    const body = lines.filter((_line, i) => i !== buildLine).join('\n').trim();

    return { heading, build, body };
  });
}

/**
 * The forum post title for an entry
 */
export const releaseTitle = (entry: ReleaseEntry) => entry.heading.slice(0, maxTitleLength);

/**
 * The post text, in messages under Discord's limit: split between lines where possible, so a
 * bullet is never cut in half unless it alone is too long
 */
export function releaseMessages(entry: ReleaseEntry): string[] {
  const text = `${entry.body}${entry.build ? `\n\n-# Build ${entry.build}` : ''}`.trim() || entry.heading;
  const messages: string[] = [];
  let current = '';

  for (const line of text.split('\n')) {
    for (let start = 0; start < Math.max(line.length, 1); start += maxMessageLength) {
      const piece = line.slice(start, start + maxMessageLength);
      const next = current ? `${current}\n${piece}` : piece;

      if (next.length > maxMessageLength) {
        messages.push(current);
        current = piece;
      } else {
        current = next;
      }
    }
  }

  return [...messages, current].map(message => message.trim()).filter(Boolean);
}

export type ReleaseAction =
  | { kind: 'post-release'; entry: ReleaseEntry }
  // Reported only
  | { kind: 'release-waiting'; entry: ReleaseEntry }
  | { kind: 'release-attention'; entry: ReleaseEntry; message: string };

/**
 * The headings to treat as already posted when there is no state yet: everything but the
 * newest entry, so the first run never backfills old notes
 */
export const seedPosted = (entries: readonly ReleaseEntry[]) => new Set(entries.slice(1).map(entry => entry.heading));

/**
 * What to do with each entry not posted yet, oldest first so the forum reads in order
 */
export function planReleaseNotes(entries: readonly ReleaseEntry[], posted: ReadonlySet<string>, isReleased: (sha: string) => ReleaseCheck): ReleaseAction[] {
  return entries
    .filter(entry => !posted.has(entry.heading))
    .reverse()
    .map((entry): ReleaseAction => {
      // Agreed with brisk-anvil: an entry without a Build line goes out as soon as it's on main
      const released = entry.build ? isReleased(entry.build) : 'released';

      if (released === 'released') {
        return { kind: 'post-release', entry };
      }

      if (released === 'not-yet') {
        return { kind: 'release-waiting', entry };
      }

      return { kind: 'release-attention', entry, message: `names build ${entry.build}, which the gameTest repo doesn't have` };
    });
}

export function describeReleaseAction(action: ReleaseAction): string {
  const title = `release notes "${action.entry.heading}"`;

  switch (action.kind) {
    case 'post-release':
      return `post ${title}`;
    case 'release-waiting':
      return `wait: ${title} until build ${action.entry.build} is released`;
    case 'release-attention':
      return `NEEDS YOU: ${title} ${action.message}`;
  }
}

/**
 * RELEASE_NOTES.md as committed on gameTest's main branch (not the working tree, which may hold
 * an entry still being written), or null when main has no such file
 */
export function readReleaseNotes(gameTestPath: string): string | null {
  const { status, stdout } = spawnSync('git', ['-C', gameTestPath, 'show', 'main:RELEASE_NOTES.md'], { encoding: 'utf8' });

  return status === 0 ? stdout : null;
}

/**
 * Headings already posted, or null before the first run
 */
export function readPosted(path = postedStatePath): Set<string> | null {
  try {
    const { posted } = JSON.parse(readFileSync(path, 'utf8')) as { posted?: unknown };
    return new Set(Array.isArray(posted) ? posted.filter(heading => typeof heading === 'string') : []);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

export function writePosted(posted: ReadonlySet<string>, path = postedStatePath): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ posted: [...posted] }, null, 2)}\n`);
}
