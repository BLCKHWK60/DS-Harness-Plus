/**
 * When an idea comes back. Each time it is solved alone it moves one step
 * further out; needing hints keeps it where it is; needing the answer brings it
 * back to the first step.
 */

/** Days until the next review, by step. */
export const INTERVALS = [1, 3, 7, 16, 35];
const DAY = 86_400_000;

/**
 * @param {number} step - the idea's step so far; -1 for an idea never finished before.
 * @param {'alone' | 'hints' | 'shown'} outcome - how it went this time.
 * @param {number} now - the time, in milliseconds.
 * @returns {{step: number, due: number, days: number}} the new step and when it is due.
 */
export function schedule(step, outcome, now) {
  const from = Number.isInteger(step) ? Math.min(INTERVALS.length - 1, Math.max(-1, step)) : -1;
  let next;
  if (outcome === 'alone') next = Math.min(INTERVALS.length - 1, from + 1);
  else if (outcome === 'hints') next = Math.max(0, from);
  else next = 0;
  return { step: next, due: now + INTERVALS[next] * DAY, days: INTERVALS[next] };
}

/**
 * Ideas that are due, oldest first.
 * @param {object[]} topics - every topic with its ideas.
 * @param {number} now - the time.
 * @returns {Array<{topicId: string, topic: string, ideaId: string, title: string, question: string, due: number, step: number}>} what to review.
 */
export function dueIdeas(topics, now) {
  const out = [];
  for (const topic of topics) {
    for (const idea of topic.ideas) {
      if (Number.isFinite(idea.due) && idea.due <= now) out.push({ topicId: topic.id, topic: topic.title, ideaId: idea.id, title: idea.title, question: idea.question, due: idea.due, step: idea.step });
    }
  }
  return out.sort((a, b) => a.due - b.due);
}

/**
 * "today", "tomorrow", "in 3 days", "2 days ago".
 * @param {number} due - when.
 * @param {number} now - the time.
 * @returns {string} words.
 */
export function whenText(due, now) {
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

function startOfDay(time) {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
