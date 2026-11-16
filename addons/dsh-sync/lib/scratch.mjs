// lib/scratch.mjs — dsh-sync addition: Scratch conversations are never synced (Scratch part, step 33).
//
// The Cowork sidebar keeps one hidden project, `<app home>/scratch`, for conversations that should not land in a
// folder of the user's; each works in its own sub-folder there. They are never pushed or pulled. Sync works out the
// place itself (`dshHomePath('scratch')`), so this holds while the Cowork sidebar is off too.
//
// Which files are Scratch:
//   - a conversation whose stored header records a folder that is the place or inside it (its helpers record the same
//     folder): decided by place, links and macOS's /private resolved, as the Cowork sidebar decides
//     (dsh-cowork-shell/lib/scratch.js isScratch; a test compares the two);
//   - a file in the store folder the app gives the place (`storeKey(place)`), unless this Mac knows its conversation
//     is not Scratch. That catches a Scratch thread that is only on the remote (pushed from another Mac), whose header
//     this Mac cannot read before the file would be written. The app's store name is lossy (`<home>-scratch` shares
//     it), so a conversation listed here is judged by its header, never by that name alone.

import { realpathSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

/** @returns {string} a path with links resolved where it exists ('' for a relative or empty one). */
function real(path, realpath = realpathSync) {
  const text = String(path ?? '')
  if (!text || !isAbsolute(text)) return ''
  try {
    return realpath(text)
  } catch {
    const parent = resolve(text, '..')
    if (parent === text) return text
    const head = real(parent, realpath)
    return head ? join(head, text.slice(parent.length + 1)) : resolve(text)
  }
}

/**
 * @param {string} path - a folder.
 * @param {string} place - the Scratch place.
 * @returns {boolean} whether the folder is the place or inside it.
 */
export function isScratch(path, place, realpath = realpathSync) {
  const target = real(path, realpath)
  const root = real(place, realpath)
  if (!target || !root) return false
  const rel = relative(root, target)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

/** @returns {string} the store folder name the app gives a folder (dsh-session-persistence-jsonl projectKey). */
export function storeKey(cwd) {
  let readable = ''
  let separatorRun = false
  for (const ch of String(cwd ?? '')) {
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      for (let i = 0; i < ch.length; i += 1) readable += `~${ch.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0')}`
      separatorRun = false
    }
  }
  const slug = readable.replace(/^-+/, '') || 'root'
  return `--${slug.slice(0, 251)}--`
}

/**
 * @param {object} from
 * @param {string} from.place - the Scratch place ('' when unknown: then nothing is Scratch).
 * @param {Array<{id: string, cwd?: string}>} from.listed - the conversations this Mac has, with their recorded folders.
 * @returns {{place: string, folder: string, ids: Set<string>, others: Set<string>}} the Scratch conversations, the
 *   place's store folder, and the conversations known not to be Scratch.
 */
export function scratchOf({ place, listed = [] }) {
  const ids = new Set()
  const others = new Set()
  if (!place) return { place: '', folder: '', ids, others }
  for (const entry of listed) {
    if (typeof entry?.id !== 'string' || !entry.id) continue
    let yes = false
    try {
      yes = typeof entry.cwd === 'string' && isScratch(entry.cwd, place)
    } catch {
      yes = false
    }
    ;(yes ? ids : others).add(entry.id)
  }
  return { place, folder: storeKey(place), ids, others }
}

/**
 * @param {{folder: string, ids: Set<string>, others: Set<string>}} scratch - from scratchOf.
 * @param {(rel: string) => string | undefined} idOf - the conversation a store file belongs to.
 * @returns {(rel: string) => boolean} whether a file of the session store belongs to a Scratch conversation.
 */
export function scratchExclude(scratch, idOf) {
  return (rel) => {
    // Sync's own folder never matches: the app's store names always start with '--'.
    const parts = String(rel ?? '').split('/')
    const id = idOf(rel)
    if (id !== undefined && scratch.ids.has(id)) return true
    // In the place's store folder and not known here as something else: a Scratch thread from another Mac.
    return Boolean(scratch.folder) && parts.length >= 2 && parts[0] === scratch.folder && !(id !== undefined && scratch.others.has(id))
  }
}
