import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { scheduledJobs, scheduleJob } from 'node-schedule';

const __dirname = resolve();
const {
  token,
  generalChannelId,
  chipCheckChannelId,
  // testChannelId,
} = JSON.parse(readFileSync(join(__dirname, 'config.json')));

const start = async () => {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent,
    ]
  });
  client.commands = new Collection();
  const images = readdirSync(join(__dirname, 'images')).filter(fileName => fileName.endsWith('.jpg'));
  let generalChannel = null;
  let chipCheckChannel = null;
  // let testChannel = null;
  const foldersPath = join(__dirname, 'commands');
  const commandFolders = readdirSync(foldersPath);
  const chipCheckReactions = [
    '<:Rounds:955271228833275944>',
    '<:Strips:1021193462743310428>',
    '<:Scoops:955271245706965032>',
  ];
  const birthdaysPath = join(__dirname, 'birthdays.json')
  const birthdayCommands = [
    'add-birthday',
    'remove-birthday',
  ];

  /**
   * Scheduling birthdays from birthdays.json
   */
  const scheduleBirthdays = async () => {
    try {
      let data = {};
      if (existsSync(birthdaysPath)) {
        data = JSON.parse(readFileSync(birthdaysPath, { encoding: 'utf8', flag: 'r' }));
      }
      
      // Schedule birthday messages for all users in birthdays.json
      Object.entries(data).forEach(([_, entry]) => {
        const { user, day, month } = entry;

        addBirthdayJob(user, day, month);
      });
    } catch (error) {
      console.error(error);
    }
    // console.log(schedule.scheduledJobs);
  };

  /**
   * Helper function to update and remove birthday jobs
   * 
   * @param {object} data 
   * @param {boolean} cancelJob 
   */
  const updateRemoveBirthdayJobs = (data, cancelJob = false) => {
    const { user, day, month } = data;
    if (user) {
      // Cancel the job if the user's birthday is removed or there is a pre-existing job for the user
      if (scheduledJobs[`birthday_${user.id}`]) {
        scheduledJobs[`birthday_${user.id}`].cancel();
      }

      if (!cancelJob) {
        addBirthdayJob(user, day, month);
      }
    }
  };

  /**
   * Helper function to add a birthday job
   * 
   * @param {object} user 
   * @param {number} day 
   * @param {number} month 
   */
  const addBirthdayJob = (user, day, month) => {
    scheduleJob(`birthday_${user.id}`, `00 00 8 ${day} ${month} *`, async () => {
      if (generalChannel) {
        await generalChannel.send(`Happy Birthday ${user.globalName}! :birthday:`);
      }
    });
    // console.log(`Birthday created for ${user.globalName}`);
  };

  
  client.on(Events.ClientReady, async readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);

    generalChannel = client.channels.cache.get(generalChannelId);
    chipCheckChannel = client.channels.cache.get(chipCheckChannelId);
    // testChannel = client.channels.cache.get(testChannelId);

    // Schedule "Chip Check!"
    if (chipCheckChannel) {
      /*
       * Handle "Chip Check"  
       * Run every Monday, Wednesday, and Friday at 3:00PM (local timezone)
       */
      scheduleJob('chip-check', '00 00 15 * * 1,3,5', async () => {
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
  
  // Handle sending an image for message that contains 'CRUMB ME'
  client.on(Events.MessageCreate, async msg => {
    // Ignore messages from bot
    if (msg.author.bot) return;

    // Check for command in all user messages
    if (msg.content.includes('CRUMB ME')) {
      // Randomly select image
      const result = Math.floor(Math.random() * images.length);

      if (images[result]) {
        await msg.channel.send({ files: [{
          attachment: join(__dirname, 'images', images[result]),
          name: images[result],
        }] });
      }
      else {
        await msg.channel.send('No image found, sorry 😢')
      }
    }
  });

  // Set commands within a collection on client
  for (const folder of commandFolders) {
    const commandsPath = join(foldersPath, folder);
    const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
      const filePath = join(commandsPath, file);
      const command = await import(filePath);
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
        let data = {};
        data.user = interaction.options.getUser('user');
        data.day = interaction.options.getNumber('day');
        data.month = interaction.options.getNumber('month');
  
        updateRemoveBirthdayJobs(data, cancelJob);
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
