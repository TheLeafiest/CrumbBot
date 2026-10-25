import type { AnyThreadChannel } from 'discord.js';
import type { GameRequestsForum, TagName } from './forum.js';
import { parseSubmitterId } from './posts.js';
import { nextTags, outcomeMessage, readTags, triageActions, triageRow, type OutcomeDetails, type TriageAction } from './triage.js';

// Shared by the bot and the gameTest sync, which both act on #game-ideas posts

export const voteEmoji = '👍';

export function tagId({ tagIds }: GameRequestsForum, name: TagName): string {
  const id = tagIds.get(name);

  // loadGameRequestsForum only succeeds when every tag exists, so this means a bug
  if (!id) {
    throw new Error(`Forum tag "${name}" is missing`);
  }

  return id;
}

/**
 * Every post in the forum. Quiet posts auto-archive, so archived posts (the latest 100) are
 * included
 */
export async function listPosts({ forum }: GameRequestsForum): Promise<AnyThreadChannel[]> {
  const [active, archived] = await Promise.all([
    forum.threads.fetchActive(),
    forum.threads.fetchArchived({ type: 'public', limit: 100 }),
  ]);

  return [...active.threads.values(), ...archived.threads.values()].filter(thread => thread.parentId === forum.id);
}

/**
 * Apply a decision: swap the status tag, tell the submitter in the thread, update the
 * buttons, and lock and archive decided posts
 */
export async function applyDecision(
  loaded: GameRequestsForum,
  thread: AnyThreadChannel,
  action: TriageAction,
  actorName: string,
  details: Pick<OutcomeDetails, 'reason' | 'originalThreadId' | 'originalBeadId' | 'byline'> = {},
): Promise<void> {
  const { to, closes } = triageActions[action];
  const starter = await thread.fetchStarterMessage().catch(() => null);
  const submitterId = starter ? parseSubmitterId(starter.content) : null;
  const { type } = readTags(thread.appliedTags, loaded.tagIds);

  // Archived or locked posts can't be changed, so open them first and close them again last
  if (thread.archived) {
    await thread.setArchived(false);
  }

  if (thread.locked && !closes) {
    await thread.setLocked(false);
  }

  await thread.setAppliedTags(nextTags(thread.appliedTags, loaded.tagIds, to));
  await thread.send({
    content: outcomeMessage(action, { submitterId, type, approverName: actorName, ...details }),
    // Ping the submitter only
    allowedMentions: { users: submitterId ? [submitterId] : [] },
  });

  // Posts made by hand have no bot-owned starter message to put buttons on
  if (starter?.editable) {
    await starter.edit({ components: [triageRow(to)] });
  }

  if (closes) {
    await thread.setLocked(true);
    await thread.setArchived(true);
  }
}
