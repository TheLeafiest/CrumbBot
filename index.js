// Require the necessary discord.js classes
const { Client, Intents } = require('discord.js');
const { token } = require('./config.json');

const start = async () => {
  const client = new Client({ intents: [Intents.FLAGS.GUILDS] });

  await client.login(token);
}

start();
