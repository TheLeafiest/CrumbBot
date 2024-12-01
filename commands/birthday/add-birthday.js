import { SlashCommandBuilder } from 'discord.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const __dirname = resolve();
const birthdaysPath = join(__dirname, 'birthdays.json');

export const data = new SlashCommandBuilder()
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
		.setRequired(true));
export async function execute(interaction) {
	const user = interaction.options.getUser('user');
	const day = interaction.options.getNumber('day');
	const month = interaction.options.getNumber('month');
	let data = {};

	if (existsSync(birthdaysPath)) {
		data = JSON.parse(readFileSync(birthdaysPath, { encoding: 'utf8', flag: 'r' }));
	}

	// Add/replace user's birthday with user id as the key
	data[user.id] = {
		user: {
			id: user.id,
			globalName: user.globalName,
		},
		day,
		month,
	};

	try {
		writeFileSync(birthdaysPath, JSON.stringify(data), { flag: 'w' });
		await interaction.reply(`Birthday added for ${user.globalName}!`);
	} catch (error) {
		await interaction.reply(`There was an error while adding the birthday for ${user.globalName}: ${error}`);
		console.log(error);
	}
}
