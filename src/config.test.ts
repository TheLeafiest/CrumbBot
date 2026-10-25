import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseConfig } from './config.js';

const valid = {
  token: 't',
  clientId: '1',
  guildId: '2',
  generalChannelId: '3',
  serverOptions: ['Minecraft'],
  serverUrl: 'http://192.168.0.2:8000',
  serverInfo: { Minecraft: { ip: 'example' } },
  // Unused keys from older configs are allowed
  testChannelId: '5',
};

test('accepts a complete config', () => {
  assert.equal(parseConfig(valid).serverUrl, valid.serverUrl);
});

test('reports every problem at once', () => {
  const { token: _token, guildId: _guildId, ...partial } = valid;

  assert.throws(() => parseConfig({ ...partial, serverOptions: 'Minecraft' }), (error: Error) => {
    assert.match(error.message, /"token"/);
    assert.match(error.message, /"guildId"/);
    assert.match(error.message, /"serverOptions"/);
    return true;
  });
});

test('game requests are optional, and default the open cap to 3', () => {
  assert.equal(parseConfig(valid).gameRequests, undefined);
  assert.deepEqual(
    parseConfig({ ...valid, gameRequests: { forumChannelId: '6', approverRoleId: '7' } }).gameRequests,
    { forumChannelId: '6', approverRoleId: '7', maxOpenPerUser: 3 },
  );
});

test('a bad game requests block turns only that feature off, and says why', () => {
  const logged = test.mock.method(console, 'error', () => {});
  const config = parseConfig({ ...valid, gameRequests: { forumChannelId: '', maxOpenPerUser: '3' } });

  assert.equal(config.gameRequests, undefined);
  assert.equal(config.token, valid.token);

  const message = String(logged.mock.calls[0]?.arguments[0]);
  assert.match(message, /Game requests are OFF/);
  assert.match(message, /gameRequests\.forumChannelId/);
  assert.match(message, /gameRequests\.approverRoleId/);
  assert.match(message, /gameRequests\.maxOpenPerUser/);
});

test('Chip Check is off unless configured, and says so when only the old key is set', () => {
  const logged = test.mock.method(console, 'log', () => {});

  assert.equal(parseConfig(valid).chipCheck, undefined);
  assert.equal(logged.mock.callCount(), 0);

  assert.equal(parseConfig({ ...valid, chipCheckChannelId: '4' }).chipCheck, undefined);
  assert.match(String(logged.mock.calls[0]?.arguments[0]), /"chipCheckChannelId" is no longer used/);
});

test('a Chip Check block fills in the original schedule and message', () => {
  assert.deepEqual(parseConfig({ ...valid, chipCheck: { channelId: '4' } }).chipCheck, {
    channelId: '4',
    schedule: '00 00 15 * * 1,3,5',
    message: 'Chip Check!',
    reactions: [],
  });
});

test('a bad Chip Check block turns only Chip Check off', () => {
  const logged = test.mock.method(console, 'error', () => {});
  const config = parseConfig({ ...valid, chipCheck: { channelId: '4', reactions: 'all of them' } });

  assert.equal(config.chipCheck, undefined);
  assert.equal(config.token, valid.token);
  assert.match(String(logged.mock.calls[0]?.arguments[0]), /Chip Check is OFF[\s\S]*chipCheck\.reactions/);
});

test('rejects a config that is not an object', () => {
  assert.throws(() => parseConfig([]), /JSON object/);
});
