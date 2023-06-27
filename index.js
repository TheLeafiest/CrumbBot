const { Client } = require('discord.js');
const {
  token,
  searchEngineId,
  searchEngineApi,
  // birthdays,
} = require('./config.json');
const schedule = require('node-schedule');
const GoogleImages = require('google-images');

const start = async () => {
  const client = new Client({
    intents: [
      'GUILDS',
      'GUILD_MESSAGES',
      'GUILD_MESSAGE_REACTIONS',
    ]
  });
  const imageClient = new GoogleImages(searchEngineId, searchEngineApi);
  const maxPage = 20;
  const maxResult = 10;
  const chipCheckReactions = [
    '<:Rounds:955271228833275944>',
    '<:Strips:1021193462743310428>',
    '<:Scoops:955271245706965032>',
  ];
  let images = [];

  client.on('ready', () => {
    console.log('Ready!');

    // const testChannel = client.channels.cache.find(ch => ch.type == 'GUILD_TEXT' && ch.name == 'bot-test')
    const chipCheckChannel = client.channels.cache.find(ch => ch.type == 'GUILD_TEXT' && ch.name == 'chip-check');

    // Clear images every half an hour
    schedule.scheduleJob('* /30 * * * *', () => {
      images = [];
    });

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
  
  // Handle commands
  client.on('messageCreate', async msg => {
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

  await client.login(token);
}

start();
