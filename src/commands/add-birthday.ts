import { SlashCommandBuilder } from 'discord.js';
import { isValidBirthday, readBirthdays, scheduleBirthday, writeBirthdays, type BirthdayEntry } from '../birthdays.js';
import type { Command } from './types.js';

export const addBirthday: Command = {
  data: new SlashCommandBuilder()
    .setName('add-birthday')
    .setDescription('Add birthday to birthdays.json')
    .addUserOption(option => option.setName('user')
      .setDescription('The user to set a birthday for')
      .setRequired(true))
    .addIntegerOption(option => option.setName('month')
      .setDescription('Month of the user\'s birthday (1-12)')
      .setMinValue(1)
      .setMaxValue(12)
      .setRequired(true))
    .addIntegerOption(option => option.setName('day')
      .setDescription('Day of the user\'s birthday (1-31)')
      .setMinValue(1)
      .setMaxValue(31)
      .setRequired(true)),

  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const day = interaction.options.getInteger('day', true);
    const month = interaction.options.getInteger('month', true);

    // Discord enforces the ranges above; this catches dates like Feb 30 or Apr 31
    if (!isValidBirthday(day, month)) {
      await interaction.reply(`${month}/${day} isn't a real date, so no birthday was added for ${user.displayName}.`);
      return;
    }

    const entry: BirthdayEntry = {
      user: {
        id: user.id,
        globalName: user.globalName,
      },
      day,
      month,
    };

    try {
      // Add/replace user's birthday with user id as the key
      const data = readBirthdays();
      data[user.id] = entry;
      writeBirthdays(data);
    } catch (error) {
      console.error(error);
      await interaction.reply(`There was an error while adding the birthday for ${user.displayName}: ${error}`);
      return;
    }

    // Only schedule once the birthday is saved, so the job and the file agree
    scheduleBirthday(entry);
    await interaction.reply(`Birthday added for ${user.displayName}!`);
  },
};
