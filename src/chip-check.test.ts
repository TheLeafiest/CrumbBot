import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chipCheckReactions, postChipCheck } from './chip-check.js';

const quiet = () => test.mock.method(console, 'error', () => {});

test('adds every reaction in order', async () => {
  const added: string[] = [];
  await postChipCheck({
    send: async () => ({ react: async (emoji: string) => { added.push(emoji); } }),
  });

  assert.deepEqual(added, chipCheckReactions);
});

test('one failing reaction does not stop the others or reject', async () => {
  quiet();
  const added: string[] = [];
  const [, broken] = chipCheckReactions;

  await postChipCheck({
    send: async () => ({
      react: async (emoji: string) => {
        if (emoji === broken) throw new Error('Unknown Emoji');
        added.push(emoji);
      },
    }),
  });

  assert.deepEqual(added, chipCheckReactions.filter(emoji => emoji !== broken));
});

test('a failed send resolves instead of rejecting', async () => {
  quiet();
  await assert.doesNotReject(postChipCheck({
    send: async () => { throw new Error('Missing Permissions'); },
  }));
});
