import { SlashCommandBuilder } from 'discord.js';
import { cancelBirthday, readBirthdays, writeBirthdays } from '../birthdays.js';
import type { Command } from './types.js';

export const removeBirthday: Command = {
  data: new SlashCommandBuilder()
    .setName('remove-birthday')
    .setDescription('Remove birthday from birthdays.json')
    .addUserOption(option => option.setName('user')
      .setDescription('The user to remove the birthday for')
      .setRequired(true)),

  async execute(interaction) {
    const user = interaction.options.getUser('user', true);

    try {
      // Delete key that has been set as the user id
      const data = readBirthdays();
      delete data[user.id];
      writeBirthdays(data);
    } catch (error) {
      console.error(error);
      await interaction.reply(`There was an error while removing the birthday for ${user.globalName}: ${error}`);
      return;
    }

    cancelBirthday(user.id);
    await interaction.reply(`Birthday removed for ${user.globalName}.`);
  },
};
