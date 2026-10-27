import type { PollData } from 'discord.js';

// Fridays at 10:00 (container timezone), so the result is in before the weekend
export const weeklyVoteSchedule = '00 00 10 * * 5';
// Discord allows up to 10 answers; 5 keeps the poll quick to read
export const pollSize = 5;
// Closes Saturday at 10:00; Discord posts the results itself
export const pollHours = 24;
// New ideas this old with no votes are closed before the poll
export const staleAfterWeeks = 4;

const pollAnswerMaxLength = 55;
const weekMs = 7 * 24 * 60 * 60 * 1000;

export const staleReason = `It didn't get any votes in ${staleAfterWeeks} weeks, so it was closed to keep the list tidy. `
  + 'An approver can reopen it if interest picks up!';

// 'new': New ideas, to help choose what to approve. 'build-next': the fallback when there are
// too few New ideas, polling approved ideas that haven't shipped yet
export type PollKind = 'new' | 'build-next';

const pollQuestions: Record<PollKind, string> = {
  'new': 'Which ideas should go into the game next?',
  'build-next': 'Which approved idea should be built next?',
};

// Posted instead of a poll when there are too few ideas of either kind
export const noVoteNudge = 'Not enough ideas for a vote this week. Got one? Suggest it with /idea';

export interface Candidate {
  title: string;
  url: string;
  // 👍 reactions on the post, not counting the bot's own
  votes: number;
  createdAt: Date;
}

/**
 * The most-voted ideas first; on a tie, the one that has waited longest
 */
export function rankCandidates(candidates: readonly Candidate[], limit = pollSize): Candidate[] {
  return [...candidates]
    .sort((a, b) => b.votes - a.votes || a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, limit);
}

export function isStale({ votes, createdAt }: Candidate, now: Date): boolean {
  return votes === 0 && now.getTime() - createdAt.getTime() >= staleAfterWeeks * weekMs;
}

const truncate = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

/**
 * A multiple-choice poll of the candidates, numbered to match candidateList
 */
export function buildPoll(candidates: readonly Candidate[], kind: PollKind = 'new'): PollData {
  return {
    question: { text: pollQuestions[kind] },
    answers: candidates.map((candidate, i) => {
      const prefix = `${i + 1}. `;
      return { text: `${prefix}${truncate(candidate.title, pollAnswerMaxLength - prefix.length)}` };
    }),
    duration: pollHours,
    allowMultiselect: true,
  };
}

/**
 * The message after the poll, linking each candidate's post so people can read it first
 */
export function candidateList(candidates: readonly Candidate[], kind: PollKind = 'new'): string {
  const lines = candidates.map((candidate, i) => {
    // Brackets in a title would break the link markdown
    const title = truncate(candidate.title, 100).replace(/[[\]]/g, '');
    return `${i + 1}. [${title}](${candidate.url}) · ${candidate.votes} 👍`;
  });

  if (kind === 'build-next') {
    return [
      `Not enough new ideas for a vote this week, so here are approved ideas still waiting to be built. Which should come next? Vote above! The poll closes in ${pollHours} hours.`,
      ...lines,
    ].join('\n');
  }

  return [`This week's candidates, from the ideas with the most 👍. Read them, then vote above! The poll closes in ${pollHours} hours.`, ...lines].join('\n');
}
