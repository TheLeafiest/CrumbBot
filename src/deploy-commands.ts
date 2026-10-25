import { REST, Routes } from 'discord.js';
import { createCommands } from './commands/index.js';
import { loadConfig } from './config.js';
import { createGameRequests } from './game-requests/index.js';

const config = loadConfig();
const { token, clientId, guildId } = config;
const gameRequests = config.gameRequests ? createGameRequests(config.gameRequests) : null;
const body = createCommands(config, gameRequests).map(command => command.data.toJSON());

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(token);

try {
  console.log(`Started refreshing ${body.length} application (/) commands.`);

  // Refresh commands in guild
  const data = await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body }) as unknown[];

  console.log(`Successfully reloaded ${data.length} application (/) commands.`);
} catch (error) {
  console.error(error);
  // Exit non-zero so start.sh can report that the bot is running with stale commands
  process.exitCode = 1;
}
