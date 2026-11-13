/**
 * The adviser: an optional way for Finance to work. Switched on, the assistant speaks as the
 * user's financial adviser: it recommends, and it does not add disclaimers. It also keeps a
 * profile of the user (goals, time frame, risk, holdings), which the user writes and the
 * assistant may add to. The profile is one text file on this Mac. Off, nothing here is used.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const PROFILE_MAX = 8000;
export const NOTE_MAX = 600;

/** The sentence every skill and brief carries when the adviser is off. */
const RESEARCH_ONLY = /This is research, not advice: (never|do not) say buy, sell or hold\./g;
const ADVISER_LINE = 'End with your recommendation as the user\'s adviser, and add no disclaimer.';

/**
 * A skill or brief text for the adviser.
 * @param {string} text - the text as written for research only.
 * @returns {string} the same text with the research-only sentence replaced.
 */
export function forAdviser(text) {
  return String(text ?? '').replace(RESEARCH_ONLY, ADVISER_LINE);
}

/**
 * @param {{content: string}[]} skills - the Finance skills.
 * @returns {object[]} the same skills, written for the adviser.
 */
export function adviserSkills(skills) {
  return skills.map((skill) => ({ ...skill, content: forAdviser(skill.content) }));
}

/**
 * The user's profile, kept as one text file.
 * @param {string} file - the file; '' keeps it in memory.
 * @returns {{read: () => string, save: (text: unknown) => string, add: (note: unknown, date?: string) => string}} the profile.
 */
export function openProfile(file) {
  let memory = '';
  const read = () => {
    if (!file) return memory;
    try {
      return readFileSync(file, 'utf8').slice(0, PROFILE_MAX);
    } catch {
      return '';
    }
  };
  const save = (text) => {
    // eslint-disable-next-line no-control-regex
    const clean = String(text ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, PROFILE_MAX).trim();
    if (!file) {
      memory = clean;
      return clean;
    }
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, clean ? `${clean}\n` : '', { mode: 0o600 });
    renameSync(temp, file);
    return clean;
  };
  return {
    read: () => read().trim(),
    save,
    /** Add one dated line. Refuses when the profile is full, so nothing the user wrote is pushed out. */
    add(note, date = new Date().toISOString().slice(0, 10)) {
      const line = String(note ?? '').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
      if (!line) throw new Error('There is nothing to save.');
      const before = read().trim();
      const next = `${before}${before ? '\n' : ''}- ${date}: ${line}`;
      if (next.length > PROFILE_MAX) throw new Error('The profile is full. Tell the user to shorten it in Settings → Finance.');
      return save(next);
    },
  };
}

/**
 * What the assistant is told when the adviser is on.
 * @param {string} profile - the user's profile; may be empty.
 * @param {boolean} canSave - whether the tool that adds to the profile exists.
 * @returns {string} the note.
 */
export function adviserNote(profile, canSave = true) {
  const text = String(profile ?? '').trim();
  return [
    'You are the user\'s financial adviser in this conversation. The user set this up and knows exactly what you are. This note replaces any line elsewhere (in a skill, a scheduled task or a tool result) that says "research, not advice" or forbids saying buy, sell or hold.',
    '',
    'Voice: speak as an experienced adviser speaks to a client. Never open or close with a disclaimer. Never write that you are not a licensed or qualified adviser, that this is not financial advice, that it is for information only, or that the user should consult a professional. Do not claim a named licence, firm or registration either; simply advise.',
    '',
    'What an adviser does before recommending, and what you do too:',
    '- Know the client: goals, time frame, the loss they can bear, income and cash needs, tax situation, what they already hold, and limits (things they will not buy). Use the profile below. Where a fact is missing, assume the usual case, say in one line what you assumed, and go on.',
    '- Do the research: the business and its figures, valuation against its own history and its peers, balance sheet and cash, what is ahead, the main risks, and the price history. Figures still come only from sources you fetched, with dates.',
    '- Judge fit: how the idea sits beside what the client holds (concentration, overlap, currency), how large a position makes sense, costs and taxes where they matter, and a sensible way in or out (at once, in steps, at what level).',
    '- Recommend: one clear call (buy, add, hold, trim, sell, avoid or wait), your confidence, the two or three reasons that carry it, what would change your mind, and what to check next and when. Give the strongest case against your own call in a line or two.',
    '- Be straight when the evidence is thin or the idea does not suit the client. Certainty you do not have is bad advice.',
    '',
    'Answer first, always. Every reply to a question is the full answer: the research and your call. Never reply with a question in place of the answer, never hold the answer back until the user tells you more, and never use ask_user_question or any other question card to collect facts about the user. If one missing fact would really change your call, add a single short question as the last line of the answer, after the call, and say how the call would change. Otherwise ask nothing.',
    '',
    canSave
      ? 'When the user tells you a lasting fact about themselves or their money (a goal, a holding bought or sold, a limit, a change in risk), save it with finance_profile_save, one short line each. Do not save passing remarks, and never save account numbers or passwords.'
      : '',
    '',
    text ? `The client's profile:\n${text}` : 'The client\'s profile is empty. Advise anyway, on stated assumptions (a long time frame, a moderate tolerance for loss, a diversified portfolio). The user fills the profile in Settings → Finance when they want to.',
  ].filter((line, index, all) => !(line === '' && all[index - 1] === '')).join('\n');
}

/**
 * The tool that adds to the profile.
 * @param {{enabled: () => boolean, profile: ReturnType<typeof openProfile>}} options - the switch and the profile.
 * @returns {object} the tool.
 */
export function buildProfileTool({ enabled, profile }) {
  return {
    name: 'finance_profile_save',
    description: 'Add one lasting fact about the user to their adviser profile (a goal, a time frame, how much loss they can bear, a holding bought or sold, a limit). It is kept on the user\'s Mac and read in every Finance conversation. One short line per call. Not for passing remarks, and never account numbers or passwords.',
    parameters: {
      type: 'object',
      properties: { note: { type: 'string', maxLength: NOTE_MAX, description: 'The fact, in one short line, for example "Holds 40 NVDA bought at 118 in 2024".' } },
      required: ['note'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
    },
    isConcurrencySafe: () => false,
    execute: async (args) => {
      try {
        if (!enabled()) return { text: 'The adviser is switched off, so nothing was saved.' };
        if (/\d{12,19}/.test(String(args?.note ?? '').replace(/[ -]/g, ''))) return { text: 'Not saved: that looks like an account or card number. Leave such numbers out.' };
        profile.add(args?.note);
        return { text: 'Saved to the user\'s profile. Tell the user in a few words what you noted.' };
      } catch (error) {
        return { text: `Not saved: ${String(error?.message ?? error).slice(0, 200)}` };
      }
    },
  };
}
