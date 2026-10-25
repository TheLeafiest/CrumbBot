import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type APIInteractionGuildMember, type GuildMember } from 'discord.js';
import { statusTags, typeTags, type TagName } from './forum.js';
import type { SubmissionType } from './posts.js';

export type Status = (typeof statusTags)[keyof typeof statusTags];
export type TriageAction = 'approve' | 'decline' | 'duplicate' | 'shipped' | 'reopen';

export const triageButtonPrefix = 'gr:triage:';
export const triageReasonPrefix = 'gr:reason:';

interface ActionSpec {
  label: string;
  style: ButtonStyle;
  to: Status;
  // Decided posts are locked and archived; reopening undoes that
  closes: boolean;
}

export const triageActions: Record<TriageAction, ActionSpec> = {
  approve: { label: 'Approve', style: ButtonStyle.Success, to: statusTags.approved, closes: false },
  decline: { label: 'Decline', style: ButtonStyle.Danger, to: statusTags.declined, closes: true },
  duplicate: { label: 'Duplicate', style: ButtonStyle.Secondary, to: statusTags.duplicate, closes: true },
  shipped: { label: 'Shipped', style: ButtonStyle.Primary, to: statusTags.shipped, closes: true },
  reopen: { label: 'Reopen', style: ButtonStyle.Secondary, to: statusTags.new, closes: false },
};

// Which decisions make sense from each status; anything else is a stale button
export const actionsByStatus: Record<Status, TriageAction[]> = {
  New: ['approve', 'decline', 'duplicate'],
  Approved: ['shipped', 'decline'],
  Declined: ['reopen'],
  Duplicate: ['reopen'],
  Shipped: ['reopen'],
};

export const isTriageAction = (action: string): action is TriageAction => Object.hasOwn(triageActions, action);

/**
 * The buttons shown on a post with the given status
 */
export function triageRow(status: Status): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(actionsByStatus[status].map(action => new ButtonBuilder()
    .setCustomId(`${triageButtonPrefix}${action}`)
    .setLabel(triageActions[action].label)
    .setStyle(triageActions[action].style)));
}

/**
 * The post's status and type, read from its applied forum tags
 */
export function readTags(appliedTags: readonly string[], tagIds: ReadonlyMap<TagName, string>) {
  const has = (name: TagName) => appliedTags.includes(tagIds.get(name) ?? '');
  const status = Object.values(statusTags).find(has) ?? null;
  const type: SubmissionType = has(typeTags.bug) ? 'bug' : 'idea';

  return { status, type };
}

/**
 * The applied tags after a status change: the old status tag swapped for the new one, other
 * tags (Idea/Bug, or any Kale added by hand) kept
 */
export function nextTags(appliedTags: readonly string[], tagIds: ReadonlyMap<TagName, string>, to: Status): string[] {
  const statusIds = new Set(Object.values(statusTags).map(name => tagIds.get(name)));
  const toId = tagIds.get(to);

  return [...appliedTags.filter(id => !statusIds.has(id)), ...(toId ? [toId] : [])];
}

/**
 * Whether an interaction's member has the role. Members arrive as a full GuildMember when
 * cached, or as raw API data with a list of role ids
 */
export function hasRole(member: GuildMember | APIInteractionGuildMember | null, roleId: string): boolean {
  if (!member) {
    return false;
  }

  return Array.isArray(member.roles) ? member.roles.includes(roleId) : (member as GuildMember).roles.cache.has(roleId);
}

/**
 * The thread id in a pasted post link (https://discord.com/channels/<guild>/<thread>) or
 * channel mention (<#thread>), or a bare id
 */
export function parseThreadReference(text: string): string | null {
  const trimmed = text.trim();

  return /discord(?:app)?\.com\/channels\/\d+\/(\d+)/.exec(trimmed)?.[1]
    ?? /^<#(\d+)>$/.exec(trimmed)?.[1]
    ?? /^(\d{15,25})$/.exec(trimmed)?.[1]
    ?? null;
}

interface OutcomeDetails {
  submitterId: string | null;
  type: SubmissionType;
  approverName: string;
  reason?: string;
  originalThreadId?: string;
}

/**
 * The message posted in the thread when a decision is made, addressed to the submitter
 */
export function outcomeMessage(action: TriageAction, { submitterId, type, approverName, reason, originalThreadId }: OutcomeDetails): string {
  const noun = type === 'bug' ? 'bug report' : 'idea';
  const to = submitterId ? `<@${submitterId}> ` : '';

  const body = {
    approve: type === 'bug'
      ? `Your bug report was confirmed, and it's on the list to fix.`
      : `Your idea was approved, and it's on the list for the game!`,
    decline: `Your ${noun} wasn't picked up this time.${reason ? `\n> ${reason.replaceAll('\n', '\n> ')}` : ''}`,
    duplicate: `This one is already covered in <#${originalThreadId}>, so this post is closed. Add your vote and thoughts there!`,
    shipped: type === 'bug' ? 'This bug is fixed in the game! 🎉' : 'Your idea is in the game! 🎉',
    reopen: 'This post was reopened.',
  }[action];

  return `${to}${body}\n-# ${action === 'reopen' ? 'Reopened' : 'Decided'} by ${approverName}`;
}
