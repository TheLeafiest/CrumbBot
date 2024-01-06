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
  channelId,
  testChannelId,
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
  let chipCheckChannel = null;
  let testChannel = null;
  const maxPage = 20;
  const maxResult = 10;
  const foldersPath = path.join(__dirname, 'commands');
  const commandFolders = fs.readdirSync(foldersPath);
  const chipCheckReactions = [
    '<:Rounds:955271228833275944>',
    '<:Strips:1021193462743310428>',
    '<:Scoops:955271245706965032>',
  ];
  const birthdaysPath = path.join(__dirname, 'birthdays.json')
  const birthdayCommands = [
    'add-birthday',
    'remove-birthday',
  ];
  let images = [];

  /**
   * Helper function for scheduling birthdays
   *
   * @param {null | user{}} user 
   * @param {null | boolean} cancelJob 
   */
  const scheduleBirthdays = async (user = null, cancelJob = null) => {
    // Add/remove scheduled job
    if (user) {
      // Cancel the job if the user's birthday is removed or there is a pre-existing job for the user
      if (schedule.scheduledJobs[`birthday_${user.id}`]) {
        schedule.scheduledJobs[`birthday_${user.id}`].cancel();
      }

      if (!cancelJob) {
        schedule.scheduleJob(`birthday_${user.id}`, `00 37 18 5 1 *`, async () => {
          await testChannel.send(`Happy Birthday ${user.globalName}! :birthday:`);
        });
        // schedule.scheduleJob(`birthday_${user.id}`, `00 00 8 ${user.day} ${user.month} *`, async () => {
        //   await chipCheckChannel.send(`Happy Birthday ${user.globalName}! :birthday:`);
        // });
      }
    } else { // Initialize scheduled jobs for birthdays
      try {
        let data = {};
        if (fs.existsSync(birthdaysPath)) {
          data = JSON.parse(fs.readFileSync(birthdaysPath, { encoding: 'utf8', flag: 'r' }));
        }
        
        // Schedule birthday messages for all users in birthdays.json
        for (index in data) {
          const { user, day, month } = data[index];

          schedule.scheduleJob(`birthday_${user.id}`, `00 37 18 5 1 *`, async () => {
            await testChannel.send(`Happy Birthday ${user.globalName}! :birthday:`);
          });
          // schedule.scheduleJob(`birthday_${user.id}`, `00 00 8 ${day} ${month} *`, async () => {
          //   await chipCheckChannel.send(`Happy Birthday ${user.globalName}! :birthday:`);
          // });
        }
      } catch (error) {
        console.error(error);
      }
    }
    // console.log(schedule.scheduledJobs);
  };

  
  client.on(Events.ClientReady, async readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    // TODO store channel IDs in config.json
    chipCheckChannel = client.channels.cache.get(channelId);
    testChannel = client.channels.cache.get(testChannelId);

    // Schedule clearing images every half an hour
    schedule.scheduleJob('clear-images', '* /30 * * * *', () => {
      images = [];
    });

    // Schedule "Chip Check!"
    if (chipCheckChannel) {
      /*
       * Handle "Chip Check"  
       * Run every Monday, Wednesday, and Friday at 3:00PM (local timezone)
       */
      schedule.scheduleJob('chip-check', '00 00 15 * * 1,3,5', async () => {
        const message = await chipCheckChannel.send({
          content: 'Chip Check!',
          fetch: true,
        });

        chipCheckReactions.forEach(async reaction => {
          await message.react(reaction);
        });
      });
    }

    // Schedule birthday message jobs
    await scheduleBirthdays();
  });
  
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

      // Add/remove scheduled birthday jobs
      if (birthdayCommands.includes(interaction.commandName)) {
        const cancelJob = interaction.commandName === birthdayCommands[1];
        let user = interaction.options.getUser('user');
        user.day = interaction.options.getNumber('day');
        user.month = interaction.options.getNumber('month');
  
        await scheduleBirthdays(user, cancelJob);
      }
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
