import { SlashCommandBuilder } from 'discord.js';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const __dirname = resolve();
const { serverOptions, serverUrl } = JSON.parse(readFileSync(join(__dirname, 'config.json')));
// Can use serverOptions if this needs to be expanded to more games
const server = 'Minecraft';

export const data = new SlashCommandBuilder()
  .setName('server-whitelist')
  .setDescription('List, add, or remove a users from the whitelist')
  .addStringOption(option => option.setName('command')
    .setDescription('The command to run')
    .setRequired(true)
    .addChoices(...[
      { name: 'add', value: 'add' },
      { name: 'remove', value: 'remove' },
      { name: 'list', value: 'list' },
    ])
  )
  .addStringOption(option => option.setName('username')
    .setDescription('The username to add or remove')
    .setRequired(false)
  );

export async function execute(interaction) {
  const command = interaction.options.getString('command');
  const username = interaction.options.getString('username');
  let commandResult = {
    action: null,
    response: null,
  };

  try {
    if (!serverOptions.includes(server)) {
      throw new Error(`Unknown server: ${server}`);
    }

    switch (command) {
      case 'add':
        commandResult.action = `Adding ${username} to`;
        commandResult.response = `added ${username} to`;
        break;
      case 'remove':
        commandResult.action = `Removing ${username} from`;
        commandResult.response = `removed ${username} from`;
        break;
      case 'list':
        commandResult.action = `Listing players in`;
        commandResult.response = null;
        break;
      default:
        commandResult.action = null;
        commandResult.response = null;
        break;
    }

    if (!commandResult.action) {
      throw new Error(`Unknown action: ${command}`);
    }

    await interaction.reply(`${commandResult.action} whitelist...`);

    // Check if the username is required for the command
    if (command !== 'list' && !username) {
      throw new Error(`The 'username' field is required when the command is '${command}'.`);
    }

    const commandString = command === 'list' ? `${command}` : `${command} ${username}`;
    const execCommandConsole = `/serverdata/serverfiles/execute_command.sh ${server} ${commandString}`;

    const response = await fetch(`${serverUrl}/${server}/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        command: execCommandConsole,
      }),
    });

    if (response.status !== 200) {
      throw new Error(`Server responded with status code ${response.status}`);
    }

    if (command === 'list') {
      const execCommandLog = 'tail -n 1 /serverdata/serverfiles/logs/latest.log';

      const resLog = await fetch(`${serverUrl}/${server}/exec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command: execCommandLog,
        }),
      });

      const jsonResLog = await resLog.json();
      await interaction.followUp(jsonResLog.result);
      return;
    } else {
      await interaction.followUp(`Successfully ${commandResult.response} whitelist`);
    }
  } catch (error) {
    await interaction.followUp(`There was an error sending the whitelist command (${command}) to the ${server} server: ${error}`);
    console.log(error);
  }
}
