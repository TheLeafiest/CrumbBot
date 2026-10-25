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

/**
 * The bead description for a post: where it came from, then the submitter's text without the
 * Discord mention (an id means nothing in gameTest)
 */
export function beadDescription(postContent: string, url: string): string {
  const body = postContent.replace(/^Submitted by <@!?\d+>\s*/, '').trim();

  return `From the #game-ideas forum on Discord: ${url}\n\n${body}`;
}
