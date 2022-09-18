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

  client.on('ready', () => {
    console.log('Ready!');

    const channel = client.channels.cache.find(ch => {
      return ch.type == 'GUILD_TEXT' && ch.name == 'chip-check';
    });

    if (channel) {
      // Run every day at 2:00PM (local timezone)
      schedule.scheduleJob('00 00 14 * * 0-6', async function() {
        const message = await channel.send({ content: 'Chip Check', fetch: true });
        message.react('<:Rounds:955271228833275944>');
        message.react('<:Scoops:955271245706965032>');
      });
    }
  });

  await client.login(token);
}

start();
