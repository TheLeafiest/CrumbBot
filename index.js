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
        const message = await channel.send({
          content: `Chip Check!\n
            <:heart:> = I'm doing really great!\n
            <:orange_heart:> = I'm doing pretty good.\n
            <:yellow_heart:> = I'm doing okay, I guess.\n
            <:green_heart:> = I'm starting to struggle.\n
            <:blue_heart:> = I'm having a really hard time.\n
            <:purple_heart:> = I need to reach out for support.\n
            <:face_vomiting:> = I'm sick boys.`,
          fetch: true,
        });
        message.react('<:heart:>');
        message.react('<:orange_heart:>');
        message.react('<:yellow_heart:>');
        message.react('<:green_heart:>');
        message.react('<:blue_heart:>');
        message.react('<:purple_heart:>');
        message.react('<:face_vomiting:>');
      });
    }
  });

  await client.login(token);
}

start();
