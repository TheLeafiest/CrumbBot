import Discord from 'discord.js';

const client = new Discord.Client();

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', msg => {
  if (msg.content === 'ping') {
    msg.reply('pong');
  }
});

client.login('OTU1NjY1NDg3MDI1NTQxMTYw.Yjk-1w.reM-BaQHw0Lf8mZ3iuC6jq7jmQw');
