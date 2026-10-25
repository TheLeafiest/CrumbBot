import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeError } from './server-api.js';
import { findWhitelistLine } from './server-whitelist.js';

test('finds the latest whitelist answer among other log lines', () => {
  const log = [
    '[11:58:01] [Server thread/INFO]: There are 1 whitelisted player(s): Alice',
    '[11:59:30] [Server thread/INFO]: Bob joined the game',
    '[12:00:00] [Server thread/INFO]: There are 2 whitelisted player(s): Alice, Kale_2026',
    '[12:00:01] [Server thread/INFO]: Bob left the game',
  ].join('\n');

  assert.equal(findWhitelistLine(log), 'There are 2 whitelisted player(s): Alice, Kale_2026');
});

test('handles an empty whitelist and a log without an answer', () => {
  assert.equal(findWhitelistLine('[12:00:00] [Server thread/INFO]: There are no whitelisted players'), 'There are no whitelisted players');
  assert.equal(findWhitelistLine('[12:00:00] [Server thread/INFO]: Bob joined the game'), null);
  assert.equal(findWhitelistLine(''), null);
});

test('explains a timeout in plain words', () => {
  const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');

  assert.equal(describeError(timeout), 'the server didn\'t respond within 30 seconds');
  assert.equal(describeError(new Error('Server responded with status code 500')), 'Error: Server responded with status code 500');
});
