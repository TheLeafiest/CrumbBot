import { join } from 'node:path';
import { Client, Events, GatewayIntentBits, MessageFlags, type Channel } from 'discord.js';
import { scheduleJob } from 'node-schedule';
import { startBirthdays } from './birthdays.js';
import { postChipCheck } from './chip-check.js';
import { createCommands } from './commands/index.js';
import { dataDir, loadConfig } from './config.js';
import { handleCrumbMe } from './crumb-me.js';

// Backstop for anything the handlers below miss: Node exits on an unhandled rejection by
// default, which would take the whole bot offline over one failed message
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

const config = loadConfig();
const commands = new Map(createCommands(config).map(command => [command.data.name, command]));
const imagesDir = join(dataDir, 'images');

const sendable = (channel: Channel | undefined) => (channel?.isSendable() ? channel : null);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, readyClient => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);

  const generalChannel = sendable(client.channels.cache.get(config.generalChannelId));
  const chipCheckChannel = sendable(client.channels.cache.get(config.chipCheckChannelId));

  if (chipCheckChannel) {
    /*
     * Handle "Chip Check"
     * Run every Monday, Wednesday, and Friday at 3:00PM (container timezone)
     */
    scheduleJob('chip-check', '00 00 15 * * 1,3,5', () => postChipCheck(chipCheckChannel));
  }

  // Schedule birthday message jobs
  startBirthdays(generalChannel);
});

// Handle sending an image for message that contains 'CRUMB ME'
client.on(Events.MessageCreate, msg => handleCrumbMe(msg, imagesDir));

// Handle slash commands
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);

    const content = 'There was an error while executing this command!';

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      }
    } catch (replyError) {
      console.error('Failed to report the command error:', replyError);
    }
  }
});

// An 'error' event with no listener throws, which would exit the process
client.on(Events.Error, error => {
  console.error('Discord client error:', error);
});

await client.login(config.token);
