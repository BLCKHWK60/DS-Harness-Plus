// lib/merge.mjs — append-only three-way merge rules (pure functions, no dependencies).
//
// Session logs are append-only: the three sides (the merge base, local ours, remote theirs)
// are compared byte by byte, file by file. Rules (never a silent overwrite — every byte of ours and theirs survives):
// - the same (ours == theirs) → keep ours;
// - only local changed (theirs == base) → keep ours;
// - only remote changed (ours == base) → take theirs (nothing local is lost; this is not an overwrite);
// - both sides only appended (base is a shared byte prefix of ours and theirs) → keep ours at the original path,
//   and keep all of theirs as a fork file (both kept);
// - anything else (a real divergence: one side rewrote, compacted, deleted…) → also keep ours + fork theirs,
//   and report diverged loudly; never choose for the user.
//
// Content is compared as a Buffer: binary logs such as zstd follow the same rules as UTF-8 text.

import { MERGE_KINDS } from './constants.mjs'

/** Any content shape → Buffer|undefined. */
function norm(value) {
  if (value === undefined || value === null) return undefined
  if (Buffer.isBuffer(value)) return value
  return Buffer.from(String(value))
}

/** Whether a is a byte prefix of b (equal length means equal). */
function isPrefix(prefix, whole) {
  return prefix !== undefined && whole !== undefined
    && prefix.length <= whole.length
    && whole.subarray(0, prefix.length).equals(prefix)
}

/**
 * The three-way class of one path.
 * @param {Buffer|string|undefined} base - the merge base content.
 * @param {Buffer|string|undefined} ours - the local content.
 * @param {Buffer|string|undefined} theirs - the remote content.
 * @returns {{kind: string, keepOurs: boolean, forkTheirs: boolean}}
 *   kind ∈ MERGE_KINDS; keepOurs=false takes theirs (theirs-only).
 */
export function classifyPath(base, ours, theirs) {
  const b = norm(base)
  const o = norm(ours)
  const t = norm(theirs)
  if (o !== undefined && t !== undefined && o.equals(t)) {
    return { kind: MERGE_KINDS.IDENTICAL, keepOurs: true, forkTheirs: false }
  }
  if (o === undefined && t === undefined) {
    return { kind: MERGE_KINDS.IDENTICAL, keepOurs: true, forkTheirs: false }
  }
  // Only local changed: the remote still has the base content.
  if (equalsOrBothMissing(t, b)) {
    return { kind: MERGE_KINDS.OURS_ONLY, keepOurs: true, forkTheirs: false }
  }
  // Only remote changed: local still has the base content → take the remote (nothing local is added, not an overwrite).
  if (equalsOrBothMissing(o, b)) {
    return { kind: MERGE_KINDS.THEIRS_ONLY, keepOurs: false, forkTheirs: false }
  }
  // Both only appended: shared base prefix + each side's own tail → keep both; the remote becomes a fork file.
  if (isPrefix(b, o) && isPrefix(b, t)) {
    return { kind: MERGE_KINDS.APPEND_BOTH, keepOurs: true, forkTheirs: true }
  }
  // A real divergence (rewrite, compaction, one-sided delete…): also keep both, and report it loudly.
  return { kind: MERGE_KINDS.DIVERGED, keepOurs: true, forkTheirs: true }
}

/** Both sides missing, or equal byte for byte. */
function equalsOrBothMissing(left, right) {
  if (left === undefined && right === undefined) return true
  if (left === undefined || right === undefined) return false
  return left.equals(right)
}

/**
 * The merge plan for a batch of conflicting paths (the pull step calls classifyPath for each merge-conflict path).
 * @param {Array<{path: string, base?: Buffer|string, ours?: Buffer|string, theirs?: Buffer|string}>} conflicts - the conflicting paths.
 * @returns {{resolutions: Array<{path: string, kind: string, adoptTheirs: boolean, forkTheirs: boolean}>, summary: {kept: number, adopted: number, appended: number, diverged: number, forkPaths: string[]}}}
 */
export function planMerge(conflicts) {
  const resolutions = []
  const summary = { kept: 0, adopted: 0, appended: 0, diverged: 0, forkPaths: [] }
  for (const entry of conflicts) {
    const verdict = classifyPath(entry.base, entry.ours, entry.theirs)
    const resolution = {
      path: entry.path,
      kind: verdict.kind,
      adoptTheirs: !verdict.keepOurs,
      forkTheirs: verdict.forkTheirs,
    }
    resolutions.push(resolution)
    if (verdict.kind === MERGE_KINDS.THEIRS_ONLY) summary.adopted += 1
    else summary.kept += 1
    if (verdict.kind === MERGE_KINDS.APPEND_BOTH) summary.appended += 1
    if (verdict.kind === MERGE_KINDS.DIVERGED) summary.diverged += 1
    if (verdict.forkTheirs) summary.forkPaths.push(entry.path)
  }
  return { resolutions, summary }
}
