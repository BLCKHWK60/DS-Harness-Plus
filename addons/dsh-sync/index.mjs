/**
 * Host half of Sync (dsh-sync).
 *
 * A fork of `dsh-session-sync` 0.2.32 (PerryLink, Apache-2.0), reviewed and changed for this project; see NOTICE.
 * It mirrors dsh's session store into a private git worktree and syncs that with a git remote YOU name, so any
 * number of machines can share sessions through a remote that is always available. No machine has to be on, and
 * nothing here names a machine.
 *
 *   /sync status | pull | push | projects [apply] | help
 *
 * What differs from the original (details in README.md):
 *   - an encryption policy: `optional` (plaintext allowed, with a loud warning everywhere) or `required`
 *     (nothing is sent or received unless age encryption is fully set up);
 *   - the encrypted backend now copies pulled sessions into the live store (the original did not);
 *   - writes into the live session store are atomic and skip a file that changed after it was mirrored;
 *   - the project list is carried as one manifest per device, with a per-machine folder mapping;
 *   - no model tools, no session-level forks, no storage-domain or other dsh package imports (plain child processes
 *     for git and age, a JSON state file), and nothing configured by default.
 * Nothing is configured by default: with no `remote` the plugin only reports status.
 */
import { join, isAbsolute } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { BACKENDS, DEFAULTS, LIMITS } from './lib/constants.mjs'
import { badConfig, messageOf } from './lib/errors.mjs'
import { assertNestingSafe } from './lib/paths.mjs'
import { GitBackend } from './lib/git.mjs'
import { SyncEngine } from './lib/engine.mjs'
import { EncryptedBackend } from './lib/encrypted.mjs'
import { makeAgeRunner, makeGitRunner } from './lib/runner.mjs'
import { SyncState } from './lib/state.mjs'
import { createSyncService } from './lib/policy.mjs'
import { checkFolderMap } from './lib/projects.mjs'
import { renderPull, renderPush } from './lib/render.mjs'

/** Append warnings that the renderers do not always print, so a plaintext transport is never silent. */
function withWarnings(text, result) {
  const missing = (result.warnings ?? []).filter((warning) => !text.includes(warning))
  return missing.length ? `${text}\n${missing.map((warning) => `  WARNING: ${warning}`).join('\n')}` : text
}

export const name = 'sync'

export const Config = z.object({
  enabled: z.boolean().default(true),
  remote: z.string(),
  branch: z.string().default(DEFAULTS.BRANCH),
  backend: z.union([z.const('git'), z.const('encrypted')]).default('git'),
  encryption: z.union([z.const('optional'), z.const('required')]).default('optional'),
  ageBin: z.string().default(DEFAULTS.AGE_BIN),
  ageRecipient: z.string(),
  ageIdentity: z.string(),
  sessionRoot: z.string(),
  repoDir: z.string(),
  dataDir: z.string(),
  deviceLabel: z.string(),
  autoPullOnStart: z.boolean().default(false),
  autoPushOnTurnEnd: z.boolean().default(false),
  pullIntervalMinutes: z.number().min(0).max(LIMITS.MAX_PULL_INTERVAL_MINUTES).default(0),
  minPushIntervalSeconds: z.number().min(5).max(86400).default(60),
  projects: z
    .object({
      sync: z.boolean().default(false),
      autoCreate: z.boolean().default(false),
      folderMap: z.array(z.object({ from: z.string().required(), to: z.string().required() })).default([]),
    })
    .default({ sync: false, autoCreate: false, folderMap: [] }),
  gitBin: z.string().default(DEFAULTS.GIT_BIN),
  commandTimeoutMs: z.number().min(LIMITS.MIN_COMMAND_TIMEOUT_MS).max(LIMITS.MAX_COMMAND_TIMEOUT_MS).default(DEFAULTS.COMMAND_TIMEOUT_MS),
  maxOutputBytes: z.number().min(LIMITS.MIN_MAX_OUTPUT_BYTES).max(LIMITS.MAX_MAX_OUTPUT_BYTES).default(DEFAULTS.MAX_OUTPUT_BYTES),
  commitName: z.string().default(DEFAULTS.COMMIT_NAME),
  commitEmail: z.string().default(DEFAULTS.COMMIT_EMAIL),
  commandName: z.string().default('sync'),
})

/**
 * Unwrap a Config value that may be a reactive reference.
 * @param {unknown} value - Config value.
 * @returns {unknown} plain value.
 */
function plain(value) {
  if (value === null || typeof value !== 'object') return value
  if (typeof value.get === 'function' && Object.isFrozen(value)) {
    try {
      return plain(value.get())
    } catch {
      return undefined
    }
  }
  if (Array.isArray(value)) return value.map(plain)
  const result = {}
  for (const [key, child] of Object.entries(value)) result[key] = plain(child)
  return result
}

/**
 * Check a remote address. Credentials never belong in it, and git transport helpers are refused.
 * @param {string} remote - git URL or path.
 * @returns {string} the trimmed remote.
 */
export function checkRemote(remote) {
  const value = String(remote ?? '').trim()
  if (!value) return ''
  // An absolute folder path may contain spaces (iCloud Drive's is ".../Mobile Documents/..."); URLs may not.
  const localPath = value.startsWith('/')
  if ((localPath ? /[\0\r\n\t]/ : /[\s\0]/).test(value) || value.startsWith('-')) throw badConfig('remote must be one git URL or path (spaces only in an absolute folder path, not starting with "-")')
  if (/^[A-Za-z][A-Za-z0-9+.-]*::/.test(value)) throw badConfig('remote: git transport helpers ("ext::" and similar) are not allowed')
  const scheme = value.match(/^([A-Za-z][A-Za-z0-9+.-]*):\/\//)
  if (scheme) {
    if (!['https', 'http', 'ssh', 'git', 'file'].includes(scheme[1].toLowerCase())) throw badConfig(`remote: scheme "${scheme[1]}" is not allowed (use https, ssh, git or file)`)
    let url
    try {
      url = new URL(value)
    } catch {
      throw badConfig('remote is not a valid URL')
    }
    if (url.password || (/^https?:$/.test(url.protocol) && url.username)) throw badConfig('remote must not contain credentials; use git\'s credential helper or an ssh key')
  }
  return value
}

/**
 * Validate and complete the config.
 * @param {object} cfg - plain config.
 * @param {(sub: string) => string | undefined} homePath - dsh home folder resolver.
 * @returns {object} resolved settings.
 */
export function resolveSettings(cfg, homePath) {
  const remote = checkRemote(cfg.remote)
  const branch = String(cfg.branch ?? DEFAULTS.BRANCH)
  if (!/^[A-Za-z0-9._/-]+$/u.test(branch)) throw badConfig('branch must be a ref-safe name')
  const backend = cfg.backend === BACKENDS.ENCRYPTED ? 'encrypted' : 'git'
  const encryption = cfg.encryption === 'required' ? 'required' : 'optional'
  if (encryption === 'required' && backend !== 'encrypted') throw badConfig('encryption: required needs backend: encrypted')
  const ageRecipient = String(cfg.ageRecipient ?? '').trim()
  const ageIdentity = String(cfg.ageIdentity ?? '').trim()
  if (/AGE-SECRET-KEY-/.test(ageRecipient) || /AGE-SECRET-KEY-/.test(ageIdentity)) throw badConfig('ageIdentity is the PATH of a key file, never the key itself; ageRecipient is the public key')
  if (ageIdentity && !isAbsolute(ageIdentity)) throw badConfig('ageIdentity must be an absolute path to a key file')
  if (backend === 'encrypted' && encryption === 'required' && (!ageRecipient || !ageIdentity)) throw badConfig('encryption: required needs ageRecipient and ageIdentity')
  const dataDir = String(cfg.dataDir ?? '').trim() || String(homePath('sync') ?? '')
  const sessionRoot = String(cfg.sessionRoot ?? '').trim() || String(homePath('sessions') ?? '')
  const repoDir = String(cfg.repoDir ?? '').trim() || (dataDir ? join(dataDir, 'repo') : '')
  for (const [label, value] of [['dataDir', dataDir], ['sessionRoot', sessionRoot], ['repoDir', repoDir]]) {
    if (!value || !isAbsolute(value)) throw badConfig(`${label} must be an absolute path (no dsh home folder was available as a default)`)
  }
  assertNestingSafe(sessionRoot, repoDir)
  if (String(cfg.commitName ?? DEFAULTS.COMMIT_NAME).trim() === '' || String(cfg.commitEmail ?? DEFAULTS.COMMIT_EMAIL).trim() === '') throw badConfig('commitName and commitEmail must not be empty')
  const projects = cfg.projects ?? {}
  return {
    enabled: cfg.enabled !== false,
    remote,
    branch,
    backend,
    encryption,
    ageBin: String(cfg.ageBin || DEFAULTS.AGE_BIN),
    ageRecipient,
    ageIdentity,
    dataDir,
    sessionRoot,
    repoDir,
    deviceLabel: String(cfg.deviceLabel ?? '').slice(0, 40),
    autoPullOnStart: cfg.autoPullOnStart === true,
    autoPushOnTurnEnd: cfg.autoPushOnTurnEnd === true,
    pullIntervalMinutes: Math.floor(Number(cfg.pullIntervalMinutes) || 0),
    minPushIntervalSeconds: Number(cfg.minPushIntervalSeconds) || 60,
    projects: { sync: projects.sync === true, autoCreate: projects.autoCreate === true, folderMap: checkFolderMap(projects.folderMap) },
    gitBin: String(cfg.gitBin || DEFAULTS.GIT_BIN),
    commandTimeoutMs: Number(cfg.commandTimeoutMs) || DEFAULTS.COMMAND_TIMEOUT_MS,
    maxOutputBytes: Number(cfg.maxOutputBytes) || DEFAULTS.MAX_OUTPUT_BYTES,
    commitName: String(cfg.commitName || DEFAULTS.COMMIT_NAME),
    commitEmail: String(cfg.commitEmail || DEFAULTS.COMMIT_EMAIL),
    commandName: String(cfg.commandName ?? 'sync').trim(),
  }
}

/**
 * Plugin entry.
 * @param {object} ctx - Cordis context.
 * @param {object} config - plugin config.
 */
export function apply(ctx, config) {
  const cfg = plain(config) ?? {}
  if (cfg.enabled === false) return
  const homeFn = ctx.get('dshHomePath')
  const settings = resolveSettings(cfg, (sub) => (typeof homeFn === 'function' ? homeFn(sub) : undefined))

  const log = (level) => (message) => {
    try {
      ctx.logger?.('sync')?.[level]?.(message)
    } catch {
      // logging must never break a sync
    }
  }
  const logger = { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') }

  const state = new SyncState(settings.dataDir)
  const git = new GitBackend({
    repoDir: settings.repoDir,
    remote: settings.remote,
    branch: settings.branch,
    commitName: settings.commitName,
    commitEmail: settings.commitEmail,
    run: makeGitRunner({ gitBin: settings.gitBin, commandTimeoutMs: settings.commandTimeoutMs, maxOutputBytes: settings.maxOutputBytes, maxBinaryBytes: 256 * 1024 * 1024 }),
    timeoutMs: settings.commandTimeoutMs,
  })
  const engineDeps = {
    git,
    sessionRoot: settings.sessionRoot,
    repoDir: settings.repoDir,
    remote: settings.remote,
    branch: settings.branch,
    deviceId: state.deviceId,
    reportMeta: () => {},
    reportError: () => {},
    onForks: (forks) => logger.warn(`sync kept both sides of ${forks.length} conflicting session file(s) as fork files: ${forks.slice(0, 5).join(', ')}`),
    logger,
  }
  const engine =
    settings.backend === 'encrypted'
      ? new EncryptedBackend({
          ...engineDeps,
          run: makeAgeRunner({ commandTimeoutMs: settings.commandTimeoutMs, maxOutputBytes: settings.maxOutputBytes }),
          ageBin: settings.ageBin,
          ageRecipient: settings.ageRecipient,
          ageIdentity: settings.ageIdentity,
          timeoutMs: settings.commandTimeoutMs,
        })
      : new SyncEngine(engineDeps)
  engine.deviceId = state.deviceId

  const service = createSyncService({
    engine,
    backend: settings.backend,
    encryption: settings.encryption,
    state,
    repoDir: settings.repoDir,
    projects: settings.projects,
    deviceLabel: settings.deviceLabel,
    registry: () => ctx.get('workspaceRegistry'),
    logger,
  })

  const abort = new AbortController()
  ctx.effect(() => () => abort.abort(new Error('sync plugin unloaded')), 'sync abort on unload')
  ctx.effect(() => ctx.provide('sync', Object.freeze({ ...service, settings: () => ({ ...settings, ageIdentity: settings.ageIdentity ? '(set)' : '' }) })), 'sync service')

  // ---- automatic modes (all off by default; all need a remote) ----
  if (settings.remote) {
    const startedAt = Date.now()
    /** Run one operation in the background and log its outcome. */
    const background = (what, run) => {
      void run({ signal: abort.signal })
        .then((result) => (result.ok ? logger.info(`auto ${what} ok`) : logger.warn(`auto ${what} failed: ${result.error}`)))
        .catch((error) => logger.warn(`auto ${what} failed: ${messageOf(error)}`))
    }
    if (settings.autoPullOnStart) {
      ctx.effect(() => {
        const timer = setTimeout(() => background('pull', (o) => service.pull(o)), 2000)
        timer.unref?.()
        return () => clearTimeout(timer)
      }, 'sync pull on start')
    }
    if (settings.pullIntervalMinutes > 0) {
      ctx.effect(() => {
        const timer = setInterval(() => background('pull', (o) => service.pull(o)), settings.pullIntervalMinutes * 60000)
        timer.unref?.()
        return () => clearInterval(timer)
      }, 'sync periodic pull')
    }
    if (settings.autoPushOnTurnEnd) {
      let lastPush = 0
      let timer
      ctx.effect(() => () => clearTimeout(timer), 'sync push timer')
      ctx.on('session/event', (session, event) => {
        try {
          if (event?.type !== 'turn/end') return
          const stamp = event?.time ? new Date(event.time).getTime() : Date.now()
          if (Number.isFinite(stamp) && stamp < startedAt - 5000) return
          const header = session?.header ?? session
          if (header?.origin === 'subagent' || header?.parentSession || Number(header?.delegationDepth) > 0) return
          if (timer) return
          const wait = Math.max(0, lastPush + settings.minPushIntervalSeconds * 1000 - Date.now())
          timer = setTimeout(() => {
            timer = undefined
            lastPush = Date.now()
            background('push', (o) => service.push(o))
          }, wait)
          timer.unref?.()
        } catch (error) {
          logger.warn(`could not schedule a push: ${messageOf(error)}`)
        }
      })
    }
  }

  // ---- command ----
  if (!settings.commandName) return
  const usage = `Usage: /${settings.commandName} status | pull | push | projects [apply]`
  ctx.inject(['commands'], (inner) => {
    inner.effect(
      () =>
        inner.commands.register({
          name: settings.commandName,
          description: 'Sync sessions with a git remote: `status`, `pull`, `push`, `projects [apply]`',
          input: { hint: 'status | pull | push | projects [apply]' },
          handler: async ({ rawInput, signal }) => {
            const [verb = 'status', arg] = String(rawInput ?? '').trim().split(/\s+/)
            const options = { signal: signal ?? abort.signal }
            try {
              if (verb === 'status' || verb === '') return { kind: 'success', text: await service.statusText() }
              if (verb === 'help') return { kind: 'success', text: usage }
              if (!settings.remote && (verb === 'pull' || verb === 'push')) return { kind: 'error', text: 'No remote is configured. Set `remote` in the sync plugin settings.' }
              if (verb === 'pull') {
                const result = await service.pull(options)
                const lines = [renderPull(result)]
                if (result.ok && (result.restored ?? 0) > 0) lines.push(`  copied ${result.restored} session file(s) into this machine's session store`)
                if (result.restoredSkipped?.length) lines.push(`  left ${result.restoredSkipped.length} live session file(s) alone because they are open in the app or changed during the pull; pull again when those conversations are closed`)
                if (result.projectPlan?.some((item) => item.state === 'create')) lines.push(`  ${result.projectPlan.filter((item) => item.state === 'create').length} project(s) from other devices can be added: /${settings.commandName} projects`)
                return { kind: result.ok ? 'success' : 'error', text: withWarnings(lines.join('\n'), result) }
              }
              if (verb === 'push') {
                const result = await service.push(options)
                return { kind: result.ok ? 'success' : 'error', text: withWarnings(renderPush(result), result) }
              }
              if (verb === 'projects') {
                if (arg === 'apply') return { kind: 'success', text: (await service.applyProjects()).text }
                return { kind: 'success', text: (await service.projects()).text }
              }
              return { kind: 'error', text: usage }
            } catch (error) {
              return { kind: 'error', text: messageOf(error) }
            }
          },
        }),
      'sync command',
    )
  })
}
