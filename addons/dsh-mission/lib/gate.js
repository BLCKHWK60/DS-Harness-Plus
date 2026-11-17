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

/** Tabs that run Read Only by the owner's decisions (data-1, research-6): no mode and no run there yet. */
export const READ_ONLY_TABS = new Set(['data', 'research']);
/** `/mission` words that only look or take back: they work in a Read Only tab. */
const LOOK_WORDS = new Set(['', 'status', 'help', 'checkpoints', 'list']);

/** What `/mission` answers in a Read Only tab. */
export const READ_ONLY_TEXT = 'Mission is not available in this tab: Data and Research run Read Only, so the assistant cannot change your files here, and a Mission mode or run would lift that. Move the conversation to Cowork or Code to work with Mission, or start a Long run with the Run button next to Send (it can change files in this conversation\'s folder).';

/** What the Long run card says in a Read Only tab: allowed (the owner's choice), with a warning. */
export const READ_ONLY_LONG_TEXT = 'This tab is Read Only, but a Long run can change files in this conversation\'s folder.';

/**
 * Why Mission may not do something in a conversation.
 * @param {object} what - the conversation and the action.
 * @param {boolean} what.isolated - the conversation is isolated (the Modes add-on says so).
 * @param {{subagents?: boolean, label?: string, id?: string} | null} [what.tier] - its tier (`modelTiers.resolveTier`), if any.
 * @param {boolean} [what.helpers] - the action starts helper models: a run, or carrying one on.
 * @param {string} [what.word] - the `/mission` word, for the ones that only take back.
 * @param {string} [what.tab] - the conversation's tab (Modes' mode id): Data and Research refuse.
 * @param {boolean} [what.long] - the conversation's run is a Long run, which the owner allows in Data and Research too.
 * @param {boolean} [what.runs] - Recon keeps a Long run of an isolated conversation inside its rules.
 * @returns {string} the reason; '' when it may.
 */
export function whyNot({ isolated, tier = null, helpers = false, word, tab = '', long = false, runs = false }) {
  // In Recon only a Long run, and only where Recon keeps it inside its rules (`runs`, 16 November).
  if (isolated && !(runs && long) && !(typeof word === 'string' && UNDO_WORDS.has(word))) return ISOLATED_TEXT;
  if (READ_ONLY_TABS.has(String(tab)) && !long && !(typeof word === 'string' && (UNDO_WORDS.has(word) || LOOK_WORDS.has(word)))) return READ_ONLY_TEXT;
  if (helpers && tier?.subagents === false) return helpersOffText(tier);
  return '';
}

/** What the Long run card says in a Recon conversation, where Recon keeps the run inside its rules. */
/** A Bench conversation's Long run, checks on (the default) or off (Settings → Bench). */
export const BENCH_CHECKS_TEXT = 'Bench: the run checks its work, with the Mac\'s device ports closed to those checks. Its helpers run no commands. Checks can be switched off in Settings → Bench.';
export const BENCH_NO_CHECKS_TEXT = 'Bench: this run checks nothing by itself (checks are switched off in Settings → Bench): the reviewer judges each item by reading. Its helpers run no commands.';
/** A Recon Long run's checks: off (the default) or on without the internet (Settings → Recon). */
/** A Creator Plus conversation's Long run (Creator Plus decides, through its `longRunRules`). */
export const CREATOR_CHECKS_TEXT = 'Creator Plus: the run checks its work with commands that have no internet, see only the run\'s folder, get no keys, and can start only the usual check programs (never launchctl, open or a program it wrote); its helpers run no commands.';
/** A Long run in the Creator Plus tab: switched off for now (its checks run in the conversation's live folder). */
export const CREATOR_LONG_OFF_TEXT = 'Long runs in Creator Plus are switched off until their checks can run on a throwaway copy; use Thorough for now.';
/** A plain /mission run in the Creator Plus tab: refused (its checks would run outside Creator Plus's rules). */
export const CREATOR_NO_MISSION_TEXT = 'In the Creator Plus tab, /mission is not available: its checks would run outside Creator Plus\'s rules. Use a Long run (the Run button), whose checks run fenced.';
export const RECON_CHECKS_TEXT = 'Recon: the run checks its work with commands that have no internet, see only the run\'s folder and can start only the usual check programs (never launchctl, open or a program it wrote). Switch this off in Settings → Recon.';
export const RECON_NO_CHECKS_TEXT = 'Recon: the run runs no commands; the reviewer judges each item by reading. Checks without the internet can be switched on in Settings → Recon.';
export const RECON_LONG_TEXT = 'A Recon conversation: its helpers use this conversation\'s model and Recon\'s tools, with files only in the run\'s own folder in Recon\'s room, and run no programs or commands. End and wipe deletes the run too.';
