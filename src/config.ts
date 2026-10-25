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

  if (problems.length > 0) {
    throw new Error(`Invalid config.json:\n  - ${problems.join('\n  - ')}`);
  }

  return value as unknown as Config;
}

export function loadConfig(path = join(dataDir, 'config.json')): Config {
  return parseConfig(JSON.parse(readFileSync(path, 'utf8')));
}
