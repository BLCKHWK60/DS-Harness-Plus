// lib/encrypted.mjs — git transport backend encrypted with age (no DSH dependency).
//
// Transport rules (above the mirror layer): the plain mirror exists only in the local work tree <repoDir>/sessions/
// (ignored by .gitignore, never committed); the git repository tracks only the <repoDir>/encrypted/**/*.age
// files (one age file per session file). The remote sees only encrypted files + git metadata (commit messages,
// the file-name structure, .gitignore), never plain session bytes.
//
// - push: mirror → sessions/ → encrypt into encrypted/ → commit → push (when refused, pull, reconcile and
//   push once more; never force-push).
// - pull: local commit checkpoint → fetch → decrypt the merge-base's and the remote's encrypted trees into plain text →
//   merge the plain text with lib/merge.mjs's three-way rules (append-only, keep both + fork)
//   → encrypt again → commit (as with the git backend, pull does not push on its own).
// - no age / no recipient / no identity: falls back to plain git while resolving (reusing
//   SyncEngine inside), with a clear warning in the status/push/pull results and the log; never a silent fallback.
// - in encrypted mode an age encrypt or decrypt failure → AGE_FAILED, fails closed, never falls back to plain-text transport.

import { promises as fs } from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { BACKENDS, ENC_DIR, ENC_EXT, FORK_NAME_RE, MERGE_KINDS, MIRROR_DIR } from './constants.mjs'
import { SyncEngine } from './engine.mjs'
import { mirrorSessionRoot, restoreSessionRoot, pruneRestoredSessions } from './mirror.mjs'
import { askIsolation, isolationSummary } from './isolation.mjs'
import { classifyPath } from './merge.mjs'
import { detectAge, ageEncrypt, ageDecrypt } from './age.mjs'
import { selectEncryptionMode, BACKEND_MODES } from './backend.mjs'
import { collectStatus } from './status.mjs'
import { forkFileName } from './paths.mjs'
import { messageOf, SyncError } from './errors.mjs'
import { redactText, sanitizeRemote } from './sanitize.mjs'

/** The plugin's own ref: the remote head at the last reconcile (local and remote equal after a push or pull),
 * used as the base of the next three-way merge (the encrypted backend makes no git merge commit, so it keeps its own base). */
const BASE_REF = 'refs/dsh-sync/base'

/** List every regular file under root, recursively (POSIX relative paths; symbolic links skipped). */
async function listRelFiles(root) {
  const files = []
  const walk = async (dir) => {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const absolute = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(absolute)
        continue
      }
      if (entry.isFile()) files.push(path.relative(root, absolute).split(path.sep).join('/'))
    }
  }
  await walk(root)
  return files
}

/** Read a whole tree as Map<rel, Buffer>. */
async function readTree(root) {
  const map = new Map()
  for (const rel of await listRelFiles(root)) {
    map.set(rel, await fs.readFile(path.join(root, ...rel.split('/'))))
  }
  return map
}

/** Write Map<rel, Buffer> back to root (mkdir -p; deletes existing files that are not in the map). */
async function writeTree(root, map) {
  for (const rel of await listRelFiles(root)) {
    if (!map.has(rel)) await fs.unlink(path.join(root, ...rel.split('/')))
  }
  for (const [rel, content] of map) {
    const target = path.join(root, ...rel.split('/'))
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, content)
  }
}

/**
 * Encrypt a whole plain tree → an encrypted tree (one age file per file; deletes encrypted files whose plain file is gone).
 * @param {string} plainRoot - the plain tree root.
 * @param {string} encRoot - the encrypted tree root.
 * @param {object} deps - {run, ageBin, recipient, timeoutMs}.
 * @returns {Promise<number>} the number of files encrypted.
 */
export async function encryptTree(plainRoot, encRoot, deps) {
  const plainFiles = await listRelFiles(plainRoot)
  const expected = new Set(plainFiles.map(rel => `${rel}${ENC_EXT}`))
  for (const rel of await listRelFiles(encRoot)) {
    if (!expected.has(rel)) await fs.unlink(path.join(encRoot, ...rel.split('/')))
  }
  // dsh-sync addition: age output differs on every run, so re-encrypting an unchanged file gave git a new
  // blob each push and the sync repository grew by the whole session store every time. A small cache
  // (outside the tracked tree) remembers which plaintext each ciphertext holds; unchanged files are skipped.
  const cache = deps.cacheFile ? await readEncCache(deps.cacheFile) : {}
  const next = {}
  for (const rel of plainFiles) {
    await fs.mkdir(encRoot, { recursive: true })
    const inPath = path.join(plainRoot, ...rel.split('/'))
    const outPath = path.join(encRoot, ...`${rel}${ENC_EXT}`.split('/'))
    const digest = createHash('sha256').update(deps.recipient ?? '').update('\0').update(await fs.readFile(inPath)).digest('hex')
    const known = cache[rel]
    if (known && known.digest === digest) {
      const st = await fs.stat(outPath).catch(() => undefined)
      if (st && st.size === known.size && st.mtimeMs === known.mtimeMs) {
        next[rel] = known
        continue
      }
    }
    await fs.mkdir(path.dirname(outPath), { recursive: true })
    await ageEncrypt(deps.run, {
      ageBin: deps.ageBin,
      recipient: deps.recipient,
      inPath,
      outPath,
      timeoutMs: deps.timeoutMs,
    })
    const st = await fs.stat(outPath)
    next[rel] = { digest, size: st.size, mtimeMs: st.mtimeMs }
  }
  if (deps.cacheFile) await fs.writeFile(deps.cacheFile, JSON.stringify(next))
  return plainFiles.length
}

/** Read the encryption cache; a missing or damaged file means "encrypt everything". */
async function readEncCache(file) {
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf8'))
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  } catch {
    return {}
  }
}

/**
 * Decrypt a whole encrypted tree → a plain Map<rel, Buffer> (reads only .age files, skips the rest).
 * @param {string} encRoot - the encrypted tree root.
 * @param {object} deps - {run, ageBin, identity, timeoutMs}.
 * @returns {Promise<Map<string, Buffer>>} plain relative path → content.
 */
export async function decryptTree(encRoot, deps) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-sync-dec-'))
  try {
    const map = new Map()
    let index = 0
    for (const rel of await listRelFiles(encRoot)) {
      if (!rel.endsWith(ENC_EXT)) continue
      const inPath = path.join(encRoot, ...rel.split('/'))
      const outPath = path.join(tmp, `out-${index}`)
      await ageDecrypt(deps.run, {
        ageBin: deps.ageBin,
        identity: deps.identity,
        inPath,
        outPath,
        timeoutMs: deps.timeoutMs,
      })
      map.set(rel.slice(0, -ENC_EXT.length), await fs.readFile(outPath))
      index += 1
    }
    return map
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
}

/**
 * Three-way merge of plain text (reusing the classifyPath rules of lib/merge.mjs):
 * ours is the base; theirs-only takes the remote; append-both/diverged keep ours + write theirs
 * as a fork file. Returns the merged tree and the counts.
 * @param {Map<string, Buffer>} base - the merge base tree.
 * @param {Map<string, Buffer>} ours - the local tree.
 * @param {Map<string, Buffer>} theirs - the remote tree.
 * @param {string} stamp - the fork file name's UTC timestamp (yyyyMMddHHmmss).
 * @param {string} deviceShort - the short device id (whose fork it is).
 * @returns {{merged: Map<string, Buffer>, forks: string[], adopted: number, appended: number, diverged: number}}
 */
export function mergeTrees(base, ours, theirs, stamp, deviceShort) {
  const merged = new Map(ours)
  const forks = []
  let adopted = 0
  let appended = 0
  let diverged = 0
  const keys = new Set([...base.keys(), ...ours.keys(), ...theirs.keys()])
  for (const rel of keys) {
    const remote = theirs.get(rel)
    const verdict = classifyPath(base.get(rel), ours.get(rel), remote)
    // A remote delete (theirs has no bytes) is the only divergence in this tree with "no remote content to keep":
    // taking the delete = removing it from the merged tree; otherwise = keep ours and count a divergence. Never put undefined into
    // merged — writeTree calls fs.writeFile for every entry, and undefined throws at once.
    if (verdict.kind === MERGE_KINDS.THEIRS_ONLY) {
      if (remote === undefined) merged.delete(rel)
      else merged.set(rel, remote)
      adopted += 1
    } else if (verdict.forkTheirs) {
      if (remote === undefined) {
        diverged += 1
      } else {
        const forkRel = path.posix.join(path.posix.dirname(rel), forkFileName(path.posix.basename(rel), stamp, deviceShort))
        merged.set(forkRel, remote)
        forks.push(forkRel)
        if (verdict.kind === MERGE_KINDS.APPEND_BOTH) appended += 1
        else diverged += 1
      }
    }
    // identical / ours-only: keep ours (already in merged).
  }
  return { merged, forks, adopted, appended, diverged }
}

/**
 * Git transport backend encrypted with age: session mirror content is encrypted before a push and decrypted before a merge.
 * Same surface as SyncEngine (status/push/pull + the deviceId setter), so it can be handed as the engine straight to the
 * command, the tools and automatic mode; without age it falls back to a plain SyncEngine inside.
 */
export class EncryptedBackend {
  /** @type {import('./git.mjs').GitBackend} */
  #git
  /** @type {SyncEngine} the plain fallback engine (reused without age or with missing config). */
  #plain
  /** @type {(args: string[], opts?: object) => Promise<{code: number, stdout: string|Buffer, stderr: string}>} the age runner. */
  #run
  /** @type {string} */
  #ageBin
  /** @type {string} */
  #recipient
  /** @type {string} */
  #identity
  /** @type {number} */
  #timeoutMs
  /** @type {string} */
  #repoDir
  /** @type {string} */
  #sessionRoot
  /** @type {string} */
  #remote
  /** @type {string} */
  #branch
  /** @type {string} */
  #deviceId
  /** @type {(patch: object) => void} */
  #reportMeta
  /** @type {(message: string) => void} */
  #reportError
  /** @type {(forkRelPaths: string[]) => void} */
  #onForks
  /** @type {{debug: Function, info: Function, warn: Function, error: Function}} */
  #logger
  /** @type {string[]} */
  #warnings = []
  /** @type {Promise<{mode: string, warnings: string[]}>|undefined} the lazy probe result. */
  #ready

  /**
   * @param {object} deps - {git, sessionRoot, repoDir, remote, branch, deviceId, reportMeta, reportError, onForks, logger, run, ageBin, ageRecipient, ageIdentity, timeoutMs}.
   */
  constructor(deps) {
    this.#git = deps.git
    this.#run = deps.run
    this.#ageBin = deps.ageBin
    this.#recipient = deps.ageRecipient
    this.#identity = deps.ageIdentity
    this.#timeoutMs = deps.timeoutMs
    this.#repoDir = deps.repoDir
    this.#sessionRoot = deps.sessionRoot
    this.#remote = deps.remote
    this.#branch = deps.branch
    this.#deviceId = deps.deviceId ?? 'pending'
    this.#reportMeta = deps.reportMeta
    this.#reportError = deps.reportError
    this.#onForks = deps.onForks
    this.#logger = deps.logger
    this.#plain = new SyncEngine({
      git: deps.git,
      sessionRoot: deps.sessionRoot,
      repoDir: deps.repoDir,
      remote: deps.remote,
      branch: deps.branch,
      deviceId: deps.deviceId ?? 'pending',
      reportMeta: deps.reportMeta,
      reportError: deps.reportError,
      onForks: deps.onForks,
      logger: deps.logger,
    })
  }

  /** The device id (whose fork it is; passed on to the plain fallback engine too). */
  set deviceId(value) {
    this.#deviceId = value
    this.#plain.deviceId = value
  }

  /** The short device id (the fork file name suffix, at most 8 lowercase hex digits). */
  get deviceShort() {
    return this.#deviceId.replaceAll('-', '').slice(0, 8).toLowerCase() || 'unknown'
  }

  /**
   * Probe lazily and resolve the transport mode (on the first operation; the result is cached).
   * @returns {Promise<{mode: string, warnings: string[]}>}
   */
  probeMode() {
    if (this.#ready === undefined) {
      this.#ready = (async () => {
        const ageBin = await detectAge(this.#run, this.#ageBin, { timeoutMs: this.#timeoutMs, cwd: this.#repoDir })
        const selection = selectEncryptionMode({
          backend: BACKENDS.ENCRYPTED,
          ageAvailable: ageBin !== null,
          ageRecipient: this.#recipient,
          ageIdentity: this.#identity,
        })
        this.#warnings = selection.warnings
        for (const warning of selection.warnings) {
          this.#logger.warn(`sync: encrypted backend is NOT encrypting: ${warning}`)
        }
        return selection
      })()
    }
    return this.#ready
  }

  /** Run one encrypted-path operation at a time (one per repository; the plain fallback serialises itself in SyncEngine). */
  #schedule(fn) {
    return this.#git.schedule(fn)
  }

  /** Failure wrapper: remove secrets → reportError → a structured error result (warnings carried along). */
  #fail(error) {
    const message = redactText(messageOf(error))
    this.#reportError(message)
    this.#logger.warn(`sync failed: ${message}`)
    return { ok: false, error: message, warnings: this.#warnings }
  }

  /** Fail loudly when no remote is configured (status operations are not blocked). */
  #requireRemote() {
    if (this.#remote === undefined || this.#remote.trim() === '') {
      throw new Error('no sync remote configured — set config.remote (status/diff work without one)')
    }
  }

  /**
   * Mirror sessionRoot → the plain work tree sessions/ (the encrypted backend does not write device.txt).
   * dsh-sync addition: isolated conversations are left out, as in SyncEngine: `opts.isolation` is asked inside the lock
   * right after the listing (an unknown answer throws before the worktree is touched); `opts.exclude` is a fixed rule.
   * `seen.answer` receives the answer.
   */
  async #mirrorOnly(opts = {}, seen = {}) {
    const fence = typeof opts.isolation === 'function'
      ? async () => {
        seen.answer = await askIsolation(opts.isolation)
        return seen.answer
      }
      : undefined
    return mirrorSessionRoot({
      sessionRoot: this.#sessionRoot,
      repoDir: this.#repoDir,
      mirrorDir: MIRROR_DIR,
      exclude: opts.exclude,
      fence,
    })
  }

  /** Make sure .gitignore (ignoring the plain sessions/) and the repository are ready. */
  async #ensureEncryptedRepo() {
    const gitignore = path.join(this.#repoDir, '.gitignore')
    const content = Buffer.from(`${MIRROR_DIR}/\n`)
    try {
      const existing = await fs.readFile(gitignore)
      if (!existing.equals(content)) await fs.writeFile(gitignore, content)
    } catch {
      await fs.writeFile(gitignore, content)
    }
    await this.#git.bootstrap()
  }

  /** Encrypt the plain sessions/ → encrypted/ (returns the number of files encrypted). */
  async #encryptMirror() {
    const encRoot = path.join(this.#repoDir, ENC_DIR)
    await fs.mkdir(encRoot, { recursive: true })
    return encryptTree(path.join(this.#repoDir, MIRROR_DIR), encRoot, {
      run: this.#run,
      ageBin: this.#ageBin,
      recipient: this.#recipient,
      timeoutMs: this.#timeoutMs,
      // Inside .git, so it is never committed or synced.
      cacheFile: path.join(this.#repoDir, '.git', 'dsh-sync-encrypt-cache.json'),
    })
  }

  /** The list of fork files in the plain work tree (with the sessions/ prefix, sorted). */
  async #plainForkFiles() {
    const files = await listRelFiles(path.join(this.#repoDir, MIRROR_DIR))
    return files.filter(file => FORK_NAME_RE.test(file.split('/').at(-1) ?? '')).map(file => `${MIRROR_DIR}/${file}`).sort()
  }

  /**
   * Decrypt a commit's encrypted tree into a plain Map<rel, Buffer>.
   * @param {string} rev - a commit sha or ref name.
   * @returns {Promise<Map<string, Buffer>>}
   */
  async #treeAtRev(rev) {
    const files = (await this.#git.listFilesAtRev(rev)).filter(rel => rel.startsWith(`${ENC_DIR}/`) && rel.endsWith(ENC_EXT))
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-sync-tree-'))
    try {
      const map = new Map()
      let index = 0
      for (const rel of files) {
        const blob = await this.#git.readFileAtRev(rev, rel)
        if (blob === undefined) continue
        const inPath = path.join(tmp, `in-${index}${ENC_EXT}`)
        const outPath = path.join(tmp, `out-${index}`)
        await fs.writeFile(inPath, blob)
        await ageDecrypt(this.#run, {
          ageBin: this.#ageBin,
          identity: this.#identity,
          inPath,
          outPath,
          timeoutMs: this.#timeoutMs,
        })
        map.set(rel.slice(ENC_DIR.length + 1, -ENC_EXT.length), await fs.readFile(outPath))
        index += 1
      }
      return map
    } finally {
      await fs.rm(tmp, { recursive: true, force: true })
    }
  }

  /**
   * Status: first a local init + mirror (no commit), then collect the git status; the fork list is read from the plain
   * tree instead (fork file names in the encrypted tree end in .age, which is not the form shown to users).
   * @param {{isolation?: Function, exclude?: (rel: string) => boolean}} [opts] - dsh-sync addition, as SyncEngine.status.
   * @returns {Promise<object>}
   */
  async status(opts = {}) {
    const selection = await this.probeMode()
    if (selection.mode === BACKEND_MODES.PLAINTEXT) {
      return { ...(await this.#plain.status(opts)), warnings: this.#warnings }
    }
    return this.#schedule(async () => {
      const seen = {}
      try {
        await fs.mkdir(this.#repoDir, { recursive: true })
        await this.#ensureEncryptedRepo()
        await this.#mirrorOnly(opts, seen)
      } catch {
        // A failed init or mirror does not block status: collectStatus returns a snapshot with an error.
      }
      const snapshot = await collectStatus(this.#git, { branch: this.#branch, remote: this.#remote ?? '' })
      const isolation = typeof opts.isolation === 'function' ? { isolation: await isolationSummary(seen.answer, opts.isolation) } : {}
      return { ...snapshot, forks: await this.#plainForkFiles(), warnings: this.#warnings, ...isolation }
    })
  }

  /**
   * Push: mirror → encrypt → commit → push; when refused, pull and reconcile, then push once more.
   * @param {object} [opts] - {signal?: AbortSignal, isolation?, exclude?, beforeCommit?} (dsh-sync addition, see SyncEngine.push).
   * @returns {Promise<object>}
   */
  async push(opts = {}) {
    const selection = await this.probeMode()
    if (selection.mode === BACKEND_MODES.PLAINTEXT) {
      return { ...(await this.#plain.push(opts)), warnings: this.#warnings }
    }
    return this.#schedule(async () => {
      try {
        this.#requireRemote()
        await fs.mkdir(this.#repoDir, { recursive: true })
        await this.#ensureEncryptedRepo()
        // The plaintext of an isolated conversation leaves the worktree here, and its ciphertext with the encryption.
        const mirror = await this.#mirrorOnly(opts)
        // dsh-sync addition: the project manifest is written inside the lock, once the isolated conversations are known.
        if (typeof opts.beforeCommit === 'function') await opts.beforeCommit()
        await this.#encryptMirror()
        await this.#git.commitAll('dsh-sync: push snapshot (encrypted)')
        try {
          await this.#git.push({ signal: opts.signal })
        } catch (error) {
          if (!(error instanceof SyncError && error.code === 'PUSH_REJECTED')) throw error
          this.#logger.info('push rejected (remote moved); pulling and reconciling before one retry')
          const pulled = await this.#pullInternal({ ...opts, exclude: mirror.exclude })
          if (!pulled.ok) throw error
          await this.#git.push({ signal: opts.signal })
        }
        const head = await this.#git.headSha()
        await this.#git.setRef(BASE_REF, head)
        this.#reportMeta({ lastPushAt: Date.now(), lastPushHead: head })
        this.#logger.info(`sync push ok (encrypted): head ${head ?? ''} (${mirror.mirrored} mirrored, ${mirror.deleted} deleted)`)
        return {
          ok: true,
          pushed: true,
          head,
          mirrored: mirror.mirrored,
          deleted: mirror.deleted.length,
          isolatedLeftOut: mirror.isolatedSkipped,
          isolatedRemoved: mirror.isolatedRemoved.length,
          remote: sanitizeRemote(this.#remote),
          warnings: this.#warnings,
        }
      } catch (error) {
        return this.#fail(error)
      }
    })
  }

  /**
   * Pull: local commit checkpoint → fetch → three-way merge of plain text → encrypt again → commit.
   * @param {object} [opts] - {signal?: AbortSignal, isolation?, exclude?} (dsh-sync addition, see SyncEngine.push).
   * @returns {Promise<object>}
   */
  async pull(opts = {}) {
    const selection = await this.probeMode()
    if (selection.mode === BACKEND_MODES.PLAINTEXT) {
      return { ...(await this.#plain.pull(opts)), warnings: this.#warnings }
    }
    return this.#schedule(async () => {
      try {
        this.#requireRemote()
        await fs.mkdir(this.#repoDir, { recursive: true })
        await this.#ensureEncryptedRepo()
        const mirror = await this.#mirrorOnly(opts)
        await this.#encryptMirror()
        await this.#git.commitAll('dsh-sync: local checkpoint before pull (encrypted)')
        // dsh-sync addition: the merge and the restore leave out the same isolated conversations as the checkpoint.
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
    const fetched = await this.#git.fetch({ signal: opts.signal })
    if (!fetched) {
      this.#reportMeta({ lastPullAt: Date.now() })
      return { ok: true, pulled: false, forks: [], adopted: 0, appended: 0, diverged: 0, warnings: this.#warnings }
    }
    const head = await this.#git.headSha()
    const remoteHead = await this.#git.remoteHeadSha()
    if (remoteHead === undefined || head === remoteHead) {
      this.#reportMeta({ lastPullAt: Date.now() })
      return { ok: true, pulled: false, forks: [], adopted: 0, appended: 0, diverged: 0, warnings: this.#warnings }
    }
    if (await this.#git.countCommitsSafe(head, remoteHead) === 0) {
      this.#reportMeta({ lastPullAt: Date.now() })
      return { ok: true, pulled: false, forks: [], adopted: 0, appended: 0, diverged: 0, warnings: this.#warnings }
    }
    // The three-way merge base: the remote head at the last reconcile (our own ref); the first sync has no base → an empty tree
    // (the same as git's unrelated-histories rule: everything is theirs-only and taken).
    const baseHead = (await this.#git.refSha(BASE_REF)) ?? (await this.#git.mergeBaseOf(head, remoteHead))
    const ours = await readTree(path.join(this.#repoDir, MIRROR_DIR))
    const base = baseHead === undefined ? new Map() : await this.#treeAtRev(baseHead)
    const theirs = await this.#treeAtRev(remoteHead)
    const stamp = new Date().toISOString().replace(/[-:T]/gu, '').slice(0, 14)
    const { merged, forks: rawForks, adopted, appended, diverged } = mergeTrees(base, ours, theirs, stamp, this.deviceShort)
    // dsh-sync addition: what the remote holds of an isolated conversation does not stay in the merge.
    let stripped = 0
    if (typeof opts.exclude === 'function') {
      for (const rel of [...merged.keys()]) {
        if (opts.exclude(rel)) {
          merged.delete(rel)
          stripped += 1
        }
      }
    }
    // Fork paths all get the sessions/ prefix, as in the git backend's ls-files convention (handleForks
    // and the display both rely on this prefix).
    const forks = rawForks.filter(rel => merged.has(rel)).map(rel => `${MIRROR_DIR}/${rel}`)
    // dsh-sync fix: record the remote head as a second parent. Without it the pull commit is not a
    // descendant of the remote, so every later push was rejected as "remote moved".
    const merging = await this.#git.beginOursMerge(remoteHead)
    try {
      await writeTree(path.join(this.#repoDir, MIRROR_DIR), merged)
      // dsh-sync fix: the original encrypted backend merged into the worktree but never copied the result into the live
      // session store, so sessions pulled from another device never appeared. Same step as the plaintext engine.
      const mirrorRoot = path.join(this.#repoDir, MIRROR_DIR)
      const pruned = await pruneRestoredSessions({ repoDir: this.#repoDir, mirrorRoot, sessionRoot: this.#sessionRoot, exclude: opts.exclude })
      const restored = await restoreSessionRoot({ repoDir: this.#repoDir, mirrorRoot, sessionRoot: this.#sessionRoot, exclude: opts.exclude })
      await this.#encryptMirror()
      let newHead
      if (merging) {
        await this.#git.addAll()
        newHead = await this.#git.commitMerge()
      } else {
        newHead = await this.#git.commitAll('dsh-sync: pull merge (encrypted)')
      }
      await this.#git.setRef(BASE_REF, remoteHead)
      this.#reportMeta({ lastPullAt: Date.now() })
      this.#logger.info(`sync pull ok (encrypted): merged remote head ${remoteHead} → ${newHead ?? ''} (${appended} appended-both, ${diverged} diverged, ${forks.length} forks)`)
      if (forks.length > 0) this.#onForks(forks)
      return {
        ok: true,
        pulled: true,
        merged: true,
        adopted,
        appended,
        diverged,
        forks,
        restored: restored.restored,
        restoredSkipped: restored.skippedChanged,
        isolatedRemoved: stripped,
        head: newHead ?? undefined,
        warnings: this.#warnings,
      }
    } catch (error) {
      await this.#git.abortMerge().catch(() => {})
      throw error
    }
  }
}
