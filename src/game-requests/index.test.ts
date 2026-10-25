import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChannelType, type Client, type ModalSubmitInteraction } from 'discord.js';
import { createGameRequests } from './index.js';
import { buildPostContent } from './posts.js';

const tags = ['Idea', 'Bug', 'New', 'Approved', 'Declined', 'Duplicate', 'Shipped'].map((name, i) => ({ id: `tag${i}`, name }));
const tagId = (name: string) => tags.find(tag => tag.name === name)?.id ?? '';

interface FakeThread {
  id: string;
  parentId: string;
  appliedTags: string[];
  starterContent: string;
}

function fakeForum(existing: FakeThread[], { failCreate = false } = {}) {
  const created: { name: string; content: string; appliedTags: string[]; members: string[]; reactions: string[] }[] = [];
  const toThread = (thread: FakeThread) => ({
    ...thread,
    fetchStarterMessage: async () => ({ content: thread.starterContent }),
  });

  const forum = {
    id: 'forum',
    name: 'game-ideas',
    type: ChannelType.GuildForum,
    availableTags: tags,
    guild: { roles: { cache: new Map([['approver', {}]]) } },
    permissionsFor: () => ({ has: () => true }),
    threads: {
      fetchActive: async () => ({ threads: new Map(existing.map(thread => [thread.id, toThread(thread)])) }),
      fetchArchived: async () => ({ threads: new Map() }),
      create: async (options: { name: string; message: { content: string }; appliedTags: string[] }) => {
        if (failCreate) throw new Error('Missing Permissions');

        const post = { name: options.name, content: options.message.content, appliedTags: options.appliedTags, members: [] as string[], reactions: [] as string[] };
        created.push(post);

        return {
          id: 'new-thread',
          name: options.name,
          url: 'https://discord.com/channels/1/new-thread',
          members: { add: async (id: string) => { post.members.push(id); } },
          fetchStarterMessage: async () => ({ react: async (emoji: string) => { post.reactions.push(emoji); } }),
        };
      },
    },
  };

  const client = { user: { id: 'bot' }, channels: { fetch: async () => forum } } as unknown as Client<true>;
  return { client, created };
}

function fakeSubmit(customId: string, values: Record<string, string>, userId = '111') {
  const replies: string[] = [];
  const buttons: unknown[] = [];
  const interaction = {
    customId,
    user: { id: userId },
    fields: { getTextInputValue: (id: string) => values[id] ?? '' },
    reply: async ({ content }: { content: string }) => { replies.push(content); },
    deferReply: async () => {},
    editReply: async (reply: string | { content: string; components?: { toJSON(): { components: unknown[] } }[] }) => {
      if (typeof reply === 'string') {
        replies.push(reply);
        return;
      }

      replies.push(reply.content);
      // Round-trip through JSON to drop fields the builder leaves undefined
      buttons.push(...JSON.parse(JSON.stringify((reply.components ?? []).flatMap(row => row.toJSON().components))));
    },
  } as unknown as ModalSubmitInteraction;

  return { interaction, replies, buttons };
}

const openPost = (id: string, userId: string, status = 'New'): FakeThread => ({
  id,
  parentId: 'forum',
  appliedTags: [tagId('Idea'), tagId(status)],
  starterContent: buildPostContent('idea', userId, { idea: 'x' }),
});

async function startedRequests(existing: FakeThread[], options?: { failCreate?: boolean }) {
  test.mock.method(console, 'log', () => {});
  const { client, created } = fakeForum(existing, options);
  const requests = createGameRequests({ forumChannelId: 'forum', approverRoleId: 'approver', maxOpenPerUser: 3 });
  await requests.start(client);

  return { requests, created };
}

test('posts an idea tagged Idea + New, adds the submitter and a vote, and links it', async () => {
  const { requests, created } = await startedRequests([]);
  const { interaction, replies, buttons } = fakeSubmit('gr:submit:idea', { title: '  Grenades ', idea: 'Add grenades' });

  assert.equal(await requests.handleModalSubmit(interaction), true);
  assert.deepEqual(created, [{
    name: 'Grenades',
    content: 'Submitted by <@111>\n\n**Your idea**\nAdd grenades',
    appliedTags: [tagId('Idea'), tagId('New')],
    members: ['111'],
    reactions: ['👍'],
  }]);
  assert.deepEqual(replies, ['Thanks! Your idea **Grenades** is posted in <#forum>.']);
  assert.deepEqual(buttons, [{ type: 2, style: 5, label: 'Open your post', url: 'https://discord.com/channels/1/new-thread' }]);
});

test('bug reports get the Bug tag', async () => {
  const { requests, created } = await startedRequests([]);
  await requests.handleModalSubmit(fakeSubmit('gr:submit:bug', { title: 'Crash', happened: 'It crashed' }).interaction);

  assert.deepEqual(created[0]?.appliedTags, [tagId('Bug'), tagId('New')]);
});

test('refuses a 4th open submission and gives the text back', async () => {
  // Two New and one Approved count; Declined and other members' posts don't
  const { requests, created } = await startedRequests([
    openPost('a', '111'),
    openPost('b', '111', 'Approved'),
    openPost('c', '111'),
    openPost('d', '111', 'Declined'),
    openPost('e', '222'),
  ]);
  const { interaction, replies } = fakeSubmit('gr:submit:idea', { title: 'Hats', idea: 'Add hats' });

  await requests.handleModalSubmit(interaction);

  assert.equal(created.length, 0);
  assert.match(replies[0] ?? '', /3 ideas and bug reports waiting on a decision/);
  assert.match(replies[0] ?? '', /Add hats/);
});

test('allows a submission when under the cap', async () => {
  const { requests, created } = await startedRequests([openPost('a', '111'), openPost('d', '111', 'Declined')]);
  await requests.handleModalSubmit(fakeSubmit('gr:submit:idea', { title: 'Hats', idea: 'Add hats' }).interaction);

  assert.equal(created.length, 1);
});

test('a failed post gives the member their text back', async () => {
  test.mock.method(console, 'error', () => {});
  const { requests } = await startedRequests([], { failCreate: true });
  const { interaction, replies } = fakeSubmit('gr:submit:bug', { title: 'Crash', happened: 'It crashed' });

  await requests.handleModalSubmit(interaction);

  assert.match(replies[0] ?? '', /Something went wrong posting your bug report/);
  assert.match(replies[0] ?? '', /It crashed/);
});

test('ignores forms that belong to something else', async () => {
  const { requests } = await startedRequests([]);

  assert.equal(await requests.handleModalSubmit(fakeSubmit('other:form', {}).interaction), false);
  assert.equal(await requests.handleModalSubmit(fakeSubmit('gr:submit:nope', {}).interaction), false);
});

test('says the feature is unavailable when the forum never loaded', async () => {
  const requests = createGameRequests({ forumChannelId: 'forum', approverRoleId: 'approver', maxOpenPerUser: 3 });
  const { interaction, replies } = fakeSubmit('gr:submit:idea', { title: 'Hats', idea: 'Add hats' });

  await requests.handleModalSubmit(interaction);

  assert.match(replies[0] ?? '', /unavailable right now/);
});
