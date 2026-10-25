import { SlashCommandBuilder } from 'discord.js';
import type { Config } from '../config.js';
import type { Command } from './types.js';

// Progress text shown while running, and the past tense used on success (null: no success message)
const serverActions = {
  start: { action: 'Starting', response: 'started' },
  stop: { action: 'Stopping', response: 'stopped' },
  info: { action: 'Getting info for', response: null },
  status: { action: 'Checking status of', response: null },
  restart: { action: 'Restarting', response: 'restarted' },
} as const;

type ServerAction = keyof typeof serverActions;

const isServerAction = (command: string): command is ServerAction => Object.hasOwn(serverActions, command);

export function createServerCommand({ serverOptions, serverUrl, serverInfo }: Config): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('server-command')
      .setDescription('Send a command to a selected server')
      .addStringOption(option => option.setName('server')
        .setDescription('The server to send a command to')
        .setRequired(true)
        .addChoices(...serverOptions.map(server => ({ name: server, value: server }))))
      .addStringOption(option => option.setName('command')
        .setDescription('The command to send to the server')
        .setRequired(true)
        .addChoices(...Object.keys(serverActions).map(command => ({ name: command, value: command })))),

    async execute(interaction) {
      const server = interaction.options.getString('server', true);
      const command = interaction.options.getString('command', true);

      try {
        if (!serverOptions.includes(server)) {
          throw new Error(`Unknown server: ${server}`);
        }

        if (!isServerAction(command)) {
          throw new Error(`Unknown action: ${command}`);
        }

        const { action, response } = serverActions[command];
        await interaction.reply(`${action} ${server} server...`);

        if (command === 'info') {
          if (!serverInfo[server]) {
            throw new Error(`No info found for the ${server} server`);
          }

          await interaction.followUp(`${JSON.stringify(serverInfo[server], null, 2)}`);
          return;
        }

        const url = command === 'status' ? `${serverUrl}/${server}` : `${serverUrl}/${server}/${command}`;
        const res = await fetch(url);

        if (res.status !== 200) {
          throw new Error(`Server responded with status code ${res.status}`);
        }

        if (command === 'status') {
          const data = await res.json() as { status?: string };
          await interaction.followUp(`${server} server: ${data.status}`);
        } else {
          await interaction.followUp(`Successfully ${response} the ${server} server`);
        }
      } catch (error) {
        await interaction.followUp(`There was an error while starting the ${server} server: ${error}`);
        console.log(error);
      }
    },
  };
}
