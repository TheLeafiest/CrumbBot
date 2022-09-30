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
  let images = [];

  // Handle "Chip Check"  
  client.on('ready', () => {
    console.log('Ready!');

    const channel = client.channels.cache.find(ch => {
      return ch.type == 'GUILD_TEXT' && ch.name == 'chip-check';
    });

    // Clear images every hour
    schedule.scheduleJob('00 00 * * * *', function() {
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

    if (msg.content.includes('CRUMB ME')) {
      const maxPage = 20;
      const maxResults = 10;
      const page = Math.floor(Math.random() * maxPage);
      let result = Math.floor(Math.random() * maxResults);
      let count = 1;

      if (!images.length) {
        console.log('images refreshed');
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
