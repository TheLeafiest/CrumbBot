import { SlashCommandBuilder } from 'discord.js';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Config } from '../config.js';
import { describeError, respond, serverFetch } from './server-api.js';
import type { Command } from './types.js';

// Can use serverOptions if this needs to be expanded to more games
const server = 'Minecraft';
// Minecraft usernames: 3-16 letters, digits or underscores. The username is spliced into a
// shell command on the game server, so anything outside this set must be rejected.
const usernamePattern = /^[A-Za-z0-9_]{3,16}$/;
// The log lines to search, and how long to give the server to write its answer first
const logLinesToSearch = 20;
const logWriteDelayMs = 1_000;

/**
 * The most recent answer to `whitelist list` in a chunk of the server log, e.g.
 * "There are 2 whitelisted player(s): Alice, Bob" or "There are no whitelisted players"
 */
export function findWhitelistLine(log: string): string | null {
  const lines = log.split('\n').filter(line => /whitelisted player/i.test(line));
  // Drop the "[12:00:00] [Server thread/INFO]: " prefix
  return lines.at(-1)?.replace(/^.*?\]:\s*/, '').trim() || null;
}

export function createServerWhitelist({ serverOptions, serverUrl }: Config): Command {
  const exec = (command: string) => serverFetch(`${serverUrl}/${server}/exec`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ command }),
  });

  return {
    data: new SlashCommandBuilder()
      .setName('server-whitelist')
      .setDescription('List, add, or remove a users from the whitelist')
      .addStringOption(option => option.setName('command')
        .setDescription('The command to run')
        .setRequired(true)
        .addChoices(
          { name: 'add', value: 'add' },
          { name: 'remove', value: 'remove' },
          { name: 'list', value: 'list' },
        ))
      .addStringOption(option => option.setName('username')
        .setDescription('The username to add or remove')
        .setRequired(false)),

    async execute(interaction) {
      const command = interaction.options.getString('command', true);
      const username = interaction.options.getString('username');

      try {
        if (!serverOptions.includes(server)) {
          throw new Error(`Unknown server: ${server}`);
        }

        let action: string;
        let response: string | null;

        switch (command) {
          case 'add':
            action = `Adding ${username} to`;
            response = `added ${username} to`;
            break;
          case 'remove':
            action = `Removing ${username} from`;
            response = `removed ${username} from`;
            break;
          case 'list':
            action = 'Listing players in';
            response = null;
            break;
          default:
            throw new Error(`Unknown action: ${command}`);
        }

        await interaction.reply(`${action} whitelist...`);

        let commandString: string = command;

        if (command !== 'list') {
          // Check if the username is required for the command
          if (!username) {
            throw new Error(`The 'username' field is required when the command is '${command}'.`);
          }

          if (!usernamePattern.test(username)) {
            throw new Error(`'${username}' is not a valid Minecraft username (3-16 letters, numbers or underscores).`);
          }

          commandString = `${command} ${username}`;
        }

        const res = await exec(`/serverdata/serverfiles/execute_command.sh ${server} ${commandString}`);

        if (res.status !== 200) {
          throw new Error(`Server responded with status code ${res.status}`);
        }

        if (response === null) {
          // The answer goes to the server log, not the API response; give it a moment to land
          await sleep(logWriteDelayMs);
          const resLog = await exec(`tail -n ${logLinesToSearch} /serverdata/serverfiles/logs/latest.log`);
          const { result } = await resLog.json() as { result?: string };
          await interaction.followUp(findWhitelistLine(result ?? '') ?? 'Couldn\'t find the whitelist in the server log, try again in a moment');
        } else {
          await interaction.followUp(`Successfully ${response} whitelist`);
        }
      } catch (error) {
        await respond(interaction, `There was an error sending the whitelist command (${command}) to the ${server} server: ${describeError(error)}`);
        console.error(error);
      }
    },
  };
}
