const { Client } = require('discord.js');
const { token } = require('./config.json');
const schedule = require('node-schedule');

const start = async () => {
  const client = new Client({
    intents: [
      'GUILDS',
      'GUILD_MESSAGES',
      'GUILD_MESSAGE_REACTIONS',
    ]
  });

  // Handle "Chip Check"  
  client.on('ready', () => {
    console.log('Ready!');

    const channel = client.channels.cache.find(ch => {
      return ch.type == 'GUILD_TEXT' && ch.name == 'chip-check';
    });

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
  
  client.on('message', async msg => {
    // Ignore messages from bot
    if (msg.author.bot) return;

    if (msg.content.includes('CRUMB ME')) {
      await msg.channel.send('test');
    }
  });

  await client.login(token);
}

start();
