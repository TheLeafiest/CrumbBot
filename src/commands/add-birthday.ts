import { SlashCommandBuilder } from 'discord.js';
import { readBirthdays, scheduleBirthday, writeBirthdays, type BirthdayEntry } from '../birthdays.js';
import type { Command } from './types.js';

export const addBirthday: Command = {
  data: new SlashCommandBuilder()
    .setName('add-birthday')
    .setDescription('Add birthday to birthdays.json')
    .addUserOption(option => option.setName('user')
      .setDescription('The user to set a birthday for')
      .setRequired(true))
    .addNumberOption(option => option.setName('month')
      .setDescription('Month of the user\'s birthday')
      .setRequired(true))
    .addNumberOption(option => option.setName('day')
      .setDescription('Day of the user\'s birthday')
      .setRequired(true)),

  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const entry: BirthdayEntry = {
      user: {
        id: user.id,
        globalName: user.globalName,
      },
      day: interaction.options.getNumber('day', true),
      month: interaction.options.getNumber('month', true),
    };

    try {
      // Add/replace user's birthday with user id as the key
      const data = readBirthdays();
      data[user.id] = entry;
      writeBirthdays(data);
    } catch (error) {
      console.error(error);
      await interaction.reply(`There was an error while adding the birthday for ${user.globalName}: ${error}`);
      return;
    }

    // Only schedule once the birthday is saved, so the job and the file agree
    scheduleBirthday(entry);
    await interaction.reply(`Birthday added for ${user.globalName}!`);
  },
};
