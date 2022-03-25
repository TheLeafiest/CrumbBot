const { Client } = require('discord.js');
const { token } = require('./config.json');

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
      // Run every minute
      setInterval(async () => {
        const date = new Date();
        if (date.getHours() == 14 && date.getMinutes() == 00) {
          const message = await channel.send({ content: 'Chip Check', fetch: true });
          message.react('<:Rounds:955271228833275944>');
          message.react('<:Scoops:955271245706965032>');
        }
      }, 60000)
    }
  });

  await client.login(token);
}

start();
