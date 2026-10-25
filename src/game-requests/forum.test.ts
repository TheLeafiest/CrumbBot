import assert from 'node:assert/strict';
import { test } from 'node:test';
import { missingPermissions, requiredPermissions, resolveTags } from './forum.js';

test('resolves every tag by name, ignoring case and surrounding spaces', () => {
  const { tagIds, missing } = resolveTags([
    { id: '1', name: 'Idea' },
    { id: '2', name: 'bug' },
    { id: '3', name: 'NEW' },
    { id: '4', name: 'Approved ' },
    { id: '5', name: 'Declined' },
    { id: '6', name: 'Duplicate' },
    { id: '7', name: 'Shipped' },
    { id: '8', name: 'Something else' },
  ]);

  assert.deepEqual(missing, []);
  assert.equal(tagIds.get('Bug'), '2');
  assert.equal(tagIds.get('New'), '3');
  assert.equal(tagIds.get('Approved'), '4');
});

test('lists the tags that are missing', () => {
  const { missing } = resolveTags([{ id: '1', name: 'Idea' }, { id: '2', name: 'Bug' }]);

  assert.deepEqual(missing, ['New', 'Approved', 'Declined', 'Duplicate', 'Shipped']);
});

test('names the permissions the bot lacks', () => {
  const lacking: bigint = requiredPermissions['Manage Threads'];

  assert.deepEqual(missingPermissions(permission => permission !== lacking), ['Manage Threads']);
  assert.deepEqual(missingPermissions(() => true), []);
});
