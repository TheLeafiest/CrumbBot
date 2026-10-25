import {
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  type Client,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { Command } from '../commands/types.js';
import type { GameRequestsConfig } from '../config.js';
import { loadGameRequestsForum, statusTags, type GameRequestsForum, type TagName } from './forum.js';
import { buildPostContent, echoSubmission, openStatusTags, parseSubmitterId, submissionForms, type SubmissionType } from './posts.js';

const modalPrefix = 'gr:submit:';
const voteEmoji = '👍';
const unavailableMessage = 'Game ideas and bug reports are unavailable right now. Let Kale know!';

export interface GameRequests {
  commands: Command[];
  // Find and verify the forum; until this succeeds the commands reply that they're unavailable
  start(client: Client<true>): Promise<void>;
  // Handle a form submission if it belongs to this feature; false if it doesn't
  handleModalSubmit(interaction: ModalSubmitInteraction): Promise<boolean>;
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
 * How many of a member's posts are still New or Approved. Posts auto-archive when quiet, so
 * archived posts count too
 */
async function countOpenSubmissions(loaded: GameRequestsForum, userId: string): Promise<number> {
  const { forum } = loaded;
  const openTagIds = new Set(openStatusTags.map(name => tagId(loaded, name)));
  const [active, archived] = await Promise.all([
    forum.threads.fetchActive(),
    forum.threads.fetchArchived({ type: 'public', limit: 100 }),
  ]);

  const openThreads = [...active.threads.values(), ...archived.threads.values()]
    .filter(thread => thread.parentId === forum.id && thread.appliedTags.some(id => openTagIds.has(id)));

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

      await interaction.editReply(`Thanks! Your ${form.noun} is posted: ${thread.url}`);
    } catch (error) {
      console.error('Failed to post a game request:', error);
      await interaction.editReply(`Something went wrong posting your ${form.noun}. `
        + `Here's what you wrote, so you can try again:\n${echoSubmission(type, values)}`);
    }
  }

  return {
    commands: [
      command('idea', 'Suggest an idea for the game'),
      command('bug', 'Report a bug in the game'),
    ],

    async start(client) {
      loaded = await loadGameRequestsForum(client, config);
    },

    async handleModalSubmit(interaction) {
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
  };
}
