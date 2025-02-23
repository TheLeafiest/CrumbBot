import { SlashCommandBuilder } from 'discord.js';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const __dirname = resolve();
const { serverOptions, serverUrl, serverInfo } = JSON.parse(readFileSync(join(__dirname, 'config.json')));

export const data = new SlashCommandBuilder()
  .setName('command-server')
  .setDescription('Command a selected server')
  .addStringOption(option => option.setName('server')
    .setDescription('The server to command')
    .setRequired(true)
    .addChoices(...serverOptions.map(server => {
      return { name: server, value: server };
    }))
  )
  .addStringOption(option => option.setName('command')
    .setDescription('The command to run')
    .setRequired(true)
    .addChoices(...[
      { name: 'start', value: 'start' },
      { name: 'stop', value: 'stop' },
      { name: 'info', value: 'info' },
      { name: 'status', value: null },
      { name: 'restart', value: 'restart' },
    ])
  );
export async function execute(interaction) {
  const server = interaction.options.getString('server');
  const command = interaction.options.getString('command');
  let commandResult = {
    action: null,
    response: null,
  };

  try {
    if (!serverOptions.includes(server)) {
      throw new Error(`Unknown server: ${server}`);
    }

    switch (command) {
      case 'start':
        commandResult.action = 'Starting';
        commandResult.response = 'started';
        break;
      case 'stop':
        commandResult.action = 'Stopping';
        commandResult.response = 'stopped';
        break;
      case 'info':
        commandResult.action = 'Getting info for';
        commandResult.response = null;
      case 'status':
        commandResult.action = 'Checking status of';
        commandResult.response = null;
        break;
      case 'restart':
        commandResult.action = 'Restarting';
        commandResult.response = 'restarted';
        break;
      default:
        commandResult.action = null;
        commandResult.response = null;
        break;
    }

    if (!commandResult.action) {
      throw new Error(`Unknown action: ${command}`);
    }

    await interaction.reply(`${commandResult.action} ${server} server...`);

    if (command === 'info') {
      if (!serverInfo[server]) {
        throw new Error(`No info found for the ${server} server`);
      }

      await interaction.followUp(`${JSON.stringify(serverInfo[server], null, 2)}`);
      return;
    }

    const response = await fetch(`${serverUrl}/${server}/${command}`);

    if (response.status !== 200) {
      throw new Error(`Server responded with status code ${response.status}`);
    }

    await interaction.followUp(`Successfully ${commandResult.response} the ${server} server`);
  } catch (error) {
    await interaction.followUp(`There was an error while starting the ${server} server: ${error}`);
    console.log(error);
  }
}
