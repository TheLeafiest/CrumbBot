import type { Config } from '../config.js';
import type { GameRequests } from '../game-requests/index.js';
import { addBirthday } from './add-birthday.js';
import { ping } from './ping.js';
import { removeBirthday } from './remove-birthday.js';
import { createServerCommand } from './server-command.js';
import { createServerWhitelist } from './server-whitelist.js';
import type { Command } from './types.js';

export type { Command } from './types.js';

/**
 * Every slash command the bot registers and handles
 */
export function createCommands(config: Config, gameRequests: GameRequests | null): Command[] {
  return [
    ping,
    addBirthday,
    removeBirthday,
    createServerCommand(config),
    createServerWhitelist(config),
    // /idea and /bug, only registered when the feature is configured
    ...gameRequests?.commands ?? [],
  ];
}
