import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChannelType, type Client, type ModalSubmitInteraction } from 'discord.js';
import { createGameRequests, type GameRequests } from './index.js';
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
  // No vote channel: tests must not schedule the real Friday job
  test.mock.method(console, 'error', () => {});
  await requests.start(client, null);

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

// Triage: a fake post that refuses changes while archived, like Discord does
function fakePost({ status = 'New', archived = false, locked = false } = {}) {
  const state = {
    appliedTags: [tagId('Idea'), tagId(status)],
    archived,
    locked,
    sent: [] as { content: string; allowedMentions: unknown }[],
    buttons: [] as string[],
  };
  const assertOpen = () => {
    if (state.archived) throw new Error('Thread is archived');
  };

  const thread = {
    id: '500',
    parentId: 'forum',
    isThread: () => true,
    get appliedTags() { return state.appliedTags; },
    get archived() { return state.archived; },
    get locked() { return state.locked; },
    setArchived: async (value: boolean) => { state.archived = value; },
    setLocked: async (value: boolean) => { assertOpen(); state.locked = value; },
    setAppliedTags: async (tags: string[]) => { assertOpen(); state.appliedTags = tags; },
    send: async (message: { content: string; allowedMentions: unknown }) => { assertOpen(); state.sent.push(message); },
    fetchStarterMessage: async () => ({
      content: buildPostContent('idea', '111', { idea: 'x' }),
      editable: true,
      edit: async ({ components }: { components: { toJSON(): { components: { label: string }[] } }[] }) => {
        assertOpen();
        state.buttons = components.flatMap(row => row.toJSON().components.map(button => button.label));
      },
    }),
  };

  return { thread, state };
}

function fakeTriage(customId: string, thread: unknown, { roles = ['approver'], answer = '', others = [] as unknown[] } = {}) {
  const replies: string[] = [];
  const modals: string[] = [];
  const interaction = {
    customId,
    member: { roles },
    user: { displayName: 'Kale' },
    channel: thread,
    client: { channels: { fetch: async (id: string) => others.find(other => (other as { id: string }).id === id) ?? null } },
    fields: { getTextInputValue: () => answer },
    reply: async ({ content }: { content: string }) => { replies.push(content); },
    deferReply: async () => {},
    editReply: async (content: string) => { replies.push(content); },
    showModal: async (modal: { toJSON(): { custom_id: string } }) => { modals.push(modal.toJSON().custom_id); },
  };

  return { interaction, replies, modals };
}

const asButton = (interaction: unknown) => interaction as Parameters<GameRequests['handleButton']>[0];
const asModal = (interaction: unknown) => interaction as ModalSubmitInteraction;

test('approve: swaps the tag, pings only the submitter, and moves the buttons on', async () => {
  const { requests } = await startedRequests([]);
  const { thread, state } = fakePost();
  const { interaction, replies } = fakeTriage('gr:triage:approve', thread);

  assert.equal(await requests.handleButton(asButton(interaction)), true);
  assert.deepEqual(state.appliedTags, [tagId('Idea'), tagId('Approved')]);
  assert.deepEqual(state.sent, [{
    content: '<@111> Your idea was approved, and it\'s on the list for the game!\n-# Decided by Kale',
    allowedMentions: { users: ['111'] },
  }]);
  assert.deepEqual(state.buttons, ['Shipped', 'Decline']);
  assert.equal(state.locked, false);
  assert.deepEqual(replies, ['Done: this post is now **Approved**.']);
});

test('only approvers can decide', async () => {
  const { requests } = await startedRequests([]);
  const { thread, state } = fakePost();
  const { interaction, replies } = fakeTriage('gr:triage:approve', thread, { roles: ['someone'] });

  await requests.handleButton(asButton(interaction));

  assert.deepEqual(state.appliedTags, [tagId('Idea'), tagId('New')]);
  assert.deepEqual(replies, ['Only approvers can make decisions on posts.']);
});

test('decline asks why, then closes the post with the reason', async () => {
  const { requests } = await startedRequests([]);
  const { thread, state } = fakePost();
  const click = fakeTriage('gr:triage:decline', thread);

  await requests.handleButton(asButton(click.interaction));
  assert.deepEqual(click.modals, ['gr:reason:decline']);
  assert.equal(state.sent.length, 0);

  const form = fakeTriage('gr:reason:decline', thread, { answer: 'Too big for now' });
  assert.equal(await requests.handleModalSubmit(asModal(form.interaction)), true);

  assert.deepEqual(state.appliedTags, [tagId('Idea'), tagId('Declined')]);
  assert.match(state.sent[0]?.content ?? '', /> Too big for now/);
  assert.deepEqual(state.buttons, ['Reopen']);
  assert.equal(state.locked, true);
  assert.equal(state.archived, true);
});

test('duplicate needs a link to another post in the forum', async () => {
  const { requests } = await startedRequests([]);
  const { thread, state } = fakePost();
  const original = { id: '600', parentId: 'forum', isThread: () => true };
  const elsewhere = { id: '700', parentId: 'general', isThread: () => true };

  for (const answer of ['the hats one', 'https://discord.com/channels/1/700', 'https://discord.com/channels/1/500']) {
    const form = fakeTriage('gr:reason:duplicate', thread, { answer, others: [original, elsewhere, thread] });
    await requests.handleModalSubmit(asModal(form.interaction));
    assert.match(form.replies[0] ?? '', /doesn't look like a link to another post/, answer);
  }

  assert.equal(state.sent.length, 0);

  const form = fakeTriage('gr:reason:duplicate', thread, { answer: 'https://discord.com/channels/1/600', others: [original] });
  await requests.handleModalSubmit(asModal(form.interaction));

  assert.deepEqual(state.appliedTags, [tagId('Idea'), tagId('Duplicate')]);
  assert.match(state.sent[0]?.content ?? '', /already covered in <#600>/);
});

test('a stale button does nothing', async () => {
  const { requests } = await startedRequests([]);
  const { thread, state } = fakePost({ status: 'Declined', archived: true, locked: true });
  const { interaction, replies } = fakeTriage('gr:triage:approve', thread);

  await requests.handleButton(asButton(interaction));

  assert.deepEqual(state.appliedTags, [tagId('Idea'), tagId('Declined')]);
  assert.deepEqual(replies, ['This post is already **Declined**, so it can\'t be marked **Approved**.']);
});

test('reopen unarchives and unlocks a closed post', async () => {
  const { requests } = await startedRequests([]);
  const { thread, state } = fakePost({ status: 'Shipped', archived: true, locked: true });

  await requests.handleButton(asButton(fakeTriage('gr:triage:reopen', thread).interaction));

  assert.deepEqual(state.appliedTags, [tagId('Idea'), tagId('New')]);
  assert.deepEqual(state.buttons, ['Approve', 'Decline', 'Duplicate']);
  assert.equal(state.archived, false);
  assert.equal(state.locked, false);
});

test('approving an idle, auto-archived post reopens it first and leaves it open', async () => {
  const { requests } = await startedRequests([]);
  const { thread, state } = fakePost({ archived: true });

  await requests.handleButton(asButton(fakeTriage('gr:triage:approve', thread).interaction));

  assert.deepEqual(state.appliedTags, [tagId('Idea'), tagId('Approved')]);
  assert.equal(state.archived, false);
});
