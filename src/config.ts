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
  serverOptions: string[];
  serverUrl: string;
  serverInfo: Record<string, unknown>;
  // Ideas and bug reports for gameTest; the feature is off when this block is absent
  gameRequests?: GameRequestsConfig;
  // A scheduled post members react to; off when this block is absent
  chipCheck?: ChipCheckConfig;
}

export interface ChipCheckConfig {
  channelId: string;
  // node-schedule cron with seconds: second minute hour day-of-month month day-of-week
  schedule: string;
  message: string;
  // Added in order: unicode emoji ("👍") or custom emoji ("<:Name:id>")
  reactions: string[];
}

// The Crumb Crew's original Chip Check: Monday, Wednesday and Friday at 3:00 PM
const chipCheckDefaults = {
  schedule: '00 00 15 * * 1,3,5',
  message: 'Chip Check!',
  reactions: [] as string[],
};

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

function parseChipCheck(raw: unknown, problems: string[]): ChipCheckConfig | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    problems.push('"chipCheck" must be an object');
    return undefined;
  }

  const {
    channelId,
    schedule = chipCheckDefaults.schedule,
    message = chipCheckDefaults.message,
    reactions = chipCheckDefaults.reactions,
  } = raw as Record<string, unknown>;

  for (const [key, value] of Object.entries({ channelId, schedule, message })) {
    if (typeof value !== 'string' || value === '') {
      problems.push(`"chipCheck.${key}" must be a non-empty string`);
    }
  }

  if (!Array.isArray(reactions) || !reactions.every(reaction => typeof reaction === 'string' && reaction !== '')) {
    problems.push('"chipCheck.reactions" must be a list of emoji');
  }

  return { channelId, schedule, message, reactions } as ChipCheckConfig;
}

/**
 * Parse an optional feature's block. A bad block turns only that feature off, with every
 * problem logged; it must not take the whole bot down
 */
function parseOptional<T>(offMessage: string, raw: unknown, parse: (raw: unknown, problems: string[]) => T | undefined): T | undefined {
  const problems: string[] = [];
  const parsed = parse(raw, problems);

  if (problems.length > 0) {
    console.error(`${offMessage}: invalid config.json:\n  - ${problems.join('\n  - ')}`);
    return undefined;
  }

  return parsed;
}

const requiredStrings = [
  'token',
  'clientId',
  'guildId',
  'generalChannelId',
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

  const gameRequests = parseOptional('Game requests are OFF', value.gameRequests, parseGameRequests);
  const chipCheck = parseOptional('Chip Check is OFF', value.chipCheck, parseChipCheck);

  if (value.chipCheckChannelId !== undefined && value.chipCheck === undefined) {
    console.log('Chip Check is off: "chipCheckChannelId" is no longer used. To turn Chip Check on, add a "chipCheck" block (see README).');
  }

  return { ...value, gameRequests, chipCheck } as unknown as Config;
}

export function loadConfig(path = join(dataDir, 'config.json')): Config {
  const text = readFileSync(path, 'utf8');
  let raw: unknown;

  try {
    raw = JSON.parse(text);
  } catch (error) {
    // Node's message carries the line and column, e.g. "Expected ',' or '}' ... (line 14 column 3)"
    throw new Error(`config.json is not valid JSON: ${(error as Error).message}`);
  }

  return parseConfig(raw);
}
