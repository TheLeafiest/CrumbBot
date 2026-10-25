import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChannelType, type Client, type SendableChannels } from 'discord.js';
import { createGameRequests } from './index.js';
import { buildPostContent } from './posts.js';

const tags = ['Idea', 'Bug', 'New', 'Approved', 'Declined', 'Duplicate', 'Shipped'].map((name, i) => ({ id: `tag${i}`, name }));
const tagId = (name: string) => tags.find(tag => tag.name === name)?.id ?? '';
const day = 24 * 60 * 60 * 1000;

// A post with votes; the bot's own 👍 is included in the count, as on Discord
function fakePost(name: string, { type = 'Idea', status = 'New', votes = 0, daysOld = 1 } = {}) {
  const state = { appliedTags: [tagId(type), tagId(status)], archived: false, locked: false, sent: [] as string[] };

  return {
    state,
    thread: {
      id: name,
      name,
      url: `https://discord.com/channels/1/${name}`,
      parentId: 'forum',
      createdAt: new Date(Date.now() - daysOld * day),
      get appliedTags() { return state.appliedTags; },
      get archived() { return state.archived; },
      get locked() { return state.locked; },
      setArchived: async (value: boolean) => { state.archived = value; },
      setLocked: async (value: boolean) => { state.locked = value; },
      setAppliedTags: async (applied: string[]) => { state.appliedTags = applied; },
      send: async ({ content }: { content: string }) => { state.sent.push(content); },
      fetchStarterMessage: async () => ({
        content: buildPostContent('idea', '111', { idea: 'x' }),
        editable: true,
        edit: async () => {},
        reactions: { cache: new Map([['👍', { count: votes + 1, me: true }]]) },
      }),
    },
  };
}

async function runVote(posts: ReturnType<typeof fakePost>[]) {
  const forum = {
    id: 'forum',
    name: 'game-ideas',
    type: ChannelType.GuildForum,
    availableTags: tags,
    client: { user: { displayName: 'Crumb Bot' } },
    guild: { roles: { cache: new Map([['approver', {}]]) } },
    permissionsFor: () => ({ has: () => true }),
    threads: {
      fetchActive: async () => ({ threads: new Map(posts.map(post => [post.thread.id, post.thread])) }),
      fetchArchived: async () => ({ threads: new Map() }),
    },
  };
  const client = { user: { id: 'bot' }, channels: { fetch: async () => forum } } as unknown as Client<true>;
  const sent: unknown[] = [];
  const voteChannel = { send: async (message: unknown) => { sent.push(message); } } as unknown as SendableChannels;

  test.mock.method(console, 'log', () => {});
  test.mock.method(console, 'error', () => {});
  const requests = createGameRequests({ forumChannelId: 'forum', approverRoleId: 'approver', maxOpenPerUser: 3 });
  await requests.start(client, null);
  await requests.runWeeklyVote(voteChannel);

  return sent;
}

test('polls the most-voted New ideas, not counting the bot\'s own vote, then links them', async () => {
  const sent = await runVote([
    fakePost('hats', { votes: 1 }),
    fakePost('grenades', { votes: 3 }),
    fakePost('crash', { type: 'Bug', votes: 9 }),
    fakePost('done', { status: 'Approved', votes: 9 }),
  ]);

  const [poll, list] = sent as [{ poll: { answers: { text: string }[] } }, { content: string }];
  assert.deepEqual(poll.poll.answers.map(answer => answer.text), ['1. grenades', '2. hats']);
  assert.match(list.content, /1\. \[grenades\]\(https:\/\/discord\.com\/channels\/1\/grenades\) · 3 👍/);
  assert.match(list.content, /2\. \[hats\]\(.*\) · 1 👍/);
});

test('closes ideas with no votes after 4 weeks, but never bug reports', async () => {
  const stale = fakePost('stale', { daysOld: 30 });
  const staleBug = fakePost('stale-bug', { type: 'Bug', daysOld: 30 });
  const liked = fakePost('old-but-liked', { daysOld: 30, votes: 1 });

  await runVote([stale, staleBug, liked, fakePost('fresh')]);

  assert.deepEqual(stale.state.appliedTags, [tagId('Idea'), tagId('Declined')]);
  assert.match(stale.state.sent[0] ?? '', /didn't get any votes in 4 weeks/);
  assert.equal(stale.state.locked, true);
  assert.deepEqual(staleBug.state.appliedTags, [tagId('Bug'), tagId('New')]);
  assert.deepEqual(liked.state.appliedTags, [tagId('Idea'), tagId('New')]);
});

test('skips the poll with fewer than two New ideas', async () => {
  assert.deepEqual(await runVote([fakePost('lonely', { votes: 5 })]), []);
});
