import type { ReleaseCheck } from './release.js';
import {
  describeReleaseAction,
  parseReleaseNotes,
  planReleaseNotes,
  releaseTagName,
  releaseTitle,
  seedPosted,
  type ReleaseEntry,
} from './release-notes.js';

// Everything the release-notes step touches, passed in so it can be tested without Discord
export interface ReleaseNotesSync {
  // RELEASE_NOTES.md on gameTest main, or null when there is none
  markdown: string | null;
  isReleased: (sha: string) => ReleaseCheck;
  readPosted: () => Set<string> | null;
  writePosted: (posted: ReadonlySet<string>) => void;
  // The forum's Release tag, or null when Kale hasn't added it
  releaseTagId: string | null;
  forumName: string;
  // Whether the bot already has a post with this title (the fallback if the state file is lost)
  hasBotPost: (title: string) => boolean;
  post: (entry: ReleaseEntry, releaseTagId: string) => Promise<void>;
  dryRun: boolean;
  log: (line: string) => void;
  logError: (line: string, error: unknown) => void;
}

/**
 * Post gameTest's new release notes once their build is released. Returns the number of failures;
 * a failed entry stays unposted, so the next run tries it again
 */
export async function syncReleaseNotes(sync: ReleaseNotesSync): Promise<number> {
  const { markdown, log } = sync;

  if (markdown === null) {
    log('Release notes: no RELEASE_NOTES.md on gameTest main');
    return 0;
  }

  const entries = parseReleaseNotes(markdown);
  const saved = sync.readPosted();
  const posted = saved ?? seedPosted(entries);
  const actions = planReleaseNotes(entries, posted, sync.isReleased);
  const toPost = actions.filter(action => action.kind === 'post-release');

  log(`Release notes: ${entries.length} entries; ${actions.length === 0 ? 'nothing to post' : `${actions.length} item(s):`}`);

  for (const action of actions.filter(action => action.kind !== 'post-release')) {
    log(`  ${describeReleaseAction(action)}`);
  }

  if (toPost.length === 0) {
    return 0;
  }

  if (!sync.releaseTagId) {
    log(`  NEEDS YOU: add a "${releaseTagName}" tag to #${sync.forumName}; ${toPost.length} release note(s) are waiting for it`);
    return 0;
  }

  if (sync.dryRun) {
    toPost.forEach(action => log(`  would ${describeReleaseAction(action)}`));
    return 0;
  }

  // Record the first run's starting point before posting. Otherwise, if the first post fails and
  // a newer entry lands before the next run, seeding again would count the failed one as posted
  if (!saved) {
    sync.writePosted(posted);
  }

  let failures = 0;

  for (const action of toPost) {
    const { entry } = action;
    const line = describeReleaseAction(action);

    try {
      // Already posted but not recorded (e.g. the state file was lost): record it, don't repost
      const existing = sync.hasBotPost(releaseTitle(entry));

      if (!existing) {
        await sync.post(entry, sync.releaseTagId);
      }

      // Saved after each post, so a crash part-way through never posts one twice
      posted.add(entry.heading);
      sync.writePosted(posted);
      log(`  ${existing ? 'already posted, recorded' : 'done'}: ${line}`);
    } catch (error) {
      failures++;
      sync.logError(`  FAILED: ${line}:`, error);
    }
  }

  return failures;
}
