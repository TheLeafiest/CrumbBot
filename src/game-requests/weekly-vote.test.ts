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

test('with fewer than two New ideas, polls the approved ideas that haven\'t shipped', async () => {
  const sent = await runVote([
    fakePost('lonely', { votes: 5 }),
    fakePost('hammer', { status: 'Approved', votes: 1 }),
    fakePost('cannons', { status: 'Approved', votes: 4 }),
    fakePost('shipped-towers', { status: 'Shipped', votes: 9 }),
    fakePost('approved-bug', { type: 'Bug', status: 'Approved', votes: 9 }),
  ]);

  const [poll, list] = sent as [{ poll: { question: { text: string }; answers: { text: string }[] } }, { content: string }];
  assert.equal(poll.poll.question.text, 'Which approved idea should be built next?');
  assert.deepEqual(poll.poll.answers.map(answer => answer.text), ['1. cannons', '2. hammer']);
  assert.match(list.content, /^Not enough new ideas for a vote this week/);
  assert.doesNotMatch(list.content, /\/idea/);
  assert.equal(sent.length, 2);
});

test('approved ideas are never closed for lack of votes', async () => {
  const oldApproved = fakePost('old-approved', { status: 'Approved', daysOld: 60 });
  await runVote([oldApproved, fakePost('other-approved', { status: 'Approved' })]);

  assert.deepEqual(oldApproved.state.appliedTags, [tagId('Idea'), tagId('Approved')]);
});

test('two New ideas still get the usual poll, even with approved ideas waiting', async () => {
  const sent = await runVote([
    fakePost('hats'),
    fakePost('grenades'),
    fakePost('hammer', { status: 'Approved', votes: 9 }),
    fakePost('cannons', { status: 'Approved', votes: 9 }),
  ]);

  const [poll] = sent as [{ poll: { question: { text: string }; answers: { text: string }[] } }];
  assert.equal(poll.poll.question.text, 'Which ideas should go into the game next?');
  assert.deepEqual(poll.poll.answers.map(answer => answer.text.replace(/^\d+\. /, '')).sort(), ['grenades', 'hats']);
});

test('with too few of both, posts only a nudge to suggest ideas', async () => {
  assert.deepEqual(await runVote([
    fakePost('lonely', { votes: 5 }),
    fakePost('hammer', { status: 'Approved' }),
    fakePost('shipped-towers', { status: 'Shipped' }),
  ]), [{ content: 'Not enough ideas for a vote this week. Got one? Suggest it with /idea', allowedMentions: { parse: [] } }]);
});
