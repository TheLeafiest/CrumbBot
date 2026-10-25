interface ReactableMessage {
  react(emoji: string): Promise<unknown>;
}

interface ChipCheckChannel {
  send(options: { content: string }): Promise<ReactableMessage>;
}

/**
 * Post the check-in message and add the reactions one at a time, so they keep their order and
 * one unavailable emoji doesn't stop the rest. Never rejects: it runs from a scheduled job,
 * where a rejection would be unhandled
 */
export async function postChipCheck(channel: ChipCheckChannel, { message: content, reactions }: { message: string; reactions: readonly string[] }): Promise<void> {
  let message: ReactableMessage;

  try {
    message = await channel.send({ content });
  } catch (error) {
    console.error('Failed to post Chip Check:', error);
    return;
  }

  for (const reaction of reactions) {
    try {
      await message.react(reaction);
    } catch (error) {
      console.error(`Failed to add Chip Check reaction ${reaction}:`, error);
    }
  }
}
