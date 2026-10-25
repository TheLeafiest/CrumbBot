import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Message } from 'discord.js';

/**
 * Reply with a random image from imagesDir to any message containing 'CRUMB ME'. Never
 * rejects: it runs as an event listener, where a rejection would crash the bot
 */
export async function handleCrumbMe(msg: Message, imagesDir: string): Promise<void> {
  // Ignore messages from bots
  if (msg.author.bot || !msg.content.includes('CRUMB ME') || !msg.channel.isSendable()) {
    return;
  }

  try {
    const images = readdirSync(imagesDir).filter(fileName => fileName.endsWith('.jpg'));
    // Randomly select image
    const image = images[Math.floor(Math.random() * images.length)];

    if (image) {
      await msg.channel.send({
        files: [{
          attachment: join(imagesDir, image),
          name: image,
        }],
      });
    } else {
      await msg.channel.send('No image found, sorry 😢');
    }
  } catch (error) {
    console.error('Failed to respond to CRUMB ME:', error);
  }
}
