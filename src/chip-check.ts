export const chipCheckReactions = [
  '<:Rounds:955271228833275944>',
  '<:Strips:1021193462743310428>',
  '<:Scoops:955271245706965032>',
];

interface ReactableMessage {
  react(emoji: string): Promise<unknown>;
}

interface ChipCheckChannel {
  send(options: { content: string }): Promise<ReactableMessage>;
}

/**
 * Post "Chip Check!" and add the reactions one at a time, so they keep their order and one
 * unavailable emoji doesn't stop the rest. Never rejects: it runs from a scheduled job, where
 * a rejection would be unhandled
 */
export async function postChipCheck(channel: ChipCheckChannel): Promise<void> {
  let message: ReactableMessage;

  try {
    message = await channel.send({ content: 'Chip Check!' });
  } catch (error) {
    console.error('Failed to post Chip Check:', error);
    return;
  }

  for (const reaction of chipCheckReactions) {
    try {
      await message.react(reaction);
    } catch (error) {
      console.error(`Failed to add Chip Check reaction ${reaction}:`, error);
    }
  }
}
