/**
 * The gates of the four levels of touch (plan, "Four levels of touch" and "Permissions"):
 * - Identify: always, on a device the user connected or named.
 * - Read: allowed when the card's highest level is Read or above (the start value).
 * - Adjust: only when the card allows Adjust; Restricted refuses, Ask-Auto asks each time, Full Auto
 *   runs without asking on that device and logs each change.
 * - Write: only when the card allows Write; Restricted refuses; asks every time in every other mode.
 * Look-only families (vehicles and e-bikes, medical devices, batteries and chargers, locks, alarms,
 * smoke detectors, heating) never get Adjust or Write, whatever the card says.
 * The card's permissions are set by the user on Settings → Bench, never by the model.
 */

export const ORDER = { identify: 0, read: 1, adjust: 2, write: 3 };
export const LEVEL_LABEL = { identify: 'Identify', read: 'Read', adjust: 'Adjust', write: 'Write' };
export const ASK_LABEL = { restricted: 'Restricted', 'ask-auto': 'Ask-Auto', 'full-auto': 'Full Auto' };

/** Families where safety is at stake: Bench reads them and changes nothing (plan, "Bench: rules that hold everywhere"). */
export const LOOK_ONLY = [
  { family: 'vehicles and e-bikes', words: /\b(e-?bikes?|pedelecs?|bosch (?:e-?bike|smart system)|kiox|nyon|purion|shimano steps|bafang|e-?scooters?|scooters?|ninebot|segway|obd|vehicles?|cars?|motorbikes?|motorcycles?)\b/i },
  { family: 'medical devices', words: /\b(glucose|blood pressure|insulin|dexcom|freestyle libre|libre \d|omron|cgm|oximeters?|hearing aids?|pacemakers?|medical)\b/i },
  { family: 'batteries and chargers', words: /\b(power ?banks?|chargers?|battery packs?|home batter(?:y|ies)|power stations?|wallbox(?:es)?)\b/i },
  { family: 'locks and alarms', words: /\b(door locks?|smart locks?|nuki|august lock|yale|alarms?|smoke detectors?|smoke alarms?|carbon monoxide|co detectors?)\b/i },
  { family: 'heating', words: /\b(thermostats?|heat pumps?|boilers?|heating)\b/i },
];

/** The card's fields its family is read from: what the model writes on it. */
const FAMILY_FIELDS = ['name', 'maker', 'model', 'chip', 'recipe', 'identifiers', 'connects', 'manual', 'firmwareSource', 'notes'];

/** @returns {string} the look-only family a card's own words name, or ''. */
export function familyOfText(card) {
  const text = FAMILY_FIELDS.map((field) => card?.[field]).filter((value) => typeof value === 'string' && value).join(' ');
  return LOOK_ONLY.find((entry) => entry.words.test(text))?.family ?? '';
}

/**
 * The look-only family a card belongs to, or ''. Once a card was marked look-only it stays so, whatever
 * its words say later: only the user lifts the mark, on Settings → Bench.
 */
export function lookOnlyFamily(card) {
  const marked = card?.permissions?.lookOnly;
  return (typeof marked === 'string' && marked) || familyOfText(card);
}

/**
 * Whether an action may go ahead on a device, and whether the user must be asked first.
 * @param {{card: object, need: 'identify' | 'read' | 'adjust' | 'write'}} input - the device's card and the level the action needs.
 * @returns {{ok: boolean, ask: boolean, why: string}} the decision.
 */
export function gate({ card, need }) {
  const level = card?.permissions?.level in ORDER ? card.permissions.level : 'read';
  const asks = card?.permissions?.asks in ASK_LABEL ? card.permissions.asks : 'ask-auto';
  if (need === 'identify') return { ok: true, ask: false, why: '' };
  const family = need === 'adjust' || need === 'write' ? lookOnlyFamily(card) : '';
  if (family) return { ok: false, ask: false, why: `${card.name} is one of the ${family}, which Devices only reads: nothing is changed on it, whatever its card says.` };
  if (ORDER[level] < ORDER[need]) return { ok: false, ask: false, why: `${card.name}'s highest level is ${LEVEL_LABEL[level]}, so ${LEVEL_LABEL[need]} is not allowed. Only the user can raise it, on Settings → Devices.` };
  if (need === 'read') return { ok: true, ask: false, why: '' };
  if (asks === 'restricted') return { ok: false, ask: false, why: `${card.name} is set to Restricted: only Identify and Read. Only the user can change that, on Settings → Devices.` };
  if (need === 'write') return { ok: true, ask: true, why: '' };
  return { ok: true, ask: asks !== 'full-auto', why: '' };
}

/** The Mac's power, from `pmset -g batt`: on battery and its charge, when it has one. */
export function powerOf(text) {
  const value = String(text ?? '');
  const battery = /drawing from 'Battery Power'/i.test(value);
  const percent = /(\d{1,3})%/.exec(value);
  return { battery, percent: percent ? Number(percent[1]) : undefined };
}

/** No write starts on a Mac running on its battery below this charge (plan, "The way back": power first). */
export const LOW_BATTERY = 30;

/** @returns {string} why a write may not start on this power, or ''. */
export function powerRefusal(power) {
  if (!power?.battery) return '';
  if (power.percent === undefined || power.percent < LOW_BATTERY) return `The Mac is running on its battery${power.percent === undefined ? '' : ` at ${power.percent}%`}. A write never starts below ${LOW_BATTERY}% on battery: plug the Mac in and ask again.`;
  return '';
}
