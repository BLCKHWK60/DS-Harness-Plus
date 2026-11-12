/**
 * Scheduled briefs: a recurring Finance update on something you follow, run by the app's own
 * scheduler (Automation tasks). Kept apart from the plugin so it can be tested without the app.
 */
import { cleanName } from './finance.js';

/** Every brief's task name starts with this, which is how briefs are told apart from other tasks. */
export const BRIEF_PREFIX = 'Finance brief: ';

/** How often a brief can run. */
export const RHYTHMS = [
  { id: 'weekdays', label: 'Every weekday', rule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', window: 'since the previous working day' },
  { id: 'weekly', label: 'Every Monday', rule: 'FREQ=WEEKLY;BYDAY=MO', window: 'in the last week' },
  { id: 'monthly', label: 'On the 1st of each month', rule: 'FREQ=MONTHLY;BYMONTHDAY=1', window: 'in the last month' },
];

/**
 * The task's name for a subject.
 * @param {unknown} subject - what the brief is about.
 * @returns {string} the name.
 */
export const briefTitle = (subject) => `${BRIEF_PREFIX}${cleanName(subject)}`;

/**
 * When a brief runs, in the scheduler's own form.
 * @param {string} rhythm - an id of `RHYTHMS`.
 * @param {number} hour - the hour of the day, 0 to 23, in the given time zone.
 * @param {string} zone - an IANA time zone, for example Europe/Berlin.
 * @param {Date} [now] - today.
 * @returns {string} a start line and a rule line.
 */
export function briefRule(rhythm, hour, zone, now = new Date()) {
  const found = RHYTHMS.find((item) => item.id === rhythm) ?? RHYTHMS[0];
  const at = Math.min(23, Math.max(0, Math.floor(Number(hour))));
  const two = (value) => String(value).padStart(2, '0');
  const day = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`;
  if (!/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(String(zone))) throw new Error('The time zone is not valid.');
  return `DTSTART;TZID=${zone}:${day}T${two(Number.isFinite(at) ? at : 8)}0000\nRRULE:${found.rule}`;
}

/**
 * What the scheduler hands the assistant each time the brief is due. The conversation is moved to
 * Finance mode when it opens; the instruction still carries the rules that matter, in case Finance
 * is switched off by then.
 * @param {unknown} subject - what the brief is about.
 * @param {unknown} market - the market to stay in.
 * @param {string} rhythm - an id of `RHYTHMS`.
 * @returns {string} the instruction.
 */
export function briefPrompt(subject, market, rhythm) {
  const found = RHYTHMS.find((item) => item.id === rhythm) ?? RHYTHMS[0];
  const where = cleanName(market) && cleanName(market) !== 'Global' ? ` Market: ${cleanName(market)} only.` : ' Market: global.';
  return [
    `Write a short Finance brief on "${cleanName(subject)}": what has changed ${found.window}.${where}`,
    'Use the finance-what-changed skill. If the finance_company_figures, finance_company_filings or finance_source_get tools are available, use them before web search for what they cover.',
    'Rules: every figure must come from a source you fetched now, with its source and date, never from memory. Keep reported facts, management\'s claims, other people\'s opinions and your own reading apart. Say what you could not find. This is research, not advice: do not say buy, sell or hold.',
    'Keep it short: the three to six things that changed, most important first, then what to watch next with dates, then the sources. If nothing of note changed, say so in one line.',
  ].join('\n');
}

/**
 * The scheduler's tasks that messages put into a conversation's inbox belong to, and the market
 * their instruction names.
 * @param {unknown} inserted - the `inserted` list of an `agent/inbox/spliced` event.
 * @returns {{ids: string[], market: string}} task ids (empty when none came from the scheduler) and the market.
 */
export function scheduledIn(inserted) {
  const ids = [];
  let market = '';
  for (const item of Array.isArray(inserted) ? inserted : []) {
    const message = item?.message ?? item;
    if (message?.source?.kind !== 'schedule') continue;
    const text = (Array.isArray(message.content) ? message.content : []).map((block) => (block?.type === 'text' ? String(block.text ?? '') : '')).join('\n');
    if (!text.trimStart().startsWith('[SCHEDULE REMINDER')) continue;
    const one = /^schedule_id_json: (.+)$/m.exec(text);
    if (one) {
      try {
        ids.push(String(JSON.parse(one[1])));
      } catch {
        /* not a task id */
      }
    }
    const many = /^reminders_json: (.+)$/m.exec(text);
    if (many) {
      try {
        for (const entry of JSON.parse(many[1])) if (entry?.schedule_id) ids.push(String(entry.schedule_id));
      } catch {
        /* not a list */
      }
    }
    const named = /Market: ([^.\\"]{1,80}) only\./.exec(text);
    if (named) market = named[1].trim();
  }
  return { ids: [...new Set(ids)], market };
}

/**
 * The briefs among the scheduler's tasks.
 * @param {object[]} catalog - the scheduler's tasks.
 * @returns {{id: string, subject: string, status: string, nextAt?: string}[]} the briefs that have not ended.
 */
export function briefsOf(catalog) {
  return (Array.isArray(catalog) ? catalog : [])
    .filter((task) => String(task?.title ?? '').startsWith(BRIEF_PREFIX) && task?.status !== 'ended')
    .map((task) => ({ id: String(task.id), subject: String(task.title).slice(BRIEF_PREFIX.length), status: String(task.status ?? 'active'), nextAt: task.status === 'active' ? task.scheduledAt : undefined }));
}
