import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GuildMember } from 'discord.js';
import { resolveTags } from './forum.js';
import { hasRole, nextTags, outcomeMessage, parseThreadReference, readTags, triageRow } from './triage.js';

const { tagIds } = resolveTags(['Idea', 'Bug', 'New', 'Approved', 'Declined', 'Duplicate', 'Shipped'].map(name => ({ id: name.toLowerCase(), name })));
const buttonLabels = (status: Parameters<typeof triageRow>[0]) => triageRow(status).toJSON().components.map(button => 'label' in button ? button.label : '');

test('shows the decisions that fit each status', () => {
  assert.deepEqual(buttonLabels('New'), ['Approve', 'Decline', 'Duplicate']);
  assert.deepEqual(buttonLabels('Approved'), ['Shipped', 'Decline']);
  assert.deepEqual(buttonLabels('Declined'), ['Reopen']);
  assert.deepEqual(buttonLabels('Shipped'), ['Reopen']);
});

test('reads status and type from the tags', () => {
  assert.deepEqual(readTags(['bug', 'approved'], tagIds), { status: 'Approved', type: 'bug' });
  assert.deepEqual(readTags(['idea'], tagIds), { status: null, type: 'idea' });
});

test('swaps only the status tag, keeping the type and any hand-added tags', () => {
  assert.deepEqual(nextTags(['bug', 'new', 'hand-added'], tagIds, 'Approved'), ['bug', 'hand-added', 'approved']);
});

test('checks roles on both cached and raw members', () => {
  assert.ok(hasRole({ roles: ['approver'] } as never, 'approver'));
  assert.ok(!hasRole({ roles: ['other'] } as never, 'approver'));
  assert.ok(hasRole({ roles: { cache: new Map([['approver', {}]]) } } as unknown as GuildMember, 'approver'));
  assert.ok(!hasRole(null, 'approver'));
});

test('finds the post in a pasted link, mention or id', () => {
  assert.equal(parseThreadReference(' https://discord.com/channels/111111111111111111/222222222222222222 '), '222222222222222222');
  assert.equal(parseThreadReference('https://discord.com/channels/1/2/3'), '2');
  assert.equal(parseThreadReference('<#333333333333333333>'), '333333333333333333');
  assert.equal(parseThreadReference('444444444444444444'), '444444444444444444');
  assert.equal(parseThreadReference('the one about hats'), null);
});

test('tells the submitter the outcome, quoting a decline reason', () => {
  assert.equal(
    outcomeMessage('decline', { submitterId: '1', type: 'idea', approverName: 'Kale', reason: 'Out of scope\nfor now' }),
    '<@1> Your idea wasn\'t picked up this time.\n> Out of scope\n> for now\n-# Decided by Kale',
  );
  assert.equal(
    outcomeMessage('approve', { submitterId: '1', type: 'bug', approverName: 'Kale' }),
    '<@1> Your bug report was confirmed, and it\'s on the list to fix.\n-# Decided by Kale',
  );
  assert.equal(
    outcomeMessage('duplicate', { submitterId: null, type: 'idea', approverName: 'Kale', originalThreadId: '9' }),
    'This one is already covered in <#9>, so this post is closed. Add your vote and thoughts there!\n-# Decided by Kale',
  );
  assert.match(outcomeMessage('reopen', { submitterId: '1', type: 'idea', approverName: 'Kale' }), /Reopened by Kale$/);
});
