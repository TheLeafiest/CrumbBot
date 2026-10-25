import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// config.json, birthdays.json and images/ live in the working directory (/crumbbot in the
// container), where Unraid bind-mounts them
export const dataDir = process.cwd();

export interface Config {
  token: string;
  clientId: string;
  guildId: string;
  generalChannelId: string;
  chipCheckChannelId: string;
  serverOptions: string[];
  serverUrl: string;
  serverInfo: Record<string, unknown>;
  // Ideas and bug reports for gameTest; the feature is off when this block is absent
  gameRequests?: GameRequestsConfig;
}

export interface GameRequestsConfig {
  forumChannelId: string;
  // Members with this role can approve, decline, and close requests
  approverRoleId: string;
  // Open (New or Approved) submissions allowed per member at once
  maxOpenPerUser: number;
}

const defaultMaxOpenPerUser = 3;

function parseGameRequests(raw: unknown, problems: string[]): GameRequestsConfig | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    problems.push('"gameRequests" must be an object');
    return undefined;
  }

  const { forumChannelId, approverRoleId, maxOpenPerUser = defaultMaxOpenPerUser } = raw as Record<string, unknown>;

  for (const [key, value] of Object.entries({ forumChannelId, approverRoleId })) {
    if (typeof value !== 'string' || value === '') {
      problems.push(`"gameRequests.${key}" must be a non-empty string`);
    }
  }

  if (typeof maxOpenPerUser !== 'number' || !Number.isInteger(maxOpenPerUser) || maxOpenPerUser < 1) {
    problems.push('"gameRequests.maxOpenPerUser" must be a whole number of at least 1');
  }

  return { forumChannelId, approverRoleId, maxOpenPerUser } as GameRequestsConfig;
}

const requiredStrings = [
  'token',
  'clientId',
  'guildId',
  'generalChannelId',
  'chipCheckChannelId',
  'serverUrl',
] as const;

/**
 * Validate the contents of config.json, reporting every problem at once so a bad config
 * is fixed in one pass instead of one restart per missing key
 */
export function parseConfig(raw: unknown): Config {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('config.json must contain a JSON object');
  }

  const value = raw as Record<string, unknown>;
  const problems: string[] = [];

  for (const key of requiredStrings) {
    if (typeof value[key] !== 'string' || value[key] === '') {
      problems.push(`"${key}" must be a non-empty string`);
    }
  }

  const { serverOptions, serverInfo } = value;
  if (!Array.isArray(serverOptions) || !serverOptions.every(option => typeof option === 'string')) {
    problems.push('"serverOptions" must be an array of strings');
  }
  if (typeof serverInfo !== 'object' || serverInfo === null || Array.isArray(serverInfo)) {
    problems.push('"serverInfo" must be an object');
  }

  const gameRequests = parseGameRequests(value.gameRequests, problems);

  if (problems.length > 0) {
    throw new Error(`Invalid config.json:\n  - ${problems.join('\n  - ')}`);
  }

  return { ...value, gameRequests } as unknown as Config;
}

export function loadConfig(path = join(dataDir, 'config.json')): Config {
  return parseConfig(JSON.parse(readFileSync(path, 'utf8')));
}
