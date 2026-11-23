/**
 * Where Mission does not work: in an isolated conversation (Recon), which other add-ons leave
 * alone, and, for a run, on a tier whose sub-agents are switched off (a run's planner, workers and
 * reviewer are sub-agents). Kept apart from the plugin so it can be tested without the app.
 *
 * Item 4A, stage 6a: the space keeps its rules for any mode. A thread in the Recon space is sealed
 * whatever its mode; in Devices and Workshop a Mission runs only under the rules the space's add-on
 * gives (Devices, Creator Plus), and is refused when that add-on gives none (fail closed). The Read
 * Only tab refusal does not fire in a guarded space: the space's own rules decide there.
 */

/** `/mission` words that only take back a mode or a run an earlier version started; they still work in an isolated conversation. */
export const UNDO_WORDS = new Set(['off', 'stop', 'pause', 'end', 'finish']);

/** What `/mission` and `mission_step` answer in an isolated conversation (item 4A, stage 6a: reworded, any mode in Recon). */
export const ISOLATED_TEXT = 'Mission is not available here: this thread is in Recon (sealed), and other add-ons leave it alone.';

/** Item 4A, stage 6a: the spaces whose own rules hold for every mode (Modes' `GUARDED_SPACES`, copied: no import across add-ons). */
export const GUARDED_SPACES = Object.freeze(['devices', 'recon', 'workshop']);
/** Which add-on gives a guarded space's rules for a Mission, and its name in Settings. */
export const SPACE_ADDONS = Object.freeze({ devices: 'Devices', workshop: 'Creator Plus', recon: 'Recon' });
const SPACE_NAMES = Object.freeze({ devices: 'Devices', workshop: 'Workshop', recon: 'Recon' });
/**
 * Item 4A, stage 6a: a Mission in Devices or Workshop whose add-on gives no rules (off, too old, or the space could
 * not be read): refused, with what to switch on.
 * @param {string} space - 'devices', 'workshop', or anything else (a space that could not be read).
 * @param {string} [_lang] - still accepted from older callers and ignored: Plus is English only (stage 7).
 * @returns {string}
 */
export function MISSION_NO_SPACE_RULES(space, _lang = 'en') {
  const key = Object.hasOwn(SPACE_ADDONS, String(space)) && space !== 'recon' ? space : '';
  if (!key) {
    return 'Mission is not available here: this thread\'s space could not be read, so its rules are not known. Start the Mission in the Chat or Code space.';
  }
  const where = SPACE_NAMES[key];
  const addon = SPACE_ADDONS[key];
  // Lab re-check 2 (6a, problem 4): an add-on that is off has no Settings page, so point to the Plugins page (as Modes does).
  return `Mission is not available here: the rules for a Mission in ${where} come from ${addon}, which is off or too old. Switch on ${addon} on the Plugins page (or update it), or start the Mission in the Chat or Code space.`;
}

/**
 * What a run answers on a tier with sub-agents off.
 * @param {{label?: string, id?: string} | null | undefined} tier - the conversation's tier, as Model Tiers gives it.
 * @returns {string} the reason, with what the user can do.
 */
export function helpersOffText(tier) {
  const name = String(tier?.label ?? tier?.id ?? '').trim();
  return `A Mission needs helper models (sub-agents), and this thread's tier${name ? `, ${name},` : ''} has Sub-agents switched off. Switch them on for that tier in Settings → Model tiers, or give this thread another tier. Mission access and checkpoints (/mission restricted, ask, auto, checkpoints, back) still work.`;
}

/** Tabs that run Read Only by the owner's decisions (data-1, research-6): no mode and no run there yet. */
export const READ_ONLY_TABS = new Set(['data', 'research']);
/** `/mission` words that only look or take back: they work in a Read Only tab. */
const LOOK_WORDS = new Set(['', 'status', 'help', 'checkpoints', 'list']);

/** What `/mission` answers in a Read Only tab. */
export const READ_ONLY_TEXT = 'The /mission access levels are not available in this mode: Data and Research run Read Only. A Mission works here: type /mission and what it should do, or press Start Mission. It may change files in this thread\'s folder while it runs, and Read Only comes back when it ends.';

/** What the Mission settings say in a Read Only tab: allowed with Start Mission (the owner's choice), with a warning. */
export const READ_ONLY_LONG_TEXT = 'This mode is Read Only, but a Mission can change files in this thread\'s folder.';
/** Review of stage E: said after a typed /mission in a Read Only tab (it has no confirm card to warn on). */
export const READ_ONLY_TYPED_TEXT = `${READ_ONLY_LONG_TEXT} Read Only comes back when it ends.`;

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
 * @param {boolean} [what.goal] - a typed /mission with a goal (stage E, point 12): a Mission, allowed where Start Mission is.
 * @param {string} [what.space] - item 4A, stage 6a: the thread's space ('' when not known or no Modes); 'unknown' when it
 *   could not be read (fail closed, as a guarded space with no rules).
 * @param {boolean} [what.spaceRules] - item 4A, stage 6a: the space's add-on gives a Mission its rules (Devices, Creator Plus).
 * @returns {string} the reason; '' when it may.
 */
export function whyNot({ isolated, tier = null, helpers = false, word, tab = '', long = false, runs = false, goal = false, space = '', spaceRules = true }) {
  const undo = typeof word === 'string' && UNDO_WORDS.has(word);
  // In Recon only a Mission, and only where Recon keeps it inside its rules (`runs`, 16 November); typed too (stage E).
  // Item 4A, stage 6a: any mode in the Recon space is sealed.
  const sealed = isolated || space === 'recon';
  if (sealed && !(runs && (long || goal)) && !undo) return ISOLATED_TEXT;
  // Item 4A, stage 6a: in Devices and Workshop the space's add-on gives the rules; none (off, too old) means no Mission.
  if ((space === 'devices' || space === 'workshop' || space === 'unknown') && !spaceRules && !undo) return MISSION_NO_SPACE_RULES(space);
  // The Read Only tab refusal does not fire in a guarded space (stage 6a): the space's rules decide there.
  const guarded = GUARDED_SPACES.includes(String(space));
  if (!guarded && READ_ONLY_TABS.has(String(tab)) && !long && !goal && !(typeof word === 'string' && (undo || LOOK_WORDS.has(word)))) return READ_ONLY_TEXT;
  if (helpers && tier?.subagents === false) return helpersOffText(tier);
  return '';
}

/** What the Long run card says in a Recon conversation, where Recon keeps the run inside its rules. */
/** A Bench conversation's Long run, checks on (the default) or off (Settings → Bench). */
export const BENCH_CHECKS_TEXT = 'Devices: the run checks its work, with the Mac\'s device ports closed to those checks, no internet, no keys, nothing read outside the run\'s folder (the Devices folder and its backups never), and no hidden files or Git hooks written. Its helpers run no commands. Checks can be switched off in Settings → Devices.';
/**
 * Item 4A, stage 6a: a Devices Mission (any mode) in a folder Devices keeps closed (the whole disk, the home folder,
 * the Library, the app's data or the app itself).
 * @param {string} why - the short reason.
 * @param {string} [_lang] - still accepted from older callers and ignored: Plus is English only (stage 7).
 * @returns {string} the sentence.
 */
export function DEVICES_FOLDER_TEXT(why, _lang = 'en') {
  const reason = String(why ?? '').slice(0, 120);
  return `Devices: a Mission cannot work in this folder (${reason}). Devices does not allow writing there. Pick a project folder of its own for this thread.`;
}
export const BENCH_NO_CHECKS_TEXT = 'Devices: this run checks nothing by itself (checks are switched off in Settings → Devices): the reviewer judges each item by reading. Its helpers run no commands.';
/** A Recon Long run's checks: off (the default) or on without the internet (Settings → Recon). */
/** A Creator Plus conversation's Long run (Creator Plus decides, through its `longRunRules`). */
export const CREATOR_CHECKS_TEXT = 'Creator Plus: the run checks its work with commands that have no internet, see only the run\'s folder, get no keys, and can start only the usual check programs (never launchctl, open or a program it wrote); its helpers run no commands. Installing or changing anything in your real setup waits for your yes in the Mission\'s card.';
/** A Long run in the Creator Plus tab: switched off for now (its checks run in the conversation's live folder). */
export const CREATOR_LONG_OFF_TEXT = 'Missions are switched off in Creator Plus until their checks can run on a throwaway copy; use Thorough for now.';
/** A plain /mission run in the Creator Plus tab: refused (its checks would run outside Creator Plus's rules). */
export const CREATOR_NO_MISSION_TEXT = 'In Creator Plus mode, /mission is not available: its checks would run outside Creator Plus\'s rules.';
export const RECON_CHECKS_TEXT = 'Recon: the run checks its work with commands that have no internet, see only the run\'s folder and can start only the usual check programs (never launchctl, open or a program it wrote). Switch this off in Settings → Recon.';
export const RECON_NO_CHECKS_TEXT = 'Recon: the run runs no commands; the reviewer judges each item by reading. Checks without the internet can be switched on in Settings → Recon.';
export const RECON_LONG_TEXT = 'A Recon thread: its helpers use this thread\'s model and Recon\'s tools, with files only in the run\'s own folder in Recon\'s room, and run no programs or commands. End and wipe deletes the run too.';
