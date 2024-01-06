const { SlashCommandBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const birthdaysPath = path.join(__dirname, '..', '..', 'birthdays.json');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('add-birthday')
		.setDescription('Add birthday to birthdays.json')
		.addUserOption(option =>
			option.setName('user')
				.setDescription('The user to set a birthday for')
				.setRequired(true))
		.addNumberOption(option =>
			option.setName('month')
				.setDescription('Month of the user\'s birthday')
				.setRequired(true))
		.addNumberOption(option =>
			option.setName('day')
				.setDescription('Day of the user\'s birthday')
				.setRequired(true)),
	async execute(interaction) {
		const user = interaction.options.getUser('user');
		const day = interaction.options.getNumber('day');
		const month = interaction.options.getNumber('month');
		let data = {};

		if (fs.existsSync(birthdaysPath)) {
			data = JSON.parse(fs.readFileSync(birthdaysPath, { encoding: 'utf8', flag: 'r' }));
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
			fs.writeFileSync(birthdaysPath, JSON.stringify(data), { flag: 'w' });
			await interaction.reply(`Birthday added for ${user.globalName}!`);
		} catch (error) {
			console.error(error);
		}
	},
};
