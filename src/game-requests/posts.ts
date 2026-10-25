import { TextInputStyle } from 'discord.js';
import { statusTags, typeTags, type TagName } from './forum.js';

export type SubmissionType = keyof typeof typeTags;

export interface FormField {
  id: string;
  // Discord limits: label 45 characters, description 100
  label: string;
  description: string;
  style: TextInputStyle;
  required: boolean;
  maxLength: number;
}

interface SubmissionForm {
  modalTitle: string;
  noun: string;
  tag: TagName;
  fields: FormField[];
}

// The thread title field is shared; the rest becomes the post body. Max lengths keep the body,
// and a reply echoing it back, under Discord's 2,000 character message limit
const titleField: FormField = {
  id: 'title',
  label: 'Title',
  description: 'A short summary, used as the post title',
  style: TextInputStyle.Short,
  required: true,
  maxLength: 100,
};

export const submissionForms: Record<SubmissionType, SubmissionForm> = {
  idea: {
    modalTitle: 'Suggest an idea for the game',
    noun: 'idea',
    tag: typeTags.idea,
    fields: [
      titleField,
      {
        id: 'idea',
        label: 'Your idea',
        description: 'What should the game have or do?',
        style: TextInputStyle.Paragraph,
        required: true,
        maxLength: 1000,
      },
      {
        id: 'why',
        label: 'Why would it make the game better?',
        description: 'Optional',
        style: TextInputStyle.Paragraph,
        required: false,
        maxLength: 500,
      },
    ],
  },
  bug: {
    modalTitle: 'Report a bug in the game',
    noun: 'bug report',
    tag: typeTags.bug,
    fields: [
      titleField,
      {
        id: 'happened',
        label: 'What happened?',
        description: 'What went wrong, and where in the game',
        style: TextInputStyle.Paragraph,
        required: true,
        maxLength: 700,
      },
      {
        id: 'expected',
        label: 'What did you expect to happen?',
        description: 'Optional',
        style: TextInputStyle.Paragraph,
        required: false,
        maxLength: 400,
      },
      {
        id: 'steps',
        label: 'How can it be reproduced?',
        description: 'Optional: the steps that cause it, if you know them',
        style: TextInputStyle.Paragraph,
        required: false,
        maxLength: 400,
      },
      {
        id: 'version',
        label: 'Game version',
        description: 'Optional',
        style: TextInputStyle.Short,
        required: false,
        maxLength: 50,
      },
    ],
  },
};

// Submissions that still count against a member's cap
export const openStatusTags: TagName[] = [statusTags.new, statusTags.approved];

/**
 * The body of a forum post: who submitted it, then each answered field under its label
 */
export function buildPostContent(type: SubmissionType, submitterId: string, values: Record<string, string>): string {
  const sections = submissionForms[type].fields
    .filter(field => field.id !== titleField.id && values[field.id]?.trim())
    .map(field => `**${field.label}**\n${values[field.id]?.trim()}`);

  return [`Submitted by <@${submitterId}>`, ...sections].join('\n\n');
}

/**
 * The submitter recorded in a post body by buildPostContent, or null for posts made by hand
 */
export function parseSubmitterId(content: string): string | null {
  return /^Submitted by <@!?(\d+)>/m.exec(content)?.[1] ?? null;
}

/**
 * The member's own text, so a refused or failed submission isn't lost
 */
export function echoSubmission(type: SubmissionType, values: Record<string, string>): string {
  const title = values[titleField.id]?.trim() ?? '';
  const body = buildPostContent(type, '0', values).replace(/^Submitted by <@0>\n*/, '');

  // Strip backticks so the text can't close the code block early
  return `\`\`\`\n${`${title}\n\n${body}`.replaceAll('```', "'''").trim()}\n\`\`\``;
}
