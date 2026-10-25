import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseConfig } from './config.js';

const valid = {
  token: 't',
  clientId: '1',
  guildId: '2',
  generalChannelId: '3',
  chipCheckChannelId: '4',
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

test('rejects a config that is not an object', () => {
  assert.throws(() => parseConfig([]), /JSON object/);
});
