import type { ChatInputCommandInteraction } from 'discord.js';

// Long enough for a game server to start; short enough that a hung API gets an answer
export const serverApiTimeoutMs = 30_000;

/**
 * fetch() against the game-server control API, giving up after serverApiTimeoutMs
 */
export function serverFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(serverApiTimeoutMs) });
}

/**
 * A readable reason for a failed server call
 */
export function describeError(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') {
    return `the server didn't respond within ${serverApiTimeoutMs / 1000} seconds`;
  }

  return String(error);
}

/**
 * Reply, or follow up if the command has already replied, so error messages always land
 */
export async function respond(interaction: ChatInputCommandInteraction, content: string): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(content);
  } else {
    await interaction.reply(content);
  }
}
