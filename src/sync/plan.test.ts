import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Bead } from './beads.js';
import { beadDescription, describeAction, planSync, type PostInfo } from './plan.js';
import { closeSha, duplicateOf, type ReleaseCheck } from './release.js';

const post = (name: string, status: PostInfo['status'], type: PostInfo['type'] = 'idea'): PostInfo => ({
  threadId: name,
  url: `https://discord.com/channels/1/${name}`,
  title: name,
  status,
  type,
});
const bead = (name: string, status: string, closeReason?: string): Bead => ({
  id: `gameTest-${name}`,
  title: name,
  status,
  external_ref: `https://discord.com/channels/1/${name}`,
  close_reason: closeReason ?? null,
});
// abc1234 is released, def5678 is committed but not released, everything else is unknown
const releases: Record<string, ReleaseCheck> = { abc1234: 'released', def5678: 'not-yet' };
const isReleased = (sha: string) => releases[sha] ?? 'unknown-commit';
const plan = (posts: PostInfo[], beads: Bead[]) => planSync(posts, beads, isReleased).map(action => [action.kind, action.post.title]);

test('reads the commit and duplicate from close reasons', () => {
  assert.equal(closeSha('(7d9a9bb) Hats added'), '7d9a9bb');
  assert.equal(closeSha('Fixed in 68e42ae'), '68e42ae');
  assert.equal(closeSha('Duplicate of gameTest-keq'), null);
  assert.equal(closeSha('Added hats (7d9a9bb)'), null);
  assert.equal(duplicateOf('duplicate of gameTest-keq'), 'gameTest-keq');
  assert.equal(duplicateOf('Fixed in 68e42ae'), null);
});

test('creates a bead for an approved post that has none', () => {
  assert.deepEqual(plan([post('hats', 'Approved')], []), [['create-bead', 'hats']]);
});

test('leaves posts alone while their bead is open, and ignores New and Shipped posts', () => {
  assert.deepEqual(plan(
    [post('hats', 'Approved'), post('fresh', 'New'), post('done', 'Shipped')],
    [bead('hats', 'open'), bead('done', 'closed', '(abc1234) Done')],
  ), []);
});

test('ships a post only once its commit is in the release', () => {
  assert.deepEqual(plan(
    [post('released', 'Approved'), post('unreleased', 'Approved')],
    [bead('released', 'closed', '(abc1234) Added'), bead('unreleased', 'closed', 'Fixed in def5678')],
  ), [['ship-post', 'released'], ['waiting', 'unreleased']]);
});

test('maps a gameTest duplicate to a Duplicate post', () => {
  const [action] = planSync([post('hats', 'Approved')], [bead('hats', 'closed', 'duplicate of gameTest-keq')], isReleased);

  assert.equal(action?.kind, 'duplicate-post');
  assert.match(describeAction(action!), /duplicate of gameTest-keq/);
});

test('flags beads closed without a commit, or with one git does not know, instead of acting', () => {
  assert.deepEqual(plan(
    [post('wontdo', 'Approved'), post('mystery', 'Approved')],
    [bead('wontdo', 'closed', 'Out of scope'), bead('mystery', 'closed', '(0000000) Done')],
  ), [['attention', 'wontdo'], ['attention', 'mystery']]);
});

test('closes the open bead of a post declined or marked duplicate after approval', () => {
  const actions = planSync(
    [post('nope', 'Declined'), post('again', 'Duplicate'), post('closed-already', 'Declined')],
    [bead('nope', 'open'), bead('again', 'in_progress'), bead('closed-already', 'closed', 'whatever')],
    isReleased,
  );

  assert.deepEqual(actions.map(action => [action.kind, action.post.title]), [['close-bead', 'nope'], ['close-bead', 'again']]);
  assert.match(actions[0]?.kind === 'close-bead' ? actions[0].reason : '', /^Declined in Discord: https:/);
});

test('describes a bead with a link back and without the Discord mention', () => {
  assert.equal(
    beadDescription('Submitted by <@123>\n\n**Your idea**\nAdd hats', 'https://discord.com/channels/1/2'),
    'From the #game-ideas forum on Discord: https://discord.com/channels/1/2\n\n**Your idea**\nAdd hats',
  );
});
