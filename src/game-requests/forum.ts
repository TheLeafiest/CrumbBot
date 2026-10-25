import { ChannelType, PermissionFlagsBits, type Client, type ForumChannel } from 'discord.js';
import type { GameRequestsConfig } from '../config.js';

// Forum tags Kale creates by hand on the #game-ideas channel; matched by name, ignoring case
export const typeTags = {
  idea: 'Idea',
  bug: 'Bug',
} as const;

export const statusTags = {
  new: 'New',
  approved: 'Approved',
  declined: 'Declined',
  duplicate: 'Duplicate',
  shipped: 'Shipped',
} as const;

export type TagName = (typeof typeTags)[keyof typeof typeTags] | (typeof statusTags)[keyof typeof statusTags];

const requiredTags: TagName[] = [...Object.values(typeTags), ...Object.values(statusTags)];

// What the bot needs in the forum: create posts, talk in their threads, react, and lock decided posts
export const requiredPermissions = {
  'View Channel': PermissionFlagsBits.ViewChannel,
  'Send Messages (Create Posts)': PermissionFlagsBits.SendMessages,
  'Send Messages in Threads': PermissionFlagsBits.SendMessagesInThreads,
  'Manage Threads': PermissionFlagsBits.ManageThreads,
  'Add Reactions': PermissionFlagsBits.AddReactions,
  'Read Message History': PermissionFlagsBits.ReadMessageHistory,
  'Embed Links': PermissionFlagsBits.EmbedLinks,
} as const;

export interface GameRequestsForum {
  forum: ForumChannel;
  tagIds: Map<TagName, string>;
}

/**
 * Map each required tag name to the forum's tag id, and list any that are missing
 */
export function resolveTags(available: readonly { id: string; name: string }[]) {
  const tagIds = new Map<TagName, string>();
  const missing: TagName[] = [];

  for (const name of requiredTags) {
    const tag = available.find(candidate => candidate.name.trim().toLowerCase() === name.toLowerCase());

    if (tag) {
      tagIds.set(name, tag.id);
    } else {
      missing.push(name);
    }
  }

  return { tagIds, missing };
}

/**
 * Names of the required permissions that the given check reports as missing
 */
export function missingPermissions(has: (permission: bigint) => boolean): string[] {
  return Object.entries(requiredPermissions)
    .filter(([, permission]) => !has(permission))
    .map(([name]) => name);
}

/**
 * Find and verify the #game-ideas forum. Logs every setup problem and returns null when the
 * feature can't run, so a half-configured forum turns the feature off instead of failing later
 */
export async function loadGameRequestsForum(client: Client<true>, config: GameRequestsConfig): Promise<GameRequestsForum | null> {
  const problems: string[] = [];
  const channel = await client.channels.fetch(config.forumChannelId).catch(() => null);

  if (!channel || channel.type !== ChannelType.GuildForum) {
    console.error(`Game requests are OFF: channel ${config.forumChannelId} is not a forum channel the bot can see (check gameRequests.forumChannelId)`);
    return null;
  }

  const { tagIds, missing } = resolveTags(channel.availableTags);
  if (missing.length > 0) {
    problems.push(`missing forum tags: ${missing.join(', ')}`);
  }

  const permissions = channel.permissionsFor(client.user);
  const missingPerms = missingPermissions(permission => permissions?.has(permission) ?? false);
  if (missingPerms.length > 0) {
    problems.push(`bot is missing permissions in #${channel.name}: ${missingPerms.join(', ')}`);
  }

  if (!channel.guild.roles.cache.has(config.approverRoleId)) {
    problems.push(`approver role ${config.approverRoleId} does not exist (check gameRequests.approverRoleId)`);
  }

  if (problems.length > 0) {
    console.error(`Game requests are OFF:\n  - ${problems.join('\n  - ')}`);
    return null;
  }

  console.log(`Game requests: ready in #${channel.name}`);
  return { forum: channel, tagIds };
}
