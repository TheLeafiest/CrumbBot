const { Client } = require('discord.js');
const {
  token,
  searchEngineId,
  searchEngineApi,
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
  let images = [];

  // Handle "Chip Check"  
  client.on('ready', () => {
    console.log('Ready!');

    const channel = client.channels.cache.find(ch => {
      return ch.type == 'GUILD_TEXT' && ch.name == 'chip-check';
    });

    // Clear images every half an hour
    schedule.scheduleJob('* /30 * * * *', function() {
      images = [];
    });

    // Verify channel exists
    if (channel) {
      // Run every Monday, Wednesday, and Friday at 3:00PM (local timezone)
      schedule.scheduleJob('00 00 15 * * 1,3,5', async function() {
        const message = await channel.send({
          content: 'Chip Check!',
          fetch: true,
        });

        await message.react('<:Rounds:955271228833275944>');
        await message.react('<:Strips:1021193462743310428>');
        await message.react('<:Scoops:955271245706965032>');
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
