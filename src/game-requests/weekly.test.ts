import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPoll, candidateList, isStale, rankCandidates, type Candidate } from './weekly.js';

const day = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-30T10:00:00');
const idea = (title: string, votes: number, daysOld: number): Candidate => ({
  title,
  url: `https://discord.com/channels/1/${title}`,
  votes,
  createdAt: new Date(now.getTime() - daysOld * day),
});

test('ranks by votes, then by how long the idea has waited, and keeps the top 5', () => {
  const ranked = rankCandidates([
    idea('a', 1, 2),
    idea('b', 4, 1),
    idea('c', 1, 9),
    idea('d', 0, 3),
    idea('e', 2, 1),
    idea('f', 0, 20),
  ]);

  assert.deepEqual(ranked.map(candidate => candidate.title), ['b', 'e', 'c', 'a', 'f']);
});

test('an idea is stale after 4 weeks with no votes', () => {
  assert.ok(isStale(idea('old', 0, 28), now));
  assert.ok(!isStale(idea('old but liked', 1, 60), now));
  assert.ok(!isStale(idea('recent', 0, 27), now));
});

test('builds a 24 hour multiple-choice poll with numbered answers that fit Discord', () => {
  const poll = buildPoll([idea('Grenades', 3, 1), idea('A very long idea title that goes well past the fifty-five character limit', 1, 1)]);

  assert.equal(poll.duration, 24);
  assert.equal(poll.allowMultiselect, true);
  assert.equal(poll.answers[0]?.text, '1. Grenades');
  assert.ok((poll.answers[1]?.text.length ?? 0) <= 55);
  assert.match(poll.answers[1]?.text ?? '', /^2\. A very long.*…$/);
});

test('lists the candidates with links and vote counts', () => {
  const list = candidateList([idea('[Big] hats', 3, 1)]);

  assert.match(list, /^This week's candidates/);
  assert.match(list, /\n1\. \[Big hats\]\(https:\/\/discord\.com\/channels\/1\/\[Big\] hats\) · 3 👍$/);
});
