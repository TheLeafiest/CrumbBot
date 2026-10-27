import type { SubmissionType } from '../game-requests/posts.js';
import type { Status } from '../game-requests/triage.js';
import type { Bead } from './beads.js';
import { closeSha, duplicateOf, type ReleaseCheck } from './release.js';

export interface PostInfo {
  threadId: string;
  url: string;
  title: string;
  status: Status | null;
  type: SubmissionType;
}

export type SyncAction =
  | { kind: 'create-bead'; post: PostInfo }
  | { kind: 'ship-post'; post: PostInfo; bead: Bead; sha: string }
  | { kind: 'duplicate-post'; post: PostInfo; bead: Bead; originalBeadId: string }
  | { kind: 'close-bead'; post: PostInfo; bead: Bead; reason: string }
  // No change; reported so a dry run explains why nothing happened
  | { kind: 'waiting'; post: PostInfo; bead: Bead; sha: string }
  // Needs a person: reported, never acted on
  | { kind: 'attention'; post: PostInfo; bead: Bead; message: string };

const isOpen = (bead: Bead) => bead.status !== 'closed';

/**
 * What to do for each post, given gameTest's community beads (matched by the post URL in the
 * bead's external ref) and a way to ask whether a commit is in the current release
 */
export function planSync(posts: readonly PostInfo[], beads: readonly Bead[], isReleased: (sha: string) => ReleaseCheck): SyncAction[] {
  const beadByUrl = new Map(beads.flatMap(bead => (bead.external_ref ? [[bead.external_ref, bead] as const] : [])));
  const actions: SyncAction[] = [];

  for (const post of posts) {
    const bead = beadByUrl.get(post.url);

    if (post.status === 'Approved') {
      if (!bead) {
        actions.push({ kind: 'create-bead', post });
        continue;
      }

      if (isOpen(bead)) {
        continue;
      }

      const originalBeadId = duplicateOf(bead.close_reason);

      if (originalBeadId) {
        actions.push({ kind: 'duplicate-post', post, bead, originalBeadId });
        continue;
      }

      const sha = closeSha(bead.close_reason);

      if (!sha) {
        actions.push({ kind: 'attention', post, bead, message: `closed in gameTest without a commit ("${bead.close_reason ?? ''}"), so it can't be Shipped; decide in Discord` });
        continue;
      }

      const released = isReleased(sha);

      if (released === 'released') {
        actions.push({ kind: 'ship-post', post, bead, sha });
      } else if (released === 'not-yet') {
        actions.push({ kind: 'waiting', post, bead, sha });
      } else {
        actions.push({ kind: 'attention', post, bead, message: `closed in commit ${sha}, which the gameTest repo doesn't have` });
      }

      continue;
    }

    // Declined or marked duplicate in Discord after its bead was made
    if ((post.status === 'Declined' || post.status === 'Duplicate') && bead && isOpen(bead)) {
      const reason = post.status === 'Declined' ? 'Declined in Discord' : 'Marked as a duplicate in Discord';
      actions.push({ kind: 'close-bead', post, bead, reason: `${reason}: ${post.url}` });
    }
  }

  return actions;
}

/**
 * One line describing an action, for the sync's output
 */
export function describeAction(action: SyncAction): string {
  const post = `"${action.post.title}"`;

  switch (action.kind) {
    case 'create-bead':
      return `create a gameTest ${action.post.type === 'bug' ? 'bug' : 'feature'} for ${post}`;
    case 'ship-post':
      return `mark ${post} Shipped (${action.bead.id} closed in ${action.sha}, which is released)`;
    case 'duplicate-post':
      return `mark ${post} Duplicate (${action.bead.id} is a duplicate of ${action.originalBeadId})`;
    case 'close-bead':
      return `close ${action.bead.id} (${post} was ${action.post.status} in Discord)`;
    case 'waiting':
      return `wait: ${post} is fixed in ${action.sha} (${action.bead.id}) but not released yet`;
    case 'attention':
      return `NEEDS YOU: ${post} (${action.bead.id}) ${action.message}`;
  }
}

// A reply someone wrote in a post's thread before the bead was made
export interface ThreadReply {
  authorName: string;
  createdAt: Date;
  // User mentions already turned into names (see replaceUserMentions)
  content: string;
  attachmentCount: number;
  // Attachment links expire after about a day, so the bead links the message instead
  messageUrl: string;
}

/**
 * Turn <@id> mentions into @names; an id means nothing in gameTest
 */
export function replaceUserMentions(content: string, nameOf: (id: string) => string | undefined): string {
  return content.replace(/<@!?(\d+)>/g, (_mention, id: string) => `@${nameOf(id) ?? 'someone'}`);
}

// "2026-10-26 14:05 UTC": the sync runs in WSL, whose local time zone can't be relied on
const formatTime = (date: Date) => `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;

function formatReply({ authorName, createdAt, content, attachmentCount, messageUrl }: ThreadReply): string {
  const attachments = attachmentCount === 0
    ? []
    : [`(${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}: ${messageUrl})`];

  return [`${authorName}, ${formatTime(createdAt)}:`, content.trim(), ...attachments].filter(Boolean).join('\n');
}

/**
 * The bead description for a post: where it came from, the submitter's text without the
 * Discord mention, then any discussion in the thread before the bead was made. Later replies
 * aren't copied: the external ref links back to the thread
 */
export function beadDescription(postContent: string, url: string, replies: readonly ThreadReply[] = []): string {
  const body = postContent.replace(/^Submitted by <@!?\d+>\s*/, '').trim();
  const discussion = replies.length === 0
    ? ''
    : `\n\nDiscussion on Discord before approval:\n\n${replies.map(formatReply).join('\n\n')}`;

  return `From the #game-ideas forum on Discord: ${url}\n\n${body}${discussion}`;
}
