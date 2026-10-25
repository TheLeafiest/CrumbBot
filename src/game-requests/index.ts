import {
  ActionRowBuilder,
  PermissionFlagsBits,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type AnyThreadChannel,
  type ButtonInteraction,
  type Client,
  type ModalSubmitInteraction,
  type SendableChannels,
} from 'discord.js';
import { scheduleJob } from 'node-schedule';
import type { Command } from '../commands/types.js';
import type { GameRequestsConfig } from '../config.js';
import { loadGameRequestsForum, statusTags, type GameRequestsForum, type TagName } from './forum.js';
import { buildPostContent, echoSubmission, openStatusTags, parseSubmitterId, submissionForms, type SubmissionType } from './posts.js';
import {
  actionsByStatus,
  hasRole,
  isTriageAction,
  nextTags,
  outcomeMessage,
  parseThreadReference,
  readTags,
  triageActions,
  triageButtonPrefix,
  triageReasonPrefix,
  triageRow,
  type TriageAction,
} from './triage.js';
import { buildPoll, candidateList, isStale, rankCandidates, staleReason, weeklyVoteSchedule, type Candidate } from './weekly.js';

const modalPrefix = 'gr:submit:';
const voteEmoji = '👍';
const unavailableMessage = 'Game ideas and bug reports are unavailable right now. Let Kale know!';

export interface GameRequests {
  commands: Command[];
  // Find and verify the forum (until this succeeds the commands reply that they're unavailable),
  // and schedule the weekly vote in voteChannel
  start(client: Client<true>, voteChannel: SendableChannels | null): Promise<void>;
  // The Friday vote: close stale ideas, then poll the top New ideas. Runs on a schedule
  runWeeklyVote(voteChannel: SendableChannels): Promise<void>;
  // Handle a form submission if it belongs to this feature; false if it doesn't
  handleModalSubmit(interaction: ModalSubmitInteraction): Promise<boolean>;
  // Handle a triage button click if it belongs to this feature; false if it doesn't
  handleButton(interaction: ButtonInteraction): Promise<boolean>;
}

type TriageInteraction = ButtonInteraction | ModalSubmitInteraction;

// The extra question asked before a decision, for the decisions that need one
const reasonForms: Partial<Record<TriageAction, { title: string; label: string; description: string; required: boolean; style: TextInputStyle }>> = {
  decline: {
    title: 'Decline this post',
    label: 'Why? (shown to the submitter)',
    description: 'Optional, but it helps them understand',
    required: false,
    style: TextInputStyle.Paragraph,
  },
  duplicate: {
    title: 'Mark as a duplicate',
    label: 'Link to the original post',
    description: 'Right-click the original post, Copy Link, and paste it here',
    required: true,
    style: TextInputStyle.Short,
  },
};

function buildReasonModal(action: TriageAction): ModalBuilder | null {
  const form = reasonForms[action];

  if (!form) {
    return null;
  }

  return new ModalBuilder()
    .setCustomId(`${triageReasonPrefix}${action}`)
    .setTitle(form.title)
    .addLabelComponents(new LabelBuilder()
      .setLabel(form.label)
      .setDescription(form.description)
      .setTextInputComponent(new TextInputBuilder()
        .setCustomId('reason')
        .setStyle(form.style)
        .setRequired(form.required)
        .setMaxLength(500)));
}

const isSubmissionType = (type: string): type is SubmissionType => Object.hasOwn(submissionForms, type);

function buildModal(type: SubmissionType): ModalBuilder {
  const { modalTitle, fields } = submissionForms[type];

  return new ModalBuilder()
    .setCustomId(`${modalPrefix}${type}`)
    .setTitle(modalTitle)
    .addLabelComponents(...fields.map(field => new LabelBuilder()
      .setLabel(field.label)
      .setDescription(field.description)
      .setTextInputComponent(new TextInputBuilder()
        .setCustomId(field.id)
        .setStyle(field.style)
        .setRequired(field.required)
        .setMaxLength(field.maxLength))));
}

function tagId({ tagIds }: GameRequestsForum, name: TagName): string {
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
async function listPosts({ forum }: GameRequestsForum): Promise<AnyThreadChannel[]> {
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
async function applyDecision(
  loaded: GameRequestsForum,
  thread: AnyThreadChannel,
  action: TriageAction,
  actorName: string,
  details: { reason?: string; originalThreadId?: string } = {},
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

/**
 * Close New ideas nobody voted for in a while, then post a poll of the most-voted New ideas
 * (bug reports are fixed, not voted on). Skips the poll with fewer than two candidates
 */
async function runWeeklyVote(loaded: GameRequestsForum, voteChannel: SendableChannels, now = new Date()): Promise<void> {
  const botName = loaded.forum.client.user.displayName;
  const newIdeas = (await listPosts(loaded)).filter(thread => {
    const { status, type } = readTags(thread.appliedTags, loaded.tagIds);
    return status === statusTags.new && type === 'idea';
  });

  const candidates: Candidate[] = [];

  for (const thread of newIdeas) {
    const starter = await thread.fetchStarterMessage().catch(() => null);
    const reaction = starter?.reactions.cache.get(voteEmoji);
    const candidate: Candidate = {
      title: thread.name,
      url: thread.url,
      // The bot's own 👍 is only there to make voting one click
      votes: Math.max(0, (reaction?.count ?? 0) - (reaction?.me ? 1 : 0)),
      createdAt: thread.createdAt ?? now,
    };

    if (isStale(candidate, now)) {
      await applyDecision(loaded, thread, 'decline', botName, { reason: staleReason })
        .then(() => console.log(`Weekly vote: closed "${thread.name}" (no votes in a while)`))
        .catch(error => console.error(`Weekly vote: failed to close stale post ${thread.id}:`, error));
      continue;
    }

    candidates.push(candidate);
  }

  const top = rankCandidates(candidates);

  if (top.length < 2) {
    console.log(`Weekly vote: skipped, ${top.length} New idea(s) is too few for a poll`);
    return;
  }

  await voteChannel.send({ poll: buildPoll(top) });
  await voteChannel.send({ content: candidateList(top), allowedMentions: { parse: [] } });
  console.log(`Weekly vote: polled ${top.length} ideas`);
}

/**
 * How many of a member's posts are still New or Approved. Posts auto-archive when quiet, so
 * archived posts count too
 */
async function countOpenSubmissions(loaded: GameRequestsForum, userId: string): Promise<number> {
  const openTagIds = new Set(openStatusTags.map(name => tagId(loaded, name)));
  const openThreads = (await listPosts(loaded)).filter(thread => thread.appliedTags.some(id => openTagIds.has(id)));

  let count = 0;

  for (const thread of openThreads) {
    const starter = await thread.fetchStarterMessage().catch(() => null);

    if (starter && parseSubmitterId(starter.content) === userId) {
      count++;
    }
  }

  return count;
}

export function createGameRequests(config: GameRequestsConfig): GameRequests {
  let loaded: GameRequestsForum | null = null;

  const command = (type: SubmissionType, description: string): Command => ({
    data: new SlashCommandBuilder()
      .setName(type)
      .setDescription(description),

    async execute(interaction) {
      if (!loaded) {
        await interaction.reply({ content: unavailableMessage, flags: MessageFlags.Ephemeral });
        return;
      }

      // Must be the first response, within 3 seconds, so the open-submission cap is checked on submit
      await interaction.showModal(buildModal(type));
    },
  });

  async function submit(interaction: ModalSubmitInteraction, type: SubmissionType): Promise<void> {
    if (!loaded) {
      await interaction.reply({ content: unavailableMessage, flags: MessageFlags.Ephemeral });
      return;
    }

    const form = submissionForms[type];
    const values = Object.fromEntries(form.fields.map(field => [field.id, interaction.fields.getTextInputValue(field.id)]));
    const userId = interaction.user.id;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const open = await countOpenSubmissions(loaded, userId);

      if (open >= config.maxOpenPerUser) {
        await interaction.editReply(`You have ${open} ideas and bug reports waiting on a decision, which is the limit for now. `
          + `Once one is decided, send this again. Here's what you wrote:\n${echoSubmission(type, values)}`);
        return;
      }

      const thread = await loaded.forum.threads.create({
        name: values.title?.trim() || form.noun,
        message: {
          content: buildPostContent(type, userId, values),
          // The submitter is added to the thread below, so the mention doesn't need to ping
          allowedMentions: { parse: [] },
          components: [triageRow(statusTags.new)],
        },
        appliedTags: [tagId(loaded, form.tag), tagId(loaded, statusTags.new)],
      });

      // The bot owns the thread, so the submitter only hears about replies and decisions if added
      await thread.members.add(userId).catch(error => {
        console.error(`Failed to add ${userId} to game request thread ${thread.id}:`, error);
      });

      await thread.fetchStarterMessage()
        .then(starter => starter?.react(voteEmoji))
        .catch(error => console.error(`Failed to add the vote reaction to ${thread.id}:`, error));

      // A bare post link can render as "unknown" until the member's client loads the new thread,
      // so link to it with a button instead
      await interaction.editReply({
        content: `Thanks! Your ${form.noun} **${thread.name}** is posted in <#${loaded.forum.id}>.`,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel('Open your post')
          .setURL(thread.url))],
      });
    } catch (error) {
      console.error('Failed to post a game request:', error);
      await interaction.editReply(`Something went wrong posting your ${form.noun}. `
        + `Here's what you wrote, so you can try again:\n${echoSubmission(type, values)}`);
    }
  }

  /**
   * The post a triage click or form is for, once the member is confirmed as an approver and the
   * decision fits the post's current status. Otherwise replies privately and returns null.
   * Nothing is awaited before the checks, so a button can still open a form within 3 seconds
   */
  async function triageTarget(interaction: TriageInteraction, action: TriageAction): Promise<AnyThreadChannel | null> {
    const refuse = async (content: string) => {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      return null;
    };

    if (!loaded) {
      return refuse(unavailableMessage);
    }

    if (!hasRole(interaction.member, config.approverRoleId)) {
      return refuse('Only approvers can make decisions on posts.');
    }

    const thread = interaction.channel;

    if (!thread?.isThread() || thread.parentId !== loaded.forum.id) {
      return refuse('These buttons only work on posts in the game ideas forum.');
    }

    // A stale button, e.g. clicked twice or on a message that missed an update
    const { status } = readTags(thread.appliedTags, loaded.tagIds);

    if (!status || !actionsByStatus[status].includes(action)) {
      return refuse(`This post is ${status ? `already **${status}**` : 'missing its status tag'}, so it can't be marked **${triageActions[action].to}**.`);
    }

    return thread;
  }

  /**
   * Apply a decision for an approver and tell them how it went. The interaction must already
   * be deferred
   */
  async function decide(
    interaction: TriageInteraction,
    thread: AnyThreadChannel,
    action: TriageAction,
    details: { reason?: string; originalThreadId?: string } = {},
  ): Promise<void> {
    if (!loaded) {
      return;
    }

    const { to } = triageActions[action];

    try {
      await applyDecision(loaded, thread, action, interaction.user.displayName, details);
      await interaction.editReply(`Done: this post is now **${to}**.`);
    } catch (error) {
      console.error(`Failed to mark game request ${thread.id} as ${to}:`, error);
      await interaction.editReply(`Something went wrong marking this post **${to}**: ${error}`);
    }
  }

  return {
    commands: [
      command('idea', 'Suggest an idea for the game'),
      command('bug', 'Report a bug in the game'),
    ],

    async start(client, voteChannel) {
      loaded = await loadGameRequestsForum(client, config);
      const forum = loaded;

      if (!forum) {
        return;
      }

      if (!voteChannel) {
        console.error('Weekly vote is OFF: the bot can\'t post in the general channel (check generalChannelId)');
        return;
      }

      // Named as Discord's channel settings show them
      const permissions = 'permissionsFor' in voteChannel ? voteChannel.permissionsFor(client.user) : null;

      if (permissions && !permissions.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.SendPolls])) {
        console.error(`Weekly vote is OFF: the bot needs Send Messages and Create Polls in #${'name' in voteChannel ? voteChannel.name : 'general'}`);
        return;
      }

      // Never rejects: a rejection from a scheduled job would be unhandled
      const job = scheduleJob('weekly-vote', weeklyVoteSchedule, () => runWeeklyVote(forum, voteChannel).catch(error => {
        console.error('Weekly vote failed:', error);
      }));
      // The time includes its UTC offset, which shows whether the container's timezone is right
      console.log(`Weekly vote: Fridays at 10:00, next ${job?.nextInvocation()?.toString() ?? 'unknown'}`);
    },

    async runWeeklyVote(voteChannel) {
      if (loaded) {
        await runWeeklyVote(loaded, voteChannel);
      }
    },

    async handleModalSubmit(interaction) {
      if (interaction.customId.startsWith(triageReasonPrefix)) {
        return submitReason(interaction);
      }

      if (!interaction.customId.startsWith(modalPrefix)) {
        return false;
      }

      const type = interaction.customId.slice(modalPrefix.length);

      if (!isSubmissionType(type)) {
        return false;
      }

      await submit(interaction, type);
      return true;
    },

    async handleButton(interaction) {
      if (!interaction.customId.startsWith(triageButtonPrefix)) {
        return false;
      }

      const action = interaction.customId.slice(triageButtonPrefix.length);

      if (!isTriageAction(action)) {
        return false;
      }

      const thread = await triageTarget(interaction, action);

      if (!thread) {
        return true;
      }

      // Decline and Duplicate ask one more question first
      const reasonModal = buildReasonModal(action);

      if (reasonModal) {
        await interaction.showModal(reasonModal);
        return true;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await decide(interaction, thread, action);
      return true;
    },
  };

  /**
   * The answer to Decline's "why?" or Duplicate's "link to the original"
   */
  async function submitReason(interaction: ModalSubmitInteraction): Promise<boolean> {
    const action = interaction.customId.slice(triageReasonPrefix.length);

    if (!isTriageAction(action)) {
      return false;
    }

    // Checked again: the post may have changed while the form was open
    const thread = await triageTarget(interaction, action);

    if (!thread) {
      return true;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const answer = interaction.fields.getTextInputValue('reason').trim();

    if (action !== 'duplicate') {
      await decide(interaction, thread, action, { reason: answer || undefined });
      return true;
    }

    const originalId = parseThreadReference(answer);
    const original = originalId ? await interaction.client.channels.fetch(originalId).catch(() => null) : null;

    if (!original?.isThread() || original.parentId !== loaded?.forum.id || original.id === thread.id) {
      await interaction.editReply('That doesn\'t look like a link to another post in the game ideas forum. '
        + 'Right-click the original post, choose Copy Link, and try again.');
      return true;
    }

    await decide(interaction, thread, action, { originalThreadId: original.id });
    return true;
  }
}
