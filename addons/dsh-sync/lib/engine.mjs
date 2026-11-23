// lib/engine.mjs — sync orchestration (business layer; DSH services come in as callbacks, so this module has no DSH dependency).
//
// Operation rules:
// - push: mirror → commit → push; refused (the remote is ahead) → fetch + pull and reconcile → push once more;
//   never force-push.
// - pull: first mirror + commit locally (so the merge base is a committed state) → fetch → three-way merge
//   (the append-only rules of lib/merge.mjs) → merge commit. The bytes of both sides of a conflict are never dropped:
//   local keeps the original path, the remote is kept as a fork file.
// - every operation runs one at a time through git.schedule (operations on one repository never interleave).

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { MERGE_KINDS, MIRROR_DIR, DEVICE_FILE } from './constants.mjs'
import { planMerge } from './merge.mjs'
import { mirrorSessionRoot, restoreSessionRoot, pruneRestoredSessions, removeExcluded, ensureDeviceFile } from './mirror.mjs'
import { askIsolation, isolationSummary } from './isolation.mjs'
import { collectStatus } from './status.mjs'
import { forkFileName } from './paths.mjs'
import { messageOf, SyncError } from './errors.mjs'
import { redactText, sanitizeRemote } from './sanitize.mjs'

/**
 * The sync engine.
 * @typedef {object} EngineDeps
 * @property {import('./git.mjs').GitBackend} git - the git backend.
 * @property {string} sessionRoot - the session store root (absolute).
 * @property {string} repoDir - the sync repository root (absolute).
 * @property {string} remote - the remote address as given (sanitised when shown).
 * @property {string} branch - the branch name.
 * @property {string} deviceId - the device id (whose fork it is).
 * @property {(patch: object) => void} reportMeta - the metadata patch callback (index.mjs writes the domain).
 * @property {(message: string) => void} reportError - the latest-error callback (writes the domain's lastError).
 * @property {(forkRelPaths: string[]) => void} onForks - the callback when fork files appear (index.mjs forks the session and sends the event).
 * @property {{debug: Function, info: Function, warn: Function, error: Function}} logger - the log.
 */
export class SyncEngine {
  /** @type {EngineDeps} */
  #deps

  /** @param {EngineDeps} deps - the dependencies. */
  constructor(deps) {
    this.#deps = deps
  }

  /** The device id (the fork file name suffix; index.mjs fills it in once the domain is ready). */
  set deviceId(value) {
    this.#deps.deviceId = value
  }

  /** The short device id (the fork file name suffix, at most 8 lowercase hex digits). */
  get deviceShort() {
    return this.#deps.deviceId.replaceAll('-', '').slice(0, 8).toLowerCase() || 'unknown'
  }

  /** Run one sync operation at a time (one per repository). */
  #schedule(fn) {
    return this.#deps.git.schedule(fn)
  }

  /** Failure wrapper: remove secrets → reportError → a structured error result. */
  #fail(error) {
    const message = redactText(messageOf(error))
    this.#deps.reportError(message)
    this.#deps.logger.warn(`sync failed: ${message}`)
    return { ok: false, error: message }
  }

  /** Fail loudly when no remote is configured (status operations are not blocked). */
  #requireRemote() {
    if (this.#deps.remote === undefined || this.#deps.remote.trim() === '') {
      throw new Error('no sync remote configured — set config.remote (status/diff work without one)')
    }
  }

  /**
   * Mirror + commit (the shared first step of push and pull).
   * @returns {Promise<{deviceWritten: boolean, mirror: {mirrored: number, unchanged: number, deleted: string[], forkedPreserved: string[], skippedLinks: string[]}}>}
   */
  // Mirror (no commit): mirror sessionRoot's bytes into the work tree + make sure of the device file.
  // Writes only the local work tree: no network, no confirmation, no commit. The caller already holds the schedule lock,
  // so this must never go through #schedule again.
  // dsh-sync addition: the files of isolated conversations (Recon) are left out and taken out of the worktree
  // (lib/isolation.mjs). `opts.isolation` (an async getter) is asked inside the lock, right after the session store is
  // listed; an unknown answer stops the operation there (IsolationUnknownError). `opts.exclude` is a fixed rule, for
  // callers that already know. `seen.answer` receives the answer.
  async #mirrorOnly(opts = {}, seen = {}) {
    // dsh-sync change: the original wrote `device.txt` (this device's id) at the repository root. Every device writes
    // the same path with a different id, so every pull reported a false "diverged" conflict and made a fork file.
    // The device id already travels in fork file names, so the file is not written any more.
    const deviceWritten = false
    const fence = typeof opts.isolation === 'function'
      ? async () => {
        seen.answer = await askIsolation(opts.isolation)
        return seen.answer
      }
      : undefined
    const mirror = await mirrorSessionRoot({
      sessionRoot: this.#deps.sessionRoot,
      repoDir: this.#deps.repoDir,
      mirrorDir: MIRROR_DIR,
      exclude: opts.exclude,
      fence,
    })
    return { deviceWritten, mirror }
  }

  // The first step: mirror + commit. The caller (push/pull) already holds the schedule lock, so this must never go through
  // #schedule again — a nested schedule locks itself on the same git chain (fnM waits for fnP, fnP waits for fnM).
  // dsh-sync addition: `opts.beforeCommit` (the project manifest) runs here, inside the lock, once the isolated
  // conversations are known.
  async #mirrorAndCommit(message, opts = {}) {
    const { deviceWritten, mirror } = await this.#mirrorOnly(opts)
    if (typeof opts.beforeCommit === 'function') await opts.beforeCommit()
    if (deviceWritten || mirror.mirrored > 0 || mirror.deleted.length > 0 || mirror.isolatedRemoved.length > 0) {
      const committed = await this.#deps.git.commitAll(message)
      return { ...mirror, committed }
    }
    return { ...mirror, committed: null }
  }

  /**
   * Status: first a local init + mirror (no commit), so unsynced session changes enter dirty as "uncommitted files";
   * writes only the local work tree: no network, no confirmation.
   * dsh-sync addition: `opts.isolation` is asked inside the lock which conversations are isolated; they are left out of
   * the mirror, and when the answer is not known nothing is copied. The answer is returned as `isolation` (plain data).
   * @param {{isolation?: Function, exclude?: (rel: string) => boolean}} [opts]
   * @returns {Promise<{ok: boolean, branch?: string, remote?: string, head?: string, remoteHead?: string, ahead: number, behind: number, dirty: string[], forks: string[], diffStat: string, mergeInProgress: boolean, lastCommits: string[], error?: string, isolation?: {known: boolean, reason: string, count: number}}>}
   */
  status(opts = {}) {
    return this.#schedule(async () => {
      const seen = {}
      try {
        await fs.mkdir(this.#deps.repoDir, { recursive: true })
        await this.#deps.git.ensureRepo()
        await this.#mirrorOnly(opts, seen)
      } catch {
        // A failed init or mirror does not block status: collectStatus returns a snapshot with an error.
      }
      const snapshot = await collectStatus(this.#deps.git, { branch: this.#deps.branch, remote: this.#deps.remote ?? '' })
      return typeof opts.isolation === 'function' ? { ...snapshot, isolation: await isolationSummary(seen.answer, opts.isolation) } : snapshot
    })
  }

  /**
   * Push: mirror → commit → push; when refused, pull and reconcile, then push once more.
   * @param {object} [opts] - {signal?: AbortSignal, isolation?: Function, exclude?: (rel: string) => boolean, beforeCommit?: Function}
   *   (isolation/exclude: isolated sessions; beforeCommit: the project list; dsh-sync addition, see #mirrorOnly).
   * @returns {Promise<{ok: boolean, pushed?: boolean, head?: string, mirrored?: number, deleted?: number, remote?: string, error?: string}>}
   */
  push(opts = {}) {
    return this.#schedule(async () => {
      try {
        this.#requireRemote()
        // git commands use repoDir as cwd, so it must exist before the first operation (with no cwd
        // spawn fails silently, and can even pass itself off as exit 0).
        await fs.mkdir(this.#deps.repoDir, { recursive: true })
        await this.#deps.git.bootstrap()
        const mirror = await this.#mirrorAndCommit('dsh-sync: push snapshot', opts)
        try {
          await this.#deps.git.push({ signal: opts.signal })
        } catch (error) {
          if (!(error instanceof SyncError && error.code === 'PUSH_REJECTED')) {
            throw error
          }
          // The remote is ahead: first pull and reconcile (keeping both sides), then push once more.
          this.#deps.logger.info('push rejected (remote moved); pulling and reconciling before one retry')
          // dsh-sync addition: the merge leaves out the same isolated conversations the mirror did.
          const pulled = await this.#pullInternal({ ...opts, exclude: mirror.exclude })
          if (!pulled.ok) throw error
          await this.#deps.git.push({ signal: opts.signal })
        }
        const head = await this.#deps.git.headSha()
        this.#deps.reportMeta({ lastPushAt: Date.now(), lastPushHead: head })
        this.#deps.logger.info(`sync push ok: head ${head ?? ''} (${mirror.mirrored} mirrored, ${mirror.deleted} deleted)`)
        return {
          ok: true,
          pushed: true,
          head,
          mirrored: mirror.mirrored,
          deleted: mirror.deleted.length,
          isolatedLeftOut: mirror.isolatedSkipped,
          isolatedRemoved: mirror.isolatedRemoved.length,
          remote: sanitizeRemote(this.#deps.remote),
        }
      } catch (error) {
        return this.#fail(error)
      }
    })
  }

  /**
   * Pull: local commit → fetch → three-way merge (append-only rules).
   * @param {object} [opts] - {signal?: AbortSignal, isolation?: Function, exclude?: (rel: string) => boolean} (see push).
   * @returns {Promise<{ok: boolean, pulled?: boolean, merged?: boolean, adopted?: number, appended?: number, diverged?: number, forks?: string[], head?: string, error?: string}>}
   */
  pull(opts = {}) {
    return this.#schedule(async () => {
      try {
        this.#requireRemote()
        await fs.mkdir(this.#deps.repoDir, { recursive: true })
        await this.#deps.git.bootstrap()
        const mirror = await this.#mirrorAndCommit('dsh-sync: local checkpoint before pull', opts)
        // dsh-sync addition: the merge, the pruning and the restore leave out the same isolated conversations as the
        // checkpoint. A conversation that begins during the fetch has no files on the remote, so this answer covers it.
        const pulled = await this.#pullInternal({ ...opts, exclude: mirror.exclude })
        return { ...pulled, isolatedLeftOut: mirror.isolatedSkipped, isolatedRemoved: mirror.isolatedRemoved.length + (pulled.isolatedRemoved ?? 0) }
      } catch (error) {
        return this.#fail(error)
      }
    })
  }

  /**
   * The inner pull steps (reused by the push retry; the caller has made sure the repository exists and local is committed).
   * @param {object} [opts] - {signal?: AbortSignal}.
   * @returns {Promise<object>}
   */
  async #pullInternal(opts = {}) {
    const fetched = await this.#deps.git.fetch({ signal: opts.signal })
    if (!fetched) {
      this.#deps.reportMeta({ lastPullAt: Date.now() })
      return { ok: true, pulled: false, forks: [], adopted: 0, appended: 0, diverged: 0 }
    }
    const [head, remoteHead] = [await this.#deps.git.headSha(), await this.#deps.git.remoteHeadSha()]
    if (remoteHead === undefined) {
      this.#deps.reportMeta({ lastPullAt: Date.now() })
      return { ok: true, pulled: false, forks: [], adopted: 0, appended: 0, diverged: 0 }
    }
    if (head === remoteHead) {
      this.#deps.reportMeta({ lastPullAt: Date.now() })
      return { ok: true, pulled: false, forks: [], adopted: 0, appended: 0, diverged: 0 }
    }
    const behind = await this.#deps.git.countCommitsSafe(head, remoteHead)
    if (behind === 0) {
      // Local is ahead (no new commits on the remote): nothing to pull.
      this.#deps.reportMeta({ lastPullAt: Date.now() })
      return { ok: true, pulled: false, forks: [], adopted: 0, appended: 0, diverged: 0 }
    }
    const merged = await this.#deps.git.beginMerge(remoteHead)
    if (!merged.inProgress) {
      this.#deps.reportMeta({ lastPullAt: Date.now() })
      return { ok: true, pulled: false, forks: [], adopted: 0, appended: 0, diverged: 0 }
    }
    let result
    if (merged.conflicted) {
      result = await this.#resolveConflicts()
    } else {
      result = { adopted: 0, appended: 0, diverged: 0, forks: [] }
      await this.#deps.git.addAll()
    }
    const mirrorRoot = path.join(this.#deps.repoDir, MIRROR_DIR)
    // dsh-sync addition: what the remote holds of an isolated conversation does not stay in the merge.
    const stripped = await removeExcluded(mirrorRoot, opts.exclude)
    if (stripped.length > 0) {
      await this.#deps.git.addAll()
      const gone = new Set(stripped.map(rel => `${MIRROR_DIR}/${rel}`))
      result = { ...result, forks: result.forks.filter(fork => !gone.has(fork)) }
    }
    let newHead = await this.#deps.git.commitMerge()
    // A fast-forward leaves no merge to commit; what was taken out is committed on its own.
    if (newHead === null && stripped.length > 0) newHead = await this.#deps.git.commitAll('dsh-sync: isolated conversations taken out')
    const pruned = await pruneRestoredSessions({ repoDir: this.#deps.repoDir, mirrorRoot, sessionRoot: this.#deps.sessionRoot, exclude: opts.exclude })
    const restored = await restoreSessionRoot({
      repoDir: this.#deps.repoDir,
      mirrorRoot,
      sessionRoot: this.#deps.sessionRoot,
      exclude: opts.exclude,
    })
    this.#deps.reportMeta({ lastPullAt: Date.now() })
    this.#deps.logger.info(`sync pull ok: merged remote head ${remoteHead} → ${newHead ?? ''} (${result.appended} appended-both, ${result.diverged} diverged, ${result.forks.length} forks, ${restored.restored} restored, ${pruned.pruned.length} pulled-deletions)`)
    if (result.forks.length > 0) this.#deps.onForks(result.forks)
    return {
      ok: true,
      pulled: true,
      merged: true,
      adopted: result.adopted,
      appended: result.appended,
      diverged: result.diverged,
      forks: result.forks,
      restored: restored.restored,
      restoredSkipped: restored.skippedChanged,
      isolatedRemoved: stripped.length,
      head: newHead ?? undefined,
    }
  }

  /**
   * Conflict resolution: classify each path → check out ours/theirs → keep the remote side as a fork file →
   * stage everything (the caller makes the merge commit). On failure abortMerge restores the state.
   *
   * A delete/modify conflict (one side deleted, the other changed) also keeps both: git registers a stage only for
   * the side that exists, and the missing side is read as "that side deleted the file" — the delete is kept, and the other side
   * survives by the usual rules (the remote content is still kept as a fork file). A missing stage never stops the whole pull.
   * @returns {Promise<{adopted: number, appended: number, diverged: number, forks: string[]}>}
   */
  async #resolveConflicts() {
    try {
      const conflicts = await this.#deps.git.conflictedPaths()
      const entries = []
      for (const conflict of conflicts) {
        const [base, ours, theirs] = await Promise.all([
          this.#deps.git.readStageBlob('1', conflict.path),
          this.#deps.git.readStageBlob('2', conflict.path),
          this.#deps.git.readStageBlob('3', conflict.path),
        ])
        entries.push({ path: conflict.path, base, ours, theirs })
      }
      const { resolutions, summary } = planMerge(entries)
      /** Path → ours/theirs bytes; a missing side means that side deleted the file (git registers no stage for it). */
      const sides = new Map(entries.map(entry => [entry.path, entry]))
      const forks = []
      const now = new Date()
      // A strict 14-digit UTC stamp (yyyyMMddHHmmss): as in lib/encrypted.mjs, strip the ISO
      // separators (`-`/`:`/`T`) before cutting. Removing only `-`/`:` would leave the `T`, so
      // forkFileName's /^\d{14}$/ would not match and would silently fall back to the epoch stamp.
      const stamp = now.toISOString().replace(/[-:T]/gu, '').slice(0, 14)
      for (const resolution of resolutions) {
        const side = sides.get(resolution.path)
        const hasOurs = side?.ours !== undefined
        const hasTheirs = side?.theirs !== undefined
        const absolute = path.join(this.#deps.repoDir, ...resolution.path.split('/'))
        // `checkout --ours/--theirs` fails for a missing stage (`does not have
        // our/their version`), so each side is first checked for being in the conflict.
        if (resolution.adoptTheirs) {
          if (hasTheirs) await this.#deps.git.checkoutStage('theirs', resolution.path)
          else await fs.rm(absolute, { force: true })
          continue
        }
        if (resolution.forkTheirs && hasTheirs) {
          // First take theirs' work-tree bytes → write the fork file → then restore the ours side.
          await this.#deps.git.checkoutStage('theirs', resolution.path)
          const content = await fs.readFile(absolute)
          const forkName = forkFileName(path.posix.basename(resolution.path), stamp, this.deviceShort)
          await fs.writeFile(path.join(path.dirname(absolute), forkName), content)
          // ours is missing = deleted locally: keep the delete; the remote content survives only as a fork file.
          if (hasOurs) await this.#deps.git.checkoutStage('ours', resolution.path)
          else await fs.rm(absolute, { force: true })
          const forkRel = path.posix.join(path.posix.dirname(resolution.path), forkName)
          forks.push(forkRel)
          continue
        }
        // The remote deleted it (theirs is missing): keep the local version; the divergence counts in summary.diverged as usual.
        if (hasOurs) await this.#deps.git.checkoutStage('ours', resolution.path)
        else await fs.rm(absolute, { force: true })
      }
      await this.#deps.git.addAll()
      return { adopted: summary.adopted, appended: summary.appended, diverged: summary.diverged, forks }
    } catch (error) {
      try {
        await this.#deps.git.abortMerge()
      } catch {
        // On a failed restore the original error comes first; the restore failure is only logged.
      }
      throw error
    }
  }
}

export { MERGE_KINDS }
