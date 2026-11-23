// lib/git.mjs — the git command layer (no DSH dependency; index.mjs passes the runner in through ctx.subprocess).
//
// Safety limits:
// - an allow list of verbs + argument assertions (enforced at run time, so a future change cannot break them);
// - never sends a force push (`-f`/`--force`/`--force-with-lease`/`+refspec` are all refused);
// - never sends reset/clean/rebase or a checkout that switches branch — the work tree changes only through add/commit/
//   merge(--no-commit)/checkout(--ours|--theirs with explicit paths);
// - error messages are cleaned before they are embedded (remote credentials and token shapes always go through redactText).
//
// The runner contract (built by index.mjs):
//   run(args, { cwd, signal, timeoutMs, binary, maxBytes }) → { code, stdout, stderr }
//   stdout: UTF-8 text when binary=false; a Buffer (raw bytes) when binary=true.

import { redactText } from './sanitize.mjs'
import { gitFailed, pushRejected } from './errors.mjs'
import { LIMITS } from './constants.mjs'

/** The allowed top-level verbs. */
export const ALLOWED_VERBS = new Set([
  'init',
  'config',
  'remote',
  'add',
  'commit',
  'push',
  'fetch',
  'merge',
  'merge-base',
  'rev-parse',
  'log',
  'diff',
  'cat-file',
  'show',
  'checkout',
  'ls-files',
  'ls-tree',
  'update-ref',
  'status',
])

/** Assert that a command is a safe primitive on the allow list. */
export function assertSafe(args) {
  const verb = args[0] ?? ''
  if (!ALLOWED_VERBS.has(verb)) {
    throw gitFailed('assert', `forbidden git verb ${JSON.stringify(verb)} (whitelist violation)`)
  }
  if (verb === 'push') {
    for (const arg of args.slice(1)) {
      if (arg === '-f' || arg === '--force' || arg === '--force-with-lease' || arg === '--mirror' || arg.startsWith('+')) {
        throw gitFailed('assert', `git push argument ${JSON.stringify(arg)} is forbidden (never force-push)`)
      }
    }
  }
  if (verb === 'checkout' && !(args.includes('--ours') || args.includes('--theirs'))) {
    throw gitFailed('assert', 'git checkout is only allowed with --ours/--theirs (no branch switching)')
  }
  if (verb === 'merge' && !(args.includes('--no-commit') || args.includes('--abort'))) {
    throw gitFailed('assert', 'git merge is only allowed with --no-commit or --abort')
  }
  if (verb === 'commit' && args.includes('--amend')) {
    throw gitFailed('assert', 'git commit --amend is forbidden (history is append-only)')
  }
}

/**
 * The git sync backend. Every command runs one at a time through an internal lock chain (one per repository).
 */
export class GitBackend {
  /** @type {(args: string[], opts?: object) => Promise<{code: number, stdout: string|Buffer, stderr: string}>} */
  #run
  /** @type {string} the work-tree root. */
  #repoDir
  /** @type {string} the remote address (as given, not cleaned; only for git commands; always shown through sanitizeRemote). */
  #remote
  /** @type {string} the branch name. */
  #branch
  /** @type {string} the committer name. */
  #commitName
  /** @type {string} the committer email. */
  #commitEmail
  /** @type {Promise<unknown>} the per-repository serial chain. */
  #chain = Promise.resolve()
  /** @type {number} the time limit for one command. */
  #timeoutMs

  /**
   * @param {object} deps - {repoDir, remote, branch, commitName, commitEmail, run, timeoutMs}.
   */
  constructor(deps) {
    this.#run = deps.run
    this.#repoDir = deps.repoDir
    this.#remote = deps.remote
    this.#branch = deps.branch
    this.#commitName = deps.commitName
    this.#commitEmail = deps.commitEmail
    this.#timeoutMs = deps.timeoutMs
  }

  /**
   * Run in order: every operation on one repository queues in turn (mirror, push and pull never interleave).
   * @template T
   * @param {() => Promise<T>} fn - the queued operation.
   * @returns {Promise<T>}
   */
  schedule(fn) {
    const run = this.#chain.then(fn, fn)
    this.#chain = run.then(() => undefined, () => undefined)
    return run
  }

  /**
   * Run one git command (allow-list assertion → runner → failure wrapping).
   * @param {string[]} args - the git arguments (without gitBin).
   * @param {object} [opts] - {binary?: boolean, signal?: AbortSignal}.
   * @returns {Promise<{code: number, stdout: string|Buffer, stderr: string}>}
   */
  async #git(args, opts = {}) {
    assertSafe(args)
    try {
      return await this.#run(args, {
        cwd: this.#repoDir,
        binary: opts.binary ?? false,
        timeoutMs: this.#timeoutMs,
        signal: opts.signal,
      })
    } catch (error) {
      throw gitFailed(args[0] ?? 'git', redactText(error instanceof Error ? error.message : String(error)))
    }
  }

  /** A git call that must succeed (code !== 0 → gitFailed, with the tail of stderr cleaned and embedded). */
  async #must(args, opts = {}) {
    const result = await this.#git(args, opts)
    if (result.code !== 0) {
      const tail = redactText(String(result.stderr ?? '')).trim().split('\n').slice(-3).join(' | ') || `exit ${result.code}`
      throw gitFailed(args[0] ?? 'git', tail)
    }
    return result
  }

  /** A git call that may fail (a non-zero exit returns null; runner and allow-list errors still throw). */
  async #maybe(args, opts = {}) {
    const result = await this.#git(args, opts)
    return result.code === 0 ? result : null
  }

  /** Whether the folder is already a git repository. */
  async isRepo() {
    const out = await this.#maybe(['rev-parse', '--is-inside-work-tree'])
    return out !== null && String(out.stdout).trim() === 'true'
  }

  /**
   * Local init (no remote, no commit): init (if missing) → turn off line-ending conversion → committer identity.
   * Shared by status and bootstrap; the caller (the engine) must already have made repoDir.
   * @returns {Promise<void>}
   */
  async ensureRepo() {
    if (!(await this.isRepo())) {
      await this.#must(['init', '-b', this.#branch])
    }
    // The byte mirror must keep every byte: core.autocrlf=false turns off the checkout/checkin
    // CRLF/LF conversion (otherwise a Windows checkout would turn LF session bytes into CRLF and break the mirror).
    await this.#must(['config', 'core.autocrlf', 'false'])
    await this.#must(['config', 'user.name', this.#commitName])
    await this.#must(['config', 'user.email', this.#commitEmail])
  }

  /**
   * Bootstrap the repository: local init → origin remote (add or change) → first commit.
   * Idempotent: runs on every mount or first operation, at the cost of a few local commands.
   * @returns {Promise<void>}
   */
  async bootstrap() {
    await this.ensureRepo()
    const current = await this.#maybe(['remote', 'get-url', 'origin'])
    if (current === null) {
      await this.#must(['remote', 'add', 'origin', this.#remote])
    } else if (String(current.stdout).trim() !== this.#remote.trim()) {
      await this.#must(['remote', 'set-url', 'origin', this.#remote])
    }
    const head = await this.headSha()
    if (head === undefined) {
      await this.commitAll('dsh-sync: initial commit', { allowEmpty: true })
    }
  }

  /** The current HEAD sha; undefined when unborn. */
  async headSha() {
    const out = await this.#maybe(['rev-parse', '--verify', 'HEAD'])
    const sha = out === null ? '' : String(out.stdout).trim()
    return sha === '' ? undefined : sha
  }

  /** The remote-tracking ref (refs/remotes/origin/<branch>) sha; undefined if never fetched. */
  async remoteHeadSha() {
    const out = await this.#maybe(['rev-parse', '--verify', `refs/remotes/origin/${this.#branch}`])
    const sha = out === null ? '' : String(out.stdout).trim()
    return sha === '' ? undefined : sha
  }

  /** Any ref's sha; undefined when it does not exist. */
  async refSha(ref) {
    const out = await this.#maybe(['rev-parse', '--verify', ref])
    const sha = out === null ? '' : String(out.stdout).trim()
    return sha === '' ? undefined : sha
  }

  /** Move a ref to a commit (the plugin's own refs/dsh-sync/ namespace; does not touch the work tree). */
  async setRef(ref, sha) {
    await this.#must(['update-ref', ref, sha])
  }

  /** The merge base sha of two commits; undefined when they have no common ancestor. */
  async mergeBaseOf(left, right) {
    const out = await this.#maybe(['merge-base', left, right])
    const sha = out === null ? '' : String(out.stdout).trim()
    return sha === '' ? undefined : sha
  }

  /** Count commits (the number of log --oneline lines; rev-list is not on the allow list). */
  async countCommitsSafe(left, right) {
    if (left === right) return 0
    const out = await this.#maybe(['log', '--oneline', `${left}..${right}`])
    if (out === null) return 0
    const lines = String(out.stdout).trim()
    return lines === '' ? 0 : lines.split('\n').length
  }

  /**
   * Commit the whole work tree (add -A → commit only when something changed). Returns the new HEAD sha, or
   * null when nothing changed.
   * @param {string} message - the commit message (already cut to length).
   * @param {object} [opts] - {allowEmpty?: boolean}.
   * @returns {Promise<string|null>}
   */
  async commitAll(message, opts = {}) {
    await this.#must(['add', '-A'])
    const status = await this.#must(['status', '--porcelain'])
    if (String(status.stdout).trim() === '' && !(opts.allowEmpty ?? false)) return null
    await this.#must(['commit', '-m', message.slice(0, LIMITS.MAX_COMMIT_MESSAGE_LENGTH), ...(opts.allowEmpty === true ? ['--allow-empty'] : [])])
    return this.headSha() ?? null
  }

  /**
   * Push to the remote (explicit refspec HEAD:refs/heads/<branch>, independent of the local branch name).
   * Refused (the remote is ahead) → PUSH_REJECTED; never retries with a force push.
   * @param {object} [opts] - {signal?: AbortSignal}.
   * @returns {Promise<void>}
   */
  async push(opts = {}) {
    const result = await this.#git(['push', 'origin', `HEAD:refs/heads/${this.#branch}`], { signal: opts.signal })
    if (result.code !== 0) {
      throw pushRejected(redactText(String(result.stderr ?? '')).trim().split('\n').slice(-3).join(' | ') || `exit ${result.code}`)
    }
  }

  /**
   * Fetch the remote branch into the remote-tracking ref (the + affects only the tracking ref, never the work tree).
   * Returns false when the remote has no such branch yet (before the first push).
   * @param {object} [opts] - {signal?: AbortSignal}.
   * @returns {Promise<boolean>} whether the remote branch was fetched.
   */
  async fetch(opts = {}) {
    const result = await this.#git(['fetch', 'origin', `${this.#branch}:refs/remotes/origin/${this.#branch}`], { signal: opts.signal })
    if (result.code === 0) return true
    const stderr = String(result.stderr ?? '')
    if (/couldn't find remote ref/i.test(stderr)) return false
    throw gitFailed('fetch', redactText(stderr).trim().split('\n').slice(-3).join(' | ') || `exit ${result.code}`)
  }

  /**
   * Start a merge: git merge --no-commit --allow-unrelated-histories <remoteHead>.
   * A clean automatic merge exits 0 (changes staged, waiting for commit --no-edit to make the merge commit);
   * a conflict exits 1 (the work tree is ours + conflict markers; resolve each path, then add).
   * Already up to date exits 0 with no MERGE_HEAD.
   * --allow-unrelated-histories: needed for a first pull (an empty local repository + an independent remote
   * history); when the two histories are related, the flag is a harmless no-op.
   * @param {string} remoteHead - the remote head sha.
   * @returns {Promise<{conflicted: boolean, inProgress: boolean}>}
   */
  async beginMerge(remoteHead) {
    const result = await this.#git(['merge', '--no-commit', '--allow-unrelated-histories', remoteHead])
    if (result.code === 0) {
      const stderr = String(result.stderr ?? '')
      if (/already up to date/i.test(stderr)) return { conflicted: false, inProgress: false }
      return { conflicted: false, inProgress: true }
    }
    const inProgress = await this.mergeInProgress()
    return { conflicted: inProgress, inProgress }
  }

  /**
   * Start a merge that records `remoteHead` as a second parent but keeps our tree
   * (`-s ours`). The caller writes the reconciled tree, then calls addAll + commitMerge.
   * The encrypted backend merges plaintext itself; this only makes the history a
   * fast-forward of the remote so the next push is accepted.
   * @param {string} remoteHead - remote head sha.
   * @returns {Promise<boolean>} whether a merge is now in progress.
   */
  async beginOursMerge(remoteHead) {
    await this.#must(['merge', '--no-commit', '--no-ff', '-s', 'ours', '--allow-unrelated-histories', remoteHead])
    return this.mergeInProgress()
  }

  /** Whether a merge is in progress (MERGE_HEAD). */
  async mergeInProgress() {
    const out = await this.#maybe(['rev-parse', '--verify', 'MERGE_HEAD'])
    return out !== null && String(out.stdout).trim() !== ''
  }

  /** Abandon the merge in progress (used to recover on a failure path). */
  async abortMerge() {
    if (!(await this.mergeInProgress())) return
    await this.#must(['merge', '--abort'])
  }

  /**
   * The list of conflicting paths (parsed from ls-files -u: stage 1=base, 2=ours, 3=theirs).
   * @returns {Promise<Array<{path: string, base?: string, ours?: string, theirs?: string}>>}
   */
  async conflictedPaths() {
    const out = await this.#must(['ls-files', '-u'])
    const byPath = new Map()
    for (const line of String(out.stdout).split('\n')) {
      if (line.trim() === '') continue
      // Format: <mode> <sha> <stage>\t<path> (an unmerged path has a stage even when its sha is all zeros).
      const [meta, ...rest] = line.split('\t')
      const rel = rest.join('\t')
      const stage = (meta ?? '').split(/\s+/)[2]
      let entry = byPath.get(rel)
      if (entry === undefined) {
        entry = { path: rel }
        byPath.set(rel, entry)
      }
      if (stage === '1') entry.base = (meta ?? '').split(/\s+/)[1]
      else if (stage === '2') entry.ours = (meta ?? '').split(/\s+/)[1]
      else if (stage === '3') entry.theirs = (meta ?? '').split(/\s+/)[1]
    }
    return [...byPath.values()]
  }

  /**
   * Read the raw bytes of a conflict index stage blob (cat-file blob :<stage>:<path>).
   * @param {string} stage - 1|2|3.
   * @param {string} rel - the repository-relative path.
   * @returns {Promise<Buffer|undefined>} the content; undefined when the stage is missing.
   */
  async readStageBlob(stage, rel) {
    const out = await this.#maybe(['cat-file', 'blob', `:${stage}:${rel}`], { binary: true })
    if (out === null) return undefined
    return Buffer.isBuffer(out.stdout) ? out.stdout : Buffer.from(String(out.stdout))
  }

  /**
   * Check out one file from an index stage into the work tree (only --ours/--theirs + an explicit path).
   * @param {'ours'|'theirs'} which - which side to check out.
   * @param {string} rel - the repository-relative path.
   * @returns {Promise<void>}
   */
  async checkoutStage(which, rel) {
    await this.#must(['checkout', `--${which}`, '--', rel])
  }

  /** Stage everything (after conflicts are resolved, before the merge commit). */
  async addAll() {
    await this.#must(['add', '-A'])
  }

  /** Make the merge commit (a real two-parent merge commit when MERGE_HEAD is there). */
  async commitMerge() {
    if (!(await this.mergeInProgress())) return null
    await this.#must(['commit', '--no-edit'])
    return this.headSha() ?? null
  }

  /** The summaries of the last N commits (log --oneline -n). */
  async recentCommits(limit) {
    const out = await this.#maybe(['log', '--oneline', `-n${Math.max(1, Math.floor(limit))}`])
    if (out === null) return []
    return String(out.stdout).trim().split('\n').filter(line => line.length > 0)
  }

  /** The work tree's dirty state (the raw lines of status --porcelain). */
  async dirtyLines() {
    // -uall: list every untracked FILE individually (porcelain otherwise
    // collapses a fully-untracked directory into one '?? dir/' entry).
    const out = await this.#must(['status', '--porcelain', '-uall'])
    return String(out.stdout).split('\n').filter(line => line.trim() !== '')
  }

  /** The list of tracked files (ls-files). */
  async lsFiles() {
    const out = await this.#must(['ls-files'])
    return String(out.stdout).split('\n').filter(line => line.length > 0)
  }

  /**
   * Every tracked file at a commit (ls-tree -r --name-only; used by the encrypted backend to read
   * the encrypted tree of the remote or base commit). Read-only; does not touch the work tree.
   * @param {string} rev - a commit sha or ref name.
   * @returns {Promise<string[]>} repository-relative paths (an empty array for an empty or unreadable commit).
   */
  async listFilesAtRev(rev) {
    const out = await this.#maybe(['ls-tree', '-r', '--name-only', rev])
    if (out === null) return []
    return String(out.stdout).split('\n').filter(line => line.length > 0)
  }

  /**
   * Read the raw bytes of one file's blob at a commit (cat-file blob <rev>:<rel>).
   * @param {string} rev - a commit sha or ref name.
   * @param {string} rel - the repository-relative path.
   * @returns {Promise<Buffer|undefined>} the content; undefined when the path or commit is missing.
   */
  async readFileAtRev(rev, rel) {
    const out = await this.#maybe(['cat-file', 'blob', `${rev}:${rel}`], { binary: true })
    if (out === null) return undefined
    return Buffer.isBuffer(out.stdout) ? out.stdout : Buffer.from(String(out.stdout))
  }

  /** Path change counts between two commits (diff --stat). */
  async diffStat(left, right) {
    const out = await this.#maybe(['diff', '--stat', left, right])
    if (out === null) return ''
    return String(out.stdout).trim()
  }
}
