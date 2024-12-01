import { SlashCommandBuilder } from 'discord.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const __dirname = resolve();
const birthdaysPath = join(__dirname, 'birthdays.json');

export const data = new SlashCommandBuilder()
	.setName('remove-birthday')
	.setDescription('Remove birthday from birthdays.json')
	.addUserOption(option => option.setName('user')
		.setDescription('The user to set a birthday for')
		.setRequired(true));
export async function execute(interaction) {
	const user = interaction.options.getUser('user');
	let data = {};

	if (existsSync(birthdaysPath)) {
		data = JSON.parse(readFileSync(birthdaysPath, { encoding: 'utf8', flag: 'r' }));
	}

	// Delete key that has been set as the user id
	delete data[user.id];

	try {
		writeFileSync(birthdaysPath, JSON.stringify(data), { flag: 'w' });
		await interaction.reply(`Birthday removed for ${user.globalName}.`);
	} catch (error) {
		await interaction.reply(`There was an error while removing the birthday for ${user.globalName}: ${error}`);
		console.log(error);
	}
}
