import { SlashCommandBuilder } from 'discord.js';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const __dirname = resolve();
const { serverOptions, serverUrl } = JSON.parse(readFileSync(join(__dirname, 'config.json')));

export const data = new SlashCommandBuilder()
  .setName('status-server')
  .setDescription('Check the status a selected server')
  .addStringOption(option => option.setName('server')
    .setDescription('The server check the status of')
    .setRequired(true)
    .addChoices(...serverOptions.map(server => {
      return { name: server, value: server };
    }))
  );
export async function execute(interaction) {
  const server = interaction.options.getString('server');
  await interaction.reply(`Retrieving status of ${server} server...`);

  try {
    if (!serverOptions.includes(server)) {
      throw new Error(`Unknown server: ${server}`);
    }

    const response = await fetch(`${serverUrl}/${server}`);
    const data = await response.json();

    await interaction.followUp(`${server} server: ${data.status}`);
  } catch (error) {
    await interaction.followUp(`There was an error while retrieving the ${server} server status: ${error}`);
    console.log(error);
  }
}
