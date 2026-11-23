// lib/paths.mjs — path resolution and escape checks (no dependencies).
//
// All pure functions: resolve the sync root and the work-tree root, check that they do not nest, and map a session
// file's relative path safely into the work tree. Anywhere outside input is joined into a path must first pass assertRelPath
// or a containment check (a path escape = PATH_UNSAFE, a loud failure, never silent).

import path from 'node:path'
import { FORK_NAME_RE, MIRROR_DIR } from './constants.mjs'
import { badConfig, pathUnsafe } from './errors.mjs'

/**
 * Resolve the session store root: an empty config takes $DSH_HOME/sessions; both missing → a loud failure.
 * Whether the folder really exists is for the consumers (mirror, status); this only resolves the path.
 * @param {string} configured - Config.sessionRoot ('' = default).
 * @param {string|undefined} [dshHome] - the environment's $DSH_HOME (passed in by tests).
 * @returns {string} an absolute path.
 */
export function resolveSessionRoot(configured, dshHome = process.env.DSH_HOME) {
  if (typeof configured === 'string' && configured.length > 0) {
    return path.resolve(configured)
  }
  if (typeof dshHome === 'string' && dshHome.length > 0) {
    return path.join(dshHome, 'sessions')
  }
  throw badConfig('sessionRoot is empty and $DSH_HOME is not set; run under dsh or set sessionRoot explicitly')
}

/**
 * Resolve the sync repository's work-tree root: an empty config takes $DSH_HOME/dsh-session-sync/repo.
 * @param {string} configured - Config.repoDir ('' = default).
 * @param {string|undefined} [dshHome] - the environment's $DSH_HOME (passed in by tests).
 * @returns {string} an absolute path.
 */
export function resolveRepoDir(configured, dshHome = process.env.DSH_HOME) {
  if (typeof configured === 'string' && configured.length > 0) {
    return path.resolve(configured)
  }
  if (typeof dshHome === 'string' && dshHome.length > 0) {
    return path.join(dshHome, 'dsh-session-sync', 'repo')
  }
  throw badConfig('repoDir is empty and $DSH_HOME is not set; run under dsh or set repoDir explicitly')
}

/**
 * Neither folder may contain the other: the mirror copies sessionRoot into repoDir (or would recurse the other way).
 * @param {string} sessionRoot - the resolved session store root.
 * @param {string} repoDir - the resolved sync repository root.
 * @returns {void} throws BAD_CONFIG when broken.
 */
export function assertNestingSafe(sessionRoot, repoDir) {
  const inside = (a, b) => {
    const rel = path.relative(a, b)
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
  }
  if (inside(sessionRoot, repoDir)) {
    throw badConfig(`repoDir ${JSON.stringify(repoDir)} must not be inside sessionRoot ${JSON.stringify(sessionRoot)} (the mirror would copy itself)`)
  }
  if (inside(repoDir, sessionRoot)) {
    throw badConfig(`sessionRoot ${JSON.stringify(sessionRoot)} must not be inside repoDir ${JSON.stringify(repoDir)} (the mirror would copy itself)`)
  }
}

/**
 * Check a session file's relative path: refuses absolute paths, empty segments, `.`/`..`, backslashes and escapes.
 * The only way in for joining mirror and fork paths.
 * @param {string} rel - the relative path (POSIX separators).
 * @returns {string} the same relative path, normalised.
 */
export function assertRelPath(rel) {
  if (typeof rel !== 'string' || rel.length === 0) {
    throw pathUnsafe('relative path must be a non-empty string')
  }
  if (rel.includes('\\') || rel.includes('\0')) {
    throw pathUnsafe(`relative path contains reserved characters: ${JSON.stringify(rel)}`)
  }
  const segments = rel.split('/')
  for (const segment of segments) {
    if (segment.length === 0 || segment === '.' || segment === '..') {
      throw pathUnsafe(`relative path contains traversal segment: ${JSON.stringify(rel)}`)
    }
  }
  return rel
}

/**
 * Whether a segment looks like a file name (has an extension; not empty, not `.`/`..`).
 * Used to tell the old flat layout's `<id>/<file>` from the new layout's `<projectKey>/<sessionId>`.
 * @param {string} segment - one path segment.
 * @returns {boolean} true when it looks like a file name.
 */
function looksLikeFileSegment(segment) {
  return segment.length > 0 && segment !== '.' && segment !== '..' && segment.includes('.')
}

/**
 * Decode the host's `encodeSegment` `~XXXX` escapes (the inverse; host
 * session-persistence-jsonl/src/format.ts:198-213). Without escapes it is returned as is;
 * the host also escapes `~` itself as `~007E`, so one pass of replacing is lossless and reversible.
 * @param {string} segment - one encoded path segment.
 * @returns {string} the decoded segment.
 */
export function decodeSegment(segment) {
  return segment.replace(/~([0-9A-Fa-f]{4})/gu, (_match, hex) => String.fromCharCode(parseInt(hex, 16)))
}

/**
 * A fork's relative path → the session id.
 *
 * Main anchor = the fork file name itself (the naming rule of `forkFileName`, FORK_NAME_RE): a fork file
 * always sits in the same folder as the file it forks, so the session id is always its **parent folder segment** — whatever the layout depth
 * (the host's <mirrorDir>/<projectKey>/<sessionId>/<file> and the old flat
 * <mirrorDir>/<sessionId>/<file> resolve the same; depth is no longer the test).
 * A path that is not a fork keeps the existing loose mapping (4 or more segments take the 2nd; 3 segments whose last looks like a file name take the 1st,
 * approved by a person, item 1), because callers also use it to assign ordinary mirror files to a session.
 * Any other shape (a root-level file, a folder, an empty segment or `..`, a prefix that is not the mirror) → undefined.
 * @param {string} forkPath - the mirror-relative path (POSIX separators).
 * @param {string} [mirrorDir] - the mirror folder name (default MIRROR_DIR).
 * @returns {string|undefined} the decoded session id; undefined when it cannot be mapped.
 */
export function sessionIdOfForkPath(forkPath, mirrorDir = MIRROR_DIR) {
  if (typeof forkPath !== 'string' || forkPath.length === 0) return undefined
  const parts = forkPath.split('/')
  if (parts[0] !== mirrorDir) return undefined
  for (let index = 1; index < parts.length; index += 1) {
    const segment = parts[index]
    if (segment.length === 0 || segment === '.' || segment === '..') return undefined
  }
  const anchor = parts[parts.length - 1]
  if (parts.length >= 3 && FORK_NAME_RE.test(anchor)) {
    return decodeSegment(parts[parts.length - 2])
  }
  if (parts.length >= 4) {
    return decodeSegment(parts[2])
  }
  if (parts.length === 3 && looksLikeFileSegment(parts[2])) {
    return decodeSegment(parts[1])
  }
  return undefined
}

/**
 * A relative path → the mirror path in the work tree (<repoDir>/sessions/<rel>).
 * @param {string} repoDir - the sync repository root.
 * @param {string} mirrorDir - the mirror folder name (MIRROR_DIR).
 * @param {string} rel - the checked relative path.
 * @returns {string} the absolute path inside the work tree.
 */
export function mirrorPathOf(repoDir, mirrorDir, rel) {
  return path.join(repoDir, mirrorDir, ...assertRelPath(rel).split('/'))
}

/**
 * The fork file name: <basename>.remote-fork-<14-digit UTC timestamp>-<short device id>.
 * Conflicts in the same folder at the same moment are told apart by the device id; an existing fork file is never overwritten.
 * @param {string} basename - the original file name.
 * @param {string} timestampUtc - the UTC timestamp (yyyyMMddHHmmss).
 * @param {string} deviceShort - the short device id (at most 8 lowercase hex digits).
 * @returns {string} the fork file name.
 */
export function forkFileName(basename, timestampUtc, deviceShort) {
  const stamp = /^\d{14}$/u.test(timestampUtc) ? timestampUtc : '19700101000000'
  const device = /^[0-9a-z]{1,8}$/iu.test(deviceShort) ? deviceShort.toLowerCase() : 'unknown'
  return `${basename}.remote-fork-${stamp}-${device}`
}
