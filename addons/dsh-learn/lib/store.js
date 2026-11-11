/**
 * The record of what was studied: topics, their ideas and questions, how each
 * idea went, and when it comes back. Kept as one small file under the dsh home.
 *
 * It holds no text the learner wrote: only the outcome of each try.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { schedule } from './schedule.js';

const MAX_TOPICS = 300;
const MAX_IDEAS = 12;
const MAX_HISTORY = 40;
export const SOURCES = ['pdf', 'notes', 'topic', 'code'];

const text = (value, max) => (typeof value === 'string' || typeof value === 'number' ? String(value).replace(/\s+/g, ' ').trim().slice(0, max) : '');
const id = () => randomBytes(5).toString('hex');

/**
 * Clean up a study plan a model wrote.
 * @param {unknown} raw - `{title, source: {kind, ref}, ideas: [{title, question}]}`.
 * @returns {{topic?: object, error?: string}} a topic ready to store, or what is wrong.
 */
export function readPlan(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'Send a plan with "title" and "ideas".' };
  const title = text(raw.title, 120);
  if (!title) return { error: 'The plan needs a "title": what is being studied.' };
  const kind = SOURCES.includes(raw.source?.kind) ? raw.source.kind : 'topic';
  const ideas = [];
  for (const item of Array.isArray(raw.ideas) ? raw.ideas : []) {
    const ideaTitle = text(item?.title, 100);
    const question = text(item?.question, 400);
    if (!ideaTitle || !question) return { error: 'Every idea needs a "title" (a few words) and a "question" the learner can try before being taught.' };
    ideas.push({ id: id(), title: ideaTitle, question, step: -1, due: null, history: [] });
  }
  if (ideas.length < 2) return { error: 'A plan needs at least 2 ideas, each a small step. 5 to 9 is a good number.' };
  if (ideas.length > MAX_IDEAS) return { error: `${ideas.length} ideas are too many for one session (the limit is ${MAX_IDEAS}). Make the plan smaller; the rest can be a second topic.` };
  return { topic: { id: id(), title, source: { kind, ref: text(raw.source?.ref, 300) }, createdAt: Date.now(), ideas } };
}

/**
 * Open the record.
 * @param {string} dir - folder; created when missing. Empty keeps everything in memory.
 * @returns {object} the store.
 */
export function openStore(dir) {
  const file = dir ? join(dir, 'topics.json') : '';
  let topics = [];
  if (file) {
    try {
      mkdirSync(dir, { recursive: true });
      const kept = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
      if (Array.isArray(kept)) topics = kept.filter((topic) => topic && typeof topic.id === 'string' && Array.isArray(topic.ideas));
    } catch {
      topics = [];
    }
  }
  const save = () => {
    if (!file) return;
    const temp = `${file}.tmp`;
    writeFileSync(temp, JSON.stringify(topics));
    renameSync(temp, file);
  };

  return {
    topics: () => topics,
    topic: (topicId) => topics.find((topic) => topic.id === topicId),

    /** @param {object} topic - from `readPlan`. @returns {object} the stored topic. */
    add(topic) {
      topics.push(topic);
      if (topics.length > MAX_TOPICS) topics = topics.slice(-MAX_TOPICS);
      save();
      return topic;
    },

    /**
     * Record how an idea went and set its next review.
     * @param {string} topicId - the topic.
     * @param {string} ideaId - the idea.
     * @param {'alone' | 'hints' | 'shown'} outcome - how it went.
     * @param {number} hints - hints used.
     * @param {number} [now] - the time.
     * @returns {{days: number, due: number} | undefined} when it comes back.
     */
    record(topicId, ideaId, outcome, hints, now = Date.now()) {
      const idea = topics.find((topic) => topic.id === topicId)?.ideas.find((item) => item.id === ideaId);
      if (!idea) return undefined;
      const next = schedule(idea.step, outcome, now);
      idea.step = next.step;
      idea.due = next.due;
      idea.history = [...(idea.history ?? []), { at: now, outcome, hints }].slice(-MAX_HISTORY);
      save();
      return { days: next.days, due: next.due };
    },

    /** @param {string} topicId - the topic to forget. @returns {boolean} true when it was there. */
    remove(topicId) {
      const before = topics.length;
      topics = topics.filter((topic) => topic.id !== topicId);
      if (topics.length !== before) save();
      return topics.length !== before;
    },

    /** Counts for the progress page. */
    stats() {
      const tries = topics.flatMap((topic) => topic.ideas.flatMap((idea) => idea.history ?? []));
      const count = (outcome) => tries.filter((item) => item.outcome === outcome).length;
      return { topics: topics.length, ideas: topics.reduce((total, topic) => total + topic.ideas.length, 0), tries: tries.length, alone: count('alone'), hints: count('hints'), shown: count('shown') };
    },
  };
}
