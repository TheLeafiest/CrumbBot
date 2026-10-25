import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface SyncConfig {
  token: string;
  forumChannelId: string;
  approverRoleId: string;
  gameTestPath: string;
  // The game's update manifest; its "version" is the released commit
  releaseManifest: string;
  bdPath: string;
}

export const defaultConfigPath = join(homedir(), '.config', 'crumbbot', 'sync.json');

/**
 * Read the sync's settings. The file holds the bot token, so it must be readable by its owner
 * only; anything looser is refused rather than warned about
 */
export function loadSyncConfig(path = process.env.CRUMBBOT_SYNC_CONFIG || defaultConfigPath): SyncConfig {
  const { mode } = statSync(path);

  if (mode & 0o077) {
    throw new Error(`${path} holds the bot token but others can read it. Run: chmod 600 ${path}`);
  }

  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const config = {
    gameTestPath: join(homedir(), 'projects', 'kale', 'gameTest'),
    releaseManifest: '/mnt/c/Users/khalt/Games/gameTest/updates/client_update.json',
    bdPath: join(homedir(), '.local', 'bin', 'bd'),
    ...raw,
  };

  const problems = ['token', 'forumChannelId', 'approverRoleId', 'gameTestPath', 'releaseManifest', 'bdPath']
    .filter(key => typeof config[key as keyof typeof config] !== 'string' || config[key as keyof typeof config] === '')
    .map(key => `"${key}" must be a non-empty string`);

  if (problems.length > 0) {
    throw new Error(`Invalid ${path}:\n  - ${problems.join('\n  - ')}`);
  }

  return config as SyncConfig;
}
