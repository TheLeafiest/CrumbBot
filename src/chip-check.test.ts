import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postChipCheck } from './chip-check.js';

// The Crumb Crew's original reactions, as example settings
const settings = {
  message: 'Chip Check!',
  reactions: ['<:Rounds:955271228833275944>', '<:Strips:1021193462743310428>', '<:Scoops:955271245706965032>'],
};

const quiet = () => test.mock.method(console, 'error', () => {});

test('posts the configured message and adds every reaction in order', async () => {
  const added: string[] = [];
  let posted = '';

  await postChipCheck({
    send: async ({ content }) => {
      posted = content;
      return { react: async (emoji: string) => { added.push(emoji); } };
    },
  }, settings);

  assert.equal(posted, 'Chip Check!');
  assert.deepEqual(added, settings.reactions);
});

test('one failing reaction does not stop the others or reject', async () => {
  quiet();
  const added: string[] = [];
  const [, broken] = settings.reactions;

  await postChipCheck({
    send: async () => ({
      react: async (emoji: string) => {
        if (emoji === broken) throw new Error('Unknown Emoji');
        added.push(emoji);
      },
    }),
  }, settings);

  assert.deepEqual(added, settings.reactions.filter(emoji => emoji !== broken));
});

test('a failed send resolves instead of rejecting', async () => {
  quiet();
  await assert.doesNotReject(postChipCheck({
    send: async () => { throw new Error('Missing Permissions'); },
  }, settings));
});
