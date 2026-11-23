// lib/isolation.mjs — dsh-sync addition: isolated conversations (Recon) are never synced.
//
// The Modes add-on decides which conversations are isolated:
//   - its setting `sessionIsolated` lists every conversation that began in an isolated mode (for good). Modes writes it
//     at the conversation's first turn, and Rerun's copies of such a conversation carry the mark too;
//   - for a conversation open in the app, `modes.isolated(id)` answers (it follows a helper to its conversation),
//     except for the mode Modes calls `isolated-late` (dsh-modes/lib/isolation.js LATE_MODE): such a conversation began
//     in another tab and was only locked when an isolated tab was chosen for it (for example with the Cowork sidebar's
//     "Move to" menu), so it holds nothing from that tab and is synced like any other.
// A conversation's stored mode (`sessionModes`) is not counted on its own: a conversation moved into the Recon tab has
// that mode but holds nothing from Recon.
// A helper (sub-agent) of an isolated conversation is isolated too: it is found through `parentSession` in its stored
// header. In this app version only helpers carry that field (ordinary copies do not; only old copies may still have
// it), so a copy of an isolated conversation is found only through Modes' mark, which Rerun carries.
//
// Session files stay opaque bytes. A file belongs to a conversation by its place in the session store, which the app
// lays out as `<project folder>/<conversation id, escaped>/<files>` (dsh-session-persistence-jsonl, format.ts:
// sessionDir and encodeSegment). The old flat layout `<conversation id>/<file>` is recognised too.
//
// Fail closed: when the Modes add-on's settings cannot be read (Modes is off, or not started yet), nobody can say which
// conversations are isolated, so push and pull do not run at all. The answer is read inside Sync's lock, right after
// the session store is listed, so a conversation that begins while another sync operation runs is never copied with an
// old answer (lib/mirror.mjs `mirrorSessionRoot`, `fence`).

import { RESERVED_DIR } from './constants.mjs'
import { decodeSegment } from './paths.mjs'
import { messageOf } from './errors.mjs'
import { scratchExclude, scratchOf } from './scratch.mjs'

export { decodeSegment }

/** The id Modes gives a conversation that began in another tab and was later given an isolated one. */
export const LATE_MODE_ID = 'isolated-late'

/** Why push and pull are held while the Modes add-on cannot be asked. */
/** Why push and pull wait while Recon's list of moved conversations is damaged. */
export const RECON_DAMAGED_REASON = 'Sync did not run: Recon\'s list of threads moved out of Recon (door.json) is damaged, so Sync cannot tell which ones must never be synced. Recon kept a copy and says how to repair it (Settings → Recon). Nothing was sent or received.'

export const UNKNOWN_REASON = 'Sync did not run: the Modes add-on is not running, and it is what tells Sync which threads are sealed (Recon), which are never synced. Switch Modes on, or wait a moment after the app starts, and try again.'

/** Thrown inside Sync's lock when nobody can say which conversations are isolated: nothing is copied, removed or sent. */
export class IsolationUnknownError extends Error {
  /** @param {string} [reason] - why it is not known. */
  constructor(reason) {
    super(reason || UNKNOWN_REASON)
    this.name = 'IsolationUnknownError'
    this.code = 'ISOLATION_UNKNOWN'
  }
}

/**
 * @param {string} [reason] - why it is not known.
 * @returns {{known: false, reason: string, ids: Set<string>, exclude: (rel: string) => boolean}} the answer "not known".
 */
export function unknownIsolation(reason = UNKNOWN_REASON) {
  return { known: false, reason, ids: new Set(), scratch: new Set(), exclude: () => false }
}

/**
 * Ask which conversations are isolated now, and never throw.
 * @param {(() => Promise<object> | object) | undefined} source - `readIsolation` bound to the app's services.
 * @returns {Promise<{known: boolean, reason?: string, ids: Set<string>, exclude: (rel: string) => boolean}>} the
 *   answer; `known` is false when there is no source, it failed, or its answer is not usable.
 */
export async function askIsolation(source) {
  if (typeof source !== 'function') return unknownIsolation()
  try {
    const answer = await source()
    if (answer?.known === true && typeof answer.exclude === 'function') return { ...answer, ids: answer.ids instanceof Set ? answer.ids : new Set(), scratch: answer.scratch instanceof Set ? answer.scratch : new Set() }
    return unknownIsolation(typeof answer?.reason === 'string' && answer.reason ? answer.reason : UNKNOWN_REASON)
  } catch (error) {
    return unknownIsolation(`Sync did not run: it could not tell which threads are sealed (${messageOf(error)}).`)
  }
}

/**
 * What a status shows about isolated conversations, as plain data.
 * @param {object | undefined} answer - the answer already read inside the lock, if any.
 * @param {Function} source - asked now when there is no answer yet.
 * @returns {Promise<{known: boolean, reason: string, count: number, scratch: number}>} the summary (`scratch`: Scratch
 *   conversations on this Mac, also never synced).
 */
export async function isolationSummary(answer, source) {
  const final = answer ?? (await askIsolation(source))
  return final.known === true ? { known: true, reason: '', count: final.ids?.size ?? 0, scratch: final.scratch?.size ?? 0 } : { known: false, reason: String(final.reason || UNKNOWN_REASON), count: 0, scratch: 0 }
}

/** @returns {object} a JSON object stored as text, or {} when it is not one. */
export function readObject(text) {
  try {
    const value = typeof text === 'string' ? JSON.parse(text || '{}') : text
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

/**
 * The conversation a file of the session store (or of its mirror) belongs to.
 * @param {string} rel - POSIX path relative to the store: `<project>/<conversation>/<file…>`, or the old flat layout
 *   `<conversation>/<file>`.
 * @returns {string | undefined} the conversation id; undefined for anything else (the plugin's own folder included).
 *   (A file directly in a project folder maps to that folder's name, which is never a conversation id.)
 */
export function sessionIdOf(rel) {
  const parts = String(rel ?? '').split('/')
  if (parts[0] === RESERVED_DIR) return undefined
  if (parts.length >= 3) return parts[1] ? decodeSegment(parts[1]) : undefined
  if (parts.length === 2 && parts[0] && parts[1]) return decodeSegment(parts[0])
  return undefined
}

/** @returns {string | null} the id of a stored header's parent (a helper's conversation; only old copies carry it too). */
function parentOf(header) {
  const raw = header?.parentSession
  const id = raw && typeof raw === 'object' ? raw.id ?? raw.sessionId : raw
  return typeof id === 'string' && id ? id : null
}

/**
 * Every isolated conversation, from what the Modes add-on says and the stored headers.
 * @param {object} from - what is known.
 * @param {object} from.modes - the Modes add-on's settings (`sessionIsolated` is read).
 * @param {string[]} [from.open] - ids of the conversations open in the app.
 * @param {(id: string) => boolean} [from.isolated] - `modes.isolated(id)`, asked only for open conversations.
 * @param {Map<string, string>} [from.parents] - conversation id -> its parent's id.
 * @param {string[]} [from.rooms] - item 4A, stage 6a: conversations whose saved folder Recon says is its room.
 * @returns {Set<string>} the isolated conversations.
 */
export function isolatedIds({ modes, open = [], isolated, parents = new Map(), rooms = [] }) {
  const ids = new Set()
  for (const [id, value] of Object.entries(readObject(modes?.sessionIsolated))) if (value === true) ids.add(id)
  // Item 4A, stage 6a (belt): a thread recorded in the Recon space, whatever its mode (nothing ever moves into Recon),
  // and a thread whose saved folder is Recon's room (`rooms`, from Recon's isRoom), whose space and mark writes failed.
  for (const [id, value] of Object.entries(readObject(modes?.sessionSpaces))) if (value === 'recon') ids.add(id)
  for (const id of rooms) if (typeof id === 'string' && id) ids.add(id)
  for (const id of open) {
    let yes
    try {
      yes = isolated?.(id) === true
    } catch {
      // Modes could not answer for an open conversation: keep it out.
      yes = true
    }
    if (yes) ids.add(id)
  }
  for (const id of parents.keys()) {
    let at = id
    for (let depth = 0; depth < 12 && parents.has(at) && !ids.has(at); depth += 1) at = parents.get(at)
    if (ids.has(at)) ids.add(id)
  }
  return ids
}

/**
 * @param {Set<string>} ids - isolated conversations.
 * @returns {(rel: string) => boolean} whether a file of the session store belongs to one of them.
 */
export function excludeFor(ids) {
  return (rel) => {
    const id = sessionIdOf(rel)
    return id !== undefined && ids.has(id)
  }
}

/**
 * Read which conversations are isolated now, and which are Scratch (lib/scratch.mjs): both are never synced.
 * @param {object} services - the app's services, each optional: `settings`, `modes`, `agents`, `sessionPersistence`, `reconMoved`;
 *   and `scratchPlace`, the Scratch place ('' or missing: no Scratch rule).
 * @returns {Promise<{known: boolean, reason?: string, ids: Set<string>, scratch: Set<string>, exclude: (rel: string) => boolean}>}
 *   `known` false when the Modes add-on cannot be asked: then nothing may be pushed or pulled.
 */
export async function readIsolation({ settings, modes, agents, sessionPersistence, scratchPlace = '', reconMoved, recon } = {}) {
  const none = unknownIsolation()
  /** @returns {object | undefined} the Modes add-on's settings now. */
  const modesSettings = () => {
    try {
      const value = settings?.describe?.()?.find?.((entry) => entry?.ns === 'modes')?.value
      return value && typeof value === 'object' ? value : undefined
    } catch {
      return undefined
    }
  }
  if (!modesSettings()) return none
  const parents = new Map()
  const listed = []
  if (typeof sessionPersistence?.list === 'function') {
    try {
      for (const snapshot of await sessionPersistence.list()) {
        const id = snapshot?.header?.id
        const parent = parentOf(snapshot?.header)
        if (typeof id === 'string' && parent && parent !== id) parents.set(id, parent)
        if (typeof id === 'string' && id) listed.push({ id, cwd: snapshot?.header?.cwd })
      }
    } catch (error) {
      return { ...none, reason: `Sync did not run: the threads could not be listed to leave out sealed ones (${String(error?.message ?? error).slice(0, 200)}). Try again in a moment.` }
    }
  }
  // Modes' marks and the open conversations are read after the only wait, so they are as recent as possible.
  const value = modesSettings()
  if (!value) return none
  let open = []
  try {
    open = (agents?.list?.() ?? []).map((agent) => agent?.id).filter((id) => typeof id === 'string' && id)
  } catch {
    open = []
  }
  // Item 4A, stage 6a (belt): threads whose saved folder Recon says is its room (asked once per folder; only a yes counts).
  const rooms = []
  if (typeof recon?.isRoom === 'function') {
    const said = new Map()
    for (const { id, cwd } of listed) {
      if (typeof cwd !== 'string' || !cwd) continue
      if (!said.has(cwd)) {
        let yes = false
        try {
          yes = recon.isRoom(cwd) === true
        } catch {
          yes = false
        }
        said.set(cwd, yes)
      }
      if (said.get(cwd)) rooms.push(id)
    }
  }
  const ids = isolatedIds({ modes: value, open, isolated: (id) => modes?.isolated?.(id) === true && modes?.get?.(id) !== LATE_MODE_ID, parents, rooms })
  // Recon's list of moved conversations is damaged (it keeps a copy and says so on its page): which conversations
  // were moved cannot be told, and they must never be synced, so nothing is synced until it is repaired.
  try {
    if (reconMoved?.damaged?.() === true) return { ...none, reason: RECON_DAMAGED_REASON }
  } catch {
    // Recon cannot say: its list is used as it is below.
  }
  // A conversation Recon's "Move to" opened holds Recon's summary: never synced either (the Recon add-on says which).
  // The list is readable whether Recon is switched on or off, so Sync never waits for Recon; with no Recon add-on there is none.
  try {
    for (const id of reconMoved?.list?.() ?? []) if (typeof id === 'string' && id) ids.add(id)
  } catch {
    // Recon cannot say: Modes' marks and the open conversations still hold.
  }
  const isolatedFile = excludeFor(ids)
  const scratch = scratchOf({ place: typeof scratchPlace === 'string' ? scratchPlace : '', listed })
  const scratchFile = scratchExclude(scratch, sessionIdOf)
  return { known: true, ids, scratch: scratch.ids, exclude: (rel) => isolatedFile(rel) || scratchFile(rel) }
}
