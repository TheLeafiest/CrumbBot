import assert from 'node:assert/strict';
import { test } from 'node:test';
import { syncReleaseNotes, type ReleaseNotesSync } from './release-notes-sync.js';
import { releaseTitle } from './release-notes.js';

const entry = (date: string, title: string, build: string) => `## ${date} · ${title}\nBuild: ${build}\n\n- ${title} notes.\n`;
const notes = (...entries: string[]) => `# gameTest release notes\n\nNewest first.\n\n${entries.join('\n')}`;

const phase1 = entry('2026-10-01', 'Phase 1', 'aaa1111');
const phase2 = entry('2026-10-26', 'Phase 2', 'bbb2222');
const phase3 = entry('2026-11-02', 'Phase 3', 'ccc3333');
const phase4 = entry('2026-11-09', 'Phase 4', 'ddd4444');

/**
 * A fake forum and state file that persist between runs, like the hourly timer sees them
 */
function world(released: string[]) {
  const releasedBuilds = new Set(released);
  const forumPosts: string[] = [];
  let state: Set<string> | null = null;
  let failing: string | null = null;

  return {
    forumPosts,
    release: (build: string) => releasedBuilds.add(build),
    loseStateFile: () => { state = null; },
    failNextPostOf: (heading: string) => { failing = heading; },
    state: () => state,

    run: (markdown: string, overrides: Partial<ReleaseNotesSync> = {}) => syncReleaseNotes({
      markdown,
      isReleased: sha => (releasedBuilds.has(sha) ? 'released' : 'not-yet'),
      readPosted: () => (state ? new Set(state) : null),
      writePosted: posted => { state = new Set(posted); },
      releaseTagId: 'release-tag',
      forumName: 'game-ideas',
      hasBotPost: title => forumPosts.includes(title),
      post: async ({ heading, build, body }) => {
        if (heading === failing) {
          failing = null;
          throw new Error('Discord is down');
        }

        forumPosts.push(releaseTitle({ heading, build, body }));
      },
      dryRun: false,
      log: () => {},
      logError: () => {},
      ...overrides,
    }),
  };
}

test('the first run posts only the newest entry, and the next run posts nothing', async () => {
  const forum = world(['aaa1111', 'bbb2222']);

  assert.equal(await forum.run(notes(phase2, phase1)), 0);
  assert.deepEqual(forum.forumPosts, ['2026-10-26 · Phase 2']);

  await forum.run(notes(phase2, phase1));
  assert.deepEqual(forum.forumPosts, ['2026-10-26 · Phase 2']);
});

test('several new builds between runs are each posted once, oldest first', async () => {
  const forum = world(['bbb2222', 'ccc3333', 'ddd4444']);
  await forum.run(notes(phase2));

  await forum.run(notes(phase4, phase3, phase2));
  await forum.run(notes(phase4, phase3, phase2));

  assert.deepEqual(forum.forumPosts, ['2026-10-26 · Phase 2', '2026-11-02 · Phase 3', '2026-11-09 · Phase 4']);
});

test('an entry waits for its build, then is posted exactly once', async () => {
  const forum = world(['bbb2222']);
  await forum.run(notes(phase2));

  await forum.run(notes(phase3, phase2));
  assert.deepEqual(forum.forumPosts, ['2026-10-26 · Phase 2']);

  forum.release('ccc3333');
  await forum.run(notes(phase3, phase2));
  await forum.run(notes(phase3, phase2));
  assert.deepEqual(forum.forumPosts, ['2026-10-26 · Phase 2', '2026-11-02 · Phase 3']);
});

test('a lost state file does not repost what is already in the forum', async () => {
  const forum = world(['bbb2222']);
  await forum.run(notes(phase2));

  forum.loseStateFile();
  await forum.run(notes(phase2));

  assert.deepEqual(forum.forumPosts, ['2026-10-26 · Phase 2']);
  assert.deepEqual(forum.state(), new Set(['2026-10-26 · Phase 2']));
});

test('a failed post is retried next run; the others are not posted twice', async () => {
  const forum = world(['bbb2222', 'ccc3333', 'ddd4444']);
  await forum.run(notes(phase2));

  forum.failNextPostOf('2026-11-02 · Phase 3');
  assert.equal(await forum.run(notes(phase4, phase3, phase2)), 1);
  assert.deepEqual(forum.forumPosts, ['2026-10-26 · Phase 2', '2026-11-09 · Phase 4']);

  assert.equal(await forum.run(notes(phase4, phase3, phase2)), 0);
  assert.deepEqual(forum.forumPosts, ['2026-10-26 · Phase 2', '2026-11-09 · Phase 4', '2026-11-02 · Phase 3']);
});

test('a failed first run still never backfills older entries', async () => {
  const forum = world(['aaa1111', 'bbb2222']);

  forum.failNextPostOf('2026-10-26 · Phase 2');
  await forum.run(notes(phase2, phase1));
  await forum.run(notes(phase2, phase1));

  assert.deepEqual(forum.forumPosts, ['2026-10-26 · Phase 2']);
});

test('a first post that fails is still posted after a newer entry lands', async () => {
  const forum = world(['aaa1111', 'bbb2222', 'ccc3333']);

  forum.failNextPostOf('2026-10-26 · Phase 2');
  await forum.run(notes(phase2, phase1));
  await forum.run(notes(phase3, phase2, phase1));

  assert.deepEqual(forum.forumPosts, ['2026-10-26 · Phase 2', '2026-11-02 · Phase 3']);
});

test('without a Release tag, or in a dry run, nothing is posted or recorded', async () => {
  const forum = world(['bbb2222']);
  const logs: string[] = [];

  await forum.run(notes(phase2), { releaseTagId: null, log: line => logs.push(line) });
  await forum.run(notes(phase2), { dryRun: true });

  assert.deepEqual(forum.forumPosts, []);
  assert.equal(forum.state(), null);
  assert.ok(logs.some(line => line.includes('NEEDS YOU: add a "Release" tag')));
});
