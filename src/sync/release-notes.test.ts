import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  parseReleaseNotes,
  planReleaseNotes,
  readPosted,
  releaseMessages,
  releaseTitle,
  seedPosted,
  writePosted,
  type ReleaseEntry,
} from './release-notes.js';

const notes = `# gameTest release notes

Newest first. The heading never changes once it's out.

## 2026-11-02 · Phase 3: the hero hammer
Build: abc1234

- **Rebuild towers** with the hammer.

## 2026-10-26 · Phase 2: towers fight back
Build: 4e2aae4

- **Towers have health now.**
- **Every tower has a cannon.**

## 2026-10-01 · Phase 1: first build

- Kobolds.
`;

test('parses each entry with its build line, skipping the introduction', () => {
  assert.deepEqual(parseReleaseNotes(notes), [
    { heading: '2026-11-02 · Phase 3: the hero hammer', build: 'abc1234', body: '- **Rebuild towers** with the hammer.' },
    { heading: '2026-10-26 · Phase 2: towers fight back', build: '4e2aae4', body: '- **Towers have health now.**\n- **Every tower has a cannon.**' },
    { heading: '2026-10-01 · Phase 1: first build', build: null, body: '- Kobolds.' },
  ]);
});

test('the first run only posts the newest entry', () => {
  const entries = parseReleaseNotes(notes);
  const actions = planReleaseNotes(entries, seedPosted(entries), () => 'released');

  assert.deepEqual(actions.map(action => action.entry.heading), ['2026-11-02 · Phase 3: the hero hammer']);
});

test('posts unposted entries oldest first, and waits for unreleased builds', () => {
  const entries = parseReleaseNotes(notes);
  const released = new Set(['4e2aae4']);
  const actions = planReleaseNotes(entries, new Set(), sha => (released.has(sha) ? 'released' : sha === 'abc1234' ? 'not-yet' : 'unknown-commit'));

  assert.deepEqual(actions.map(action => [action.kind, action.entry.heading]), [
    // No Build line: posted as soon as it's on main
    ['post-release', '2026-10-01 · Phase 1: first build'],
    ['post-release', '2026-10-26 · Phase 2: towers fight back'],
    ['release-waiting', '2026-11-02 · Phase 3: the hero hammer'],
  ]);
});

test('flags a build the repo does not know', () => {
  const [entry] = parseReleaseNotes(notes);
  const [action] = planReleaseNotes(entry ? [entry] : [], new Set(), () => 'unknown-commit');

  assert.equal(action?.kind, 'release-attention');
});

test('the post body ends with the build in small text', () => {
  const [, phase2] = parseReleaseNotes(notes);

  assert.deepEqual(releaseMessages(phase2 as ReleaseEntry), [
    '- **Towers have health now.**\n- **Every tower has a cannon.**\n\n-# Build 4e2aae4',
  ]);
});

test('long notes are split between bullets, each message under 2,000 characters', () => {
  const bullet = `- ${'x'.repeat(598)}`;
  const entry: ReleaseEntry = { heading: 'Big', build: null, body: Array(5).fill(bullet).join('\n') };
  const messages = releaseMessages(entry);

  assert.equal(messages.length, 2);
  assert.ok(messages.every(message => message.length <= 2000));
  assert.ok(messages.every(message => message.split('\n').every(line => line === bullet)));
});

test('a single line longer than a message is hard-split', () => {
  const messages = releaseMessages({ heading: 'Huge', build: null, body: 'y'.repeat(4500) });

  assert.deepEqual(messages.map(message => message.length), [2000, 2000, 500]);
});

test('titles fit Discord\'s 100 characters', () => {
  assert.equal(releaseTitle({ heading: 'z'.repeat(150), build: null, body: '' }).length, 100);
});

test('posted headings survive a round trip, and a missing file means a first run', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'crumbbot-release-')), 'state', 'release-notes.json');

  assert.equal(readPosted(path), null);
  writePosted(new Set(['a', 'b']), path);
  assert.deepEqual(readPosted(path), new Set(['a', 'b']));
});
