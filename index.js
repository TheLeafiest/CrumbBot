const { Client } = require('discord.js');
const { token } = require('./config.json');

const start = async () => {
  const client = new Client({
    intents: ['GUILDS', 'GUILD_MESSAGES']
  });

  client.on('ready', () => {
    console.log('Ready!');

    const channel = client.channels.cache.find(ch => {
      return ch.type == 'GUILD_TEXT' && ch.name == 'chip-check'
    });

    if (channel) {
      // Run every minute
      setInterval(() => {
        const date = new Date();
        if (date.getHours() == 14 && date.getMinutes() == 00) {
          channel.send('Chip Check :Scoops: :Rounds:');
        }
      }, 60000)
    }
  });

  await client.login(token);
}

start();
