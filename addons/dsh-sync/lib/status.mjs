// lib/status.mjs — read-only status collection (no dependencies; built from GitBackend primitives).
//
// Every command is local and read-only (status/log/diff/ls-files/rev-parse): no fetch,
// no file written; the comparison with the remote uses the remote-tracking refs from the last fetch (the report says so).

import { FORK_NAME_RE } from './constants.mjs'
import { sanitizeRemote } from './sanitize.mjs'

/** A porcelain status line → its path (a rename gives the new path). */
function pathOfPorcelainLine(line) {
  const rest = line.slice(3)
  const arrow = rest.indexOf(' -> ')
  return arrow >= 0 ? rest.slice(arrow + 4) : rest
}

/**
 * Collect a snapshot of the sync status (JSON-safe, can go straight into a tool result).
 * @param {import('./git.mjs').GitBackend} git - the git backend.
 * @param {object} deps - {branch, remote}.
 * @returns {Promise<{ok: boolean, branch: string, remote: string, head?: string, remoteHead?: string, ahead: number, behind: number, dirty: string[], forks: string[], diffStat: string, mergeInProgress: boolean, lastCommits: string[], error?: string}>}
 */
export async function collectStatus(git, deps) {
  const base = {
    ok: false,
    branch: deps.branch,
    remote: sanitizeRemote(deps.remote),
    head: undefined,
    remoteHead: undefined,
    ahead: 0,
    behind: 0,
    dirty: [],
    forks: [],
    diffStat: '',
    mergeInProgress: false,
    lastCommits: [],
    error: undefined,
  }
  try {
    const [head, remoteHead, dirtyLines, inProgress, lastCommits] = await Promise.all([
      git.headSha(),
      git.remoteHeadSha(),
      git.dirtyLines(),
      git.mergeInProgress(),
      git.recentCommits(5),
    ])
    base.head = head
    base.remoteHead = remoteHead
    base.dirty = dirtyLines.map(pathOfPorcelainLine)
    base.mergeInProgress = inProgress
    base.lastCommits = lastCommits
    if (head !== undefined && remoteHead !== undefined && head !== remoteHead) {
      const [ahead, behind, diffStat] = await Promise.all([
        git.countCommitsSafe(remoteHead, head),
        git.countCommitsSafe(head, remoteHead),
        git.diffStat(head, remoteHead),
      ])
      base.ahead = ahead
      base.behind = behind
      base.diffStat = diffStat
    }
    const ls = await git.lsFiles()
    base.forks = ls.filter(file => FORK_NAME_RE.test(file.split('/').at(-1) ?? '')).sort()
    base.ok = true
    return base
  } catch (error) {
    base.error = error instanceof Error ? error.message : String(error)
    return base
  }
}
