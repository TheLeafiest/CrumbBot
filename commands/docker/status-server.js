const { SlashCommandBuilder } = require('discord.js');
const { serverOptions, serverUrl } = require('./config.json');

module.exports = {
  data: new SlashCommandBuilder()
  .setName('status-server')
  .setDescription('Check the status a selected server')
  .addStringOption(option => 
    option.setName('server')
      .setDescription('The server check the status of')
      .setRequired(true)
      .addChoices(serverOptions.map(server => {
        return { name: server, value: server }
      }))
  ),
  async execute(interaction) {
    const server = interaction.options.getString('server');
    await interaction.reply(`Retrieving status of ${server} server...`);

    try {
      const response = await fetch(`${serverUrl}/${server}`);
      const data = await response.json();

      await interaction.followUp(`${server} server: ${data.status}`);
    } catch (error) {
      await interaction.followUp(`There was an error while retrieving the ${server} server status: ${error}`);
    }
  },
};
