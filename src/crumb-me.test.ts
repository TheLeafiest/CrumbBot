import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Message } from 'discord.js';
import { handleCrumbMe } from './crumb-me.js';

const imagesDir = mkdtempSync(join(tmpdir(), 'crumbbot-images-'));
writeFileSync(join(imagesDir, 'crumb.jpg'), '');
writeFileSync(join(imagesDir, 'notes.txt'), '');

function fakeMessage(content: string, send: (options: unknown) => Promise<unknown>, bot = false) {
  return {
    author: { bot },
    content,
    channel: { isSendable: () => true, send },
  } as unknown as Message;
}

test('sends a .jpg from the images folder', async () => {
  const sent: unknown[] = [];
  await handleCrumbMe(fakeMessage('pls CRUMB ME', async options => sent.push(options)), imagesDir);

  assert.deepEqual(sent, [{ files: [{ attachment: join(imagesDir, 'crumb.jpg'), name: 'crumb.jpg' }] }]);
});

test('ignores bots and messages without the phrase', async () => {
  const sent: unknown[] = [];
  const send = async (options: unknown) => sent.push(options);
  await handleCrumbMe(fakeMessage('CRUMB ME', send, true), imagesDir);
  await handleCrumbMe(fakeMessage('crumb me', send), imagesDir);

  assert.equal(sent.length, 0);
});

test('a failed send resolves instead of crashing the bot', async () => {
  test.mock.method(console, 'error', () => {});
  await assert.doesNotReject(handleCrumbMe(
    fakeMessage('CRUMB ME', async () => { throw new Error('Missing Permissions'); }),
    imagesDir,
  ));
});

test('a missing images folder resolves instead of crashing the bot', async () => {
  test.mock.method(console, 'error', () => {});
  await assert.doesNotReject(handleCrumbMe(
    fakeMessage('CRUMB ME', async () => {}),
    join(imagesDir, 'does-not-exist'),
  ));
});
