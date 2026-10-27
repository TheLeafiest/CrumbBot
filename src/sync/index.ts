import { closeSync, mkdirSync, openSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { Client, Events, GatewayIntentBits, type AnyThreadChannel, type Message } from 'discord.js';
import { applyDecision, listPosts } from '../game-requests/actions.js';
import { loadGameRequestsForum, type GameRequestsForum } from '../game-requests/forum.js';
import { readTags } from '../game-requests/triage.js';
import { createBeads, type Beads } from './beads.js';
import { loadSyncConfig } from './config.js';
import { beadDescription, describeAction, planSync, replaceUserMentions, type PostInfo, type SyncAction, type ThreadReply } from './plan.js';
import {
  describeReleaseAction,
  parseReleaseNotes,
  planReleaseNotes,
  readPosted,
  readReleaseNotes,
  releaseMessages,
  releaseTagName,
  releaseTitle,
  seedPosted,
  writePosted,
  type ReleaseEntry,
} from './release-notes.js';
import { checkReleased, readReleaseSha } from './release.js';

/*
 * Sync #game-ideas with gameTest's beads. Runs on Kale's PC, where gameTest's database, repo
 * and release manifest live: hourly from a systemd timer, or by hand with
 * `npm run sync-gametest` (add `-- --dry-run` to only show what it would do)
 */

const dryRun = process.argv.includes('--dry-run');
const lockPath = join(homedir(), '.cache', 'crumbbot-sync.lock');
// A lock older than this is from a run that crashed
const staleLockMs = 15 * 60 * 1000;

/**
 * Stop a timer run and a manual run from both creating the same bead
 */
function takeLock(): boolean {
  // Otherwise a missing folder would look like a held lock
  mkdirSync(dirname(lockPath), { recursive: true });

  try {
    if (Date.now() - statSync(lockPath).mtimeMs > staleLockMs) {
      rmSync(lockPath, { force: true });
    }
  } catch {
    // No lock file
  }

  try {
    closeSync(openSync(lockPath, 'wx'));
    return true;
  } catch {
    return false;
  }
}

// Pages of 100 messages; a thread longer than this before approval would be unusual
const maxReplyPages = 10;

/**
 * Every reply a person wrote in the thread, oldest first. The post itself, the bot's notes and
 * system messages (pins, renames) are left out
 */
async function fetchReplies(thread: AnyThreadChannel): Promise<ThreadReply[]> {
  const messages: Message[] = [];
  let before: string | undefined;

  for (let page = 0; page < maxReplyPages; page++) {
    const batch = await thread.messages.fetch({ limit: 100, before });
    messages.push(...batch.values());

    if (batch.size < 100) {
      break;
    }

    // Each page is newest first, so the last message is the oldest
    before = batch.last()?.id;
  }

  return messages
    .filter(message => message.id !== thread.id && !message.author.bot && !message.system)
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map(message => ({
      authorName: message.author.displayName,
      createdAt: message.createdAt,
      content: replaceUserMentions(message.content, id => message.mentions.users.get(id)?.displayName),
      attachmentCount: message.attachments.size,
      messageUrl: message.url,
    }));
}

/**
 * A quiet note in a post's thread. Approved posts auto-archive when idle, and Discord refuses
 * messages in archived threads
 */
async function postNote(thread: AnyThreadChannel, content: string): Promise<void> {
  if (thread.archived) {
    await thread.setArchived(false);
  }

  await thread.send({ content, allowedMentions: { parse: [] } });
}

async function execute(action: SyncAction, thread: AnyThreadChannel, loaded: GameRequestsForum, beads: Beads, releaseSha: string): Promise<void> {
  const botName = loaded.forum.client.user.displayName;

  switch (action.kind) {
    case 'create-bead': {
      const starter = await thread.fetchStarterMessage();
      const isBug = action.post.type === 'bug';
      const id = await beads.create({
        type: isBug ? 'bug' : 'feature',
        // Agreed with brisk-anvil: bugs P2, ideas P3
        priority: isBug ? 2 : 3,
        title: action.post.title,
        description: beadDescription(starter?.content ?? '', action.post.url, await fetchReplies(thread)),
        externalRef: action.post.url,
      });
      await postNote(thread, `Added to the game's to-do list as \`${id}\`.`);
      return;
    }

    case 'ship-post':
      await applyDecision(loaded, thread, 'shipped', botName, { byline: `Released in build ${releaseSha}` });
      return;

    case 'duplicate-post':
      await applyDecision(loaded, thread, 'duplicate', botName, {
        originalBeadId: action.originalBeadId,
        byline: 'Matched on the game\'s to-do list',
      });
      return;

    case 'close-bead':
      await beads.close(action.bead.id, action.reason);
      return;

    case 'waiting':
    case 'attention':
      return;
  }
}

/**
 * Post one release-notes entry as its own forum post, tagged Release. Replies are welcome there;
 * the post carries no status tag, so triage, the open-post cap and the weekly vote ignore it
 */
async function postReleaseNotes(loaded: GameRequestsForum, releaseTagId: string, entry: ReleaseEntry): Promise<void> {
  const [first, ...rest] = releaseMessages(entry);
  const thread = await loaded.forum.threads.create({
    name: releaseTitle(entry),
    message: { content: first ?? entry.heading, allowedMentions: { parse: [] } },
    appliedTags: [releaseTagId],
  });

  for (const content of rest) {
    await thread.send({ content, allowedMentions: { parse: [] } });
  }
}

/**
 * Post gameTest's new release notes to the forum once their build is released. Returns the
 * number of failures
 */
async function syncReleaseNotes(loaded: GameRequestsForum, threads: readonly AnyThreadChannel[], gameTestPath: string, releaseSha: string): Promise<number> {
  const markdown = readReleaseNotes(gameTestPath);

  if (markdown === null) {
    console.log('Release notes: no RELEASE_NOTES.md on gameTest main');
    return 0;
  }

  const entries = parseReleaseNotes(markdown);
  const saved = readPosted();
  const posted = saved ?? seedPosted(entries);
  const actions = planReleaseNotes(entries, posted, sha => checkReleased(gameTestPath, sha, releaseSha));
  const toPost = actions.filter(action => action.kind === 'post-release');

  console.log(`Release notes: ${entries.length} entries; ${actions.length === 0 ? 'nothing to post' : `${actions.length} item(s):`}`);

  for (const action of actions.filter(action => action.kind !== 'post-release')) {
    console.log(`  ${describeReleaseAction(action)}`);
  }

  if (toPost.length === 0) {
    return 0;
  }

  const releaseTag = loaded.forum.availableTags.find(tag => tag.name.trim().toLowerCase() === releaseTagName.toLowerCase());

  if (!releaseTag) {
    console.log(`  NEEDS YOU: add a "${releaseTagName}" tag to #${loaded.forum.name}; ${toPost.length} release note(s) are waiting for it`);
    return 0;
  }

  if (dryRun) {
    toPost.forEach(action => console.log(`  would ${describeReleaseAction(action)}`));
    return 0;
  }

  // Record the first run's starting point before posting, so a failure can't cause a backfill later
  if (!saved) {
    writePosted(posted);
  }

  const botId = loaded.forum.client.user.id;
  let failures = 0;

  for (const { entry } of toPost) {
    const line = describeReleaseAction({ kind: 'post-release', entry });

    try {
      // Already posted but not recorded (e.g. the state file was lost): record it, don't repost
      const existing = threads.find(thread => thread.ownerId === botId && thread.name === releaseTitle(entry));

      if (!existing) {
        await postReleaseNotes(loaded, releaseTag.id, entry);
      }

      posted.add(entry.heading);
      writePosted(posted);
      console.log(`  ${existing ? 'already posted, recorded' : 'done'}: ${line}`);
    } catch (error) {
      failures++;
      console.error(`  FAILED: ${line}:`, error);
    }
  }

  return failures;
}

async function sync(): Promise<number> {
  const config = loadSyncConfig();
  const releaseSha = readReleaseSha(config.releaseManifest);
  const beads = createBeads(config.bdPath, config.gameTestPath);
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  try {
    const ready = new Promise<Client<true>>(resolve => client.once(Events.ClientReady, resolve));
    await client.login(config.token);
    const loaded = await loadGameRequestsForum(await ready, { ...config, maxOpenPerUser: 0 });

    if (!loaded) {
      return 1;
    }

    const threads = await listPosts(loaded);
    const threadsById = new Map(threads.map(thread => [thread.id, thread]));
    const posts: PostInfo[] = threads.map(thread => ({
      threadId: thread.id,
      url: thread.url,
      title: thread.name,
      ...readTags(thread.appliedTags, loaded.tagIds),
    }));

    const actions = planSync(posts, await beads.listCommunity(), sha => checkReleased(config.gameTestPath, sha, releaseSha));
    console.log(`Release ${releaseSha}; ${posts.length} posts; ${actions.length === 0 ? 'nothing to do' : `${actions.length} item(s):`}`);

    let failures = 0;

    for (const action of actions) {
      const line = describeAction(action);

      if (dryRun || action.kind === 'waiting' || action.kind === 'attention') {
        console.log(`  ${dryRun && action.kind !== 'waiting' && action.kind !== 'attention' ? 'would ' : ''}${line}`);
        continue;
      }

      const thread = threadsById.get(action.post.threadId);

      try {
        if (!thread) {
          throw new Error('post not found');
        }

        await execute(action, thread, loaded, beads, releaseSha);
        console.log(`  done: ${line}`);
      } catch (error) {
        failures++;
        console.error(`  FAILED: ${line}:`, error);
      }
    }

    failures += await syncReleaseNotes(loaded, threads, config.gameTestPath, releaseSha);

    if (dryRun) {
      console.log('Dry run: nothing was changed.');
    }

    return failures > 0 ? 1 : 0;
  } finally {
    await client.destroy();
  }
}

if (!takeLock()) {
  console.log('Another sync is running; skipping this one.');
} else {
  try {
    process.exitCode = await sync();
  } catch (error) {
    console.error('Sync failed:', error);
    process.exitCode = 1;
  } finally {
    rmSync(lockPath, { force: true });
  }
}
