const {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
} = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const schedule = require('node-schedule');
const GoogleImages = require('google-images');
const {
  token,
  searchEngineId,
  searchEngineApi,
} = require('./config.json');

const start = async () => {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
    ]
  });
  client.commands = new Collection();
  const imageClient = new GoogleImages(searchEngineId, searchEngineApi);
  const maxPage = 20;
  const maxResult = 10;
  const foldersPath = path.join(__dirname, 'commands');
  const commandFolders = fs.readdirSync(foldersPath);
  const chipCheckReactions = [
    '<:Rounds:955271228833275944>',
    '<:Strips:1021193462743310428>',
    '<:Scoops:955271245706965032>',
  ];
  let images = [];

  client.on(Events.ClientReady, readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    // Clear images every half an hour
    schedule.scheduleJob('* /30 * * * *', () => {
      images = [];
    });

    //const testChannel = client.channels.cache.find(ch => ch.type == 'GUILD_TEXT' && ch.name == 'bot-test')
    const chipCheckChannel = client.channels.cache.find(ch => ch.type == 'GUILD_TEXT' && ch.name == 'chip-check');

    if (chipCheckChannel) {
      /*
       * Handle "Chip Check"  
       * Run every Monday, Wednesday, and Friday at 3:00PM (local timezone)
       */
      schedule.scheduleJob('00 00 15 * * 1,3,5', async () => {
        const message = await chipCheckChannel.send({
          content: 'Chip Check!',
          fetch: true,
        });

        chipCheckReactions.forEach(async reaction => {
          await message.react(reaction);
        });
      });
    }
  });

  // Set commands within a collection on client
  for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const command = require(filePath);
      // Set a new item in the Collection with the key as the command name and the value as the exported module
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
      } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
      }
    }
  }
  
  // Handle sending image for message that contains 'CRUMB ME'
  client.on(Events.MessageCreate, async msg => {
    // Ignore messages from bot
    if (msg.author.bot) return;

    // Check for command in all user messages
    if (msg.content.includes('CRUMB ME')) {
      // Minimum value of page is 1
      const page = Math.floor(Math.random() * maxPage + 1);
      // Minimum value of result is 0
      const result = Math.floor(Math.random() * maxResult);

      // Images have been cleared; refresh images
      if (!images.length) {
        images = await imageClient.search('crumbs', { page });
      }

      if (images[result].url) {
        await msg.channel.send(images[result].url);
      }
      else {
        await msg.channel.send('No image found, sorry 😢')
      }
    }
  });
  
  // Handle slash commands
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
  
    const command = interaction.client.commands.get(interaction.commandName);
  
    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }
  
    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
      } else {
        await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
      }
    }
  });

  await client.login(token);
}

start();
