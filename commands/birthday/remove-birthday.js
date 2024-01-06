const { SlashCommandBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const birthdaysPath = path.join(__dirname, '..', '..', 'birthdays.json');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('remove-birthday')
		.setDescription('Remove birthday from birthdays.json')
		.addUserOption(option =>
			option.setName('user')
				.setDescription('The user to set a birthday for')
				.setRequired(true)),
	async execute(interaction) {
		const user = interaction.options.getUser('user');
		let data = {};

		if (fs.existsSync(birthdaysPath)) {
			data = JSON.parse(fs.readFileSync(birthdaysPath, { encoding: 'utf8', flag: 'r' }));
		}
		// Delete key that has been set as the user id
		delete data[user.id];

		try {
			fs.writeFileSync(birthdaysPath, JSON.stringify(data), { flag: 'w' });
			await interaction.reply(`Birthday removed for ${user.globalName}.`);
		} catch (error) {
			console.error(error);
		}
	},
};
