import { SlashCommandBuilder } from 'discord.js';
import { readFileSync } from 'node:fs';

const { serverOptions, serverUrl } = JSON.parse(readFileSync('./config.json'));

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
    switch (command) {
      case 'start':
        commandResult.action = 'Starting';
        commandResult.response = 'started';
        break;
      case 'stop':
        commandResult.action = 'Stopping';
        commandResult.response = 'stopped';
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
