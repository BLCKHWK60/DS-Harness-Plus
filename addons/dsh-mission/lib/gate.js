/**
 * Where Mission does not work: in an isolated conversation (Recon), which other add-ons leave
 * alone, and, for a run, on a tier whose sub-agents are switched off (a run's planner, workers and
 * reviewer are sub-agents). Kept apart from the plugin so it can be tested without the app.
 */

/** `/mission` words that only take back a mode or a run an earlier version started; they still work in an isolated conversation. */
export const UNDO_WORDS = new Set(['off', 'stop', 'pause', 'end', 'finish']);

/** What `/mission` and `mission_step` answer in an isolated conversation. */
export const ISOLATED_TEXT = 'Mission is not available here: this is an isolated conversation (Recon), and other add-ons leave it alone.';

/**
 * What a run answers on a tier with sub-agents off.
 * @param {{label?: string, id?: string} | null | undefined} tier - the conversation's tier, as Model Tiers gives it.
 * @returns {string} the reason, with what the user can do.
 */
export function helpersOffText(tier) {
  const name = String(tier?.label ?? tier?.id ?? '').trim();
  return `A mission run needs helper models (sub-agents), and this conversation's tier${name ? `, ${name},` : ''} has Sub-agents switched off. Switch them on for that tier in Settings → Model Tiers, or give this conversation another tier. The modes and checkpoints (/mission restricted, ask, auto, checkpoints, back) still work.`;
}

/**
 * Why Mission may not do something in a conversation.
 * @param {object} what - the conversation and the action.
 * @param {boolean} what.isolated - the conversation is isolated (the Modes add-on says so).
 * @param {{subagents?: boolean, label?: string, id?: string} | null} [what.tier] - its tier (`modelTiers.resolveTier`), if any.
 * @param {boolean} [what.helpers] - the action starts helper models: a run, or carrying one on.
 * @param {string} [what.word] - the `/mission` word, for the ones that only take back.
 * @returns {string} the reason; '' when it may.
 */
export function whyNot({ isolated, tier = null, helpers = false, word }) {
  if (isolated && !(typeof word === 'string' && UNDO_WORDS.has(word))) return ISOLATED_TEXT;
  if (helpers && tier?.subagents === false) return helpersOffText(tier);
  return '';
}
