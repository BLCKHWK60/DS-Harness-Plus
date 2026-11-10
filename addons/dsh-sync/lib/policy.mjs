// lib/policy.mjs — dsh-sync addition: the service the commands and auto modes call.
// It adds, around the engine: the encryption policy (optional with a loud warning, or required so nothing is sent
// without encryption), the project manifests, and the state file.
import { promises as fs } from 'node:fs'
import { renderStatus } from './render.mjs'
import { messageOf } from './errors.mjs'
import { applyProjects, planProjects, readManifests, renderPlan, writeManifest } from './projects.mjs'

export const PLAINTEXT_WARNING =
  'PLAINTEXT: session text is stored unencrypted in the sync repository and on its remote. Use backend "encrypted" with age, or set encryption: required.'

/**
 * Build the sync service.
 * @param {object} deps - dependencies.
 * @param {{status: Function, push: Function, pull: Function, probeMode?: Function, deviceId?: string}} deps.engine - SyncEngine or EncryptedBackend.
 * @param {string} deps.backend - 'git' or 'encrypted'.
 * @param {'optional' | 'required'} deps.encryption - policy.
 * @param {import('./state.mjs').SyncState} deps.state - state file.
 * @param {string} deps.repoDir - sync worktree.
 * @param {{sync: boolean, autoCreate: boolean, folderMap: Array<{from: string, to: string}>}} deps.projects - project settings.
 * @param {string} deps.deviceLabel - label written into this device's manifest.
 * @param {() => object | undefined} deps.registry - returns dsh's workspace registry when available.
 * @param {{warn: Function, info: Function}} deps.logger - logger.
 * @returns {object} service.
 */
export function createSyncService(deps) {
  const { engine, backend, encryption, state, repoDir, projects, logger } = deps

  /** @returns {Promise<{mode: 'plaintext' | 'encrypted', warnings: string[]}>} how session text would travel. */
  async function transport() {
    // The age probe runs with the worktree as its working folder, so the folder must exist before the first probe
    // (without it the probe fails and the backend would wrongly report that age is missing).
    await fs.mkdir(repoDir, { recursive: true, mode: 0o700 })
    if (backend !== 'encrypted' || typeof engine.probeMode !== 'function') return { mode: 'plaintext', warnings: [PLAINTEXT_WARNING] }
    const selection = await engine.probeMode()
    return selection.mode === 'encrypted' ? { mode: 'encrypted', warnings: [] } : { mode: 'plaintext', warnings: [...selection.warnings, PLAINTEXT_WARNING] }
  }

  /** @returns {Promise<{blocked?: string, warnings: string[]}>} a reason when the policy forbids sending. */
  async function checkPolicy() {
    const selection = await transport()
    if (encryption === 'required' && selection.mode !== 'encrypted') {
      return { blocked: `encryption is required but not active, so nothing was sent or received. ${selection.warnings.filter((w) => w !== PLAINTEXT_WARNING).join(' ')}`.trim(), warnings: selection.warnings }
    }
    return { warnings: selection.warnings }
  }

  /** Write this device's project manifest (when project sync is on). */
  async function exportProjects() {
    if (!projects.sync) return
    const registry = deps.registry()
    if (!registry?.list) return
    try {
      const list = registry.list().map((entity) => ({ id: entity.id, title: entity.title, path: entity.path }))
      await writeManifest({ repoDir, deviceShort: state.deviceShort, deviceId: state.deviceId, label: deps.deviceLabel, projects: list })
    } catch (error) {
      logger.warn(`could not write the project manifest: ${messageOf(error)}`)
    }
  }

  /** @returns {Promise<Array<object>>} what applying the other devices' projects would do here. */
  async function planFromManifests() {
    const manifests = await readManifests({ repoDir, ownShort: state.deviceShort })
    return planProjects({ manifests, rules: projects.folderMap, registry: deps.registry() })
  }

  /** Record the outcome of an operation in the state file. */
  function remember(kind, result) {
    state.patch(result.ok ? { [kind === 'push' ? 'lastPushAt' : 'lastPullAt']: Date.now(), lastError: '' } : { lastError: result.error ?? 'failed' })
  }

  const service = {
    apiVersion: 1,

    /** @returns {Promise<object>} engine status plus state, warnings and the encryption mode. */
    async status() {
      const [base, selection] = [await engine.status(), await transport()]
      const meta = state.read()
      return { ...base, warnings: [...new Set([...(base.warnings ?? []), ...selection.warnings])], mode: selection.mode, encryption, lastPullAt: meta.lastPullAt, lastPushAt: meta.lastPushAt, lastError: meta.lastError || base.error }
    },

    /** @returns {Promise<string>} status as text. */
    async statusText() {
      const status = await service.status()
      const lines = [renderStatus(status)]
      lines.push(`      transport: ${status.mode === 'encrypted' ? 'encrypted (age)' : 'PLAINTEXT'} · encryption policy: ${encryption}`)
      lines.push(`      last pull ${status.lastPullAt ? new Date(status.lastPullAt).toISOString() : '-'} · last push ${status.lastPushAt ? new Date(status.lastPushAt).toISOString() : '-'}`)
      return lines.join('\n')
    },

    /** Upload local sessions (and this device's project list). */
    async push(options = {}) {
      const gate = await checkPolicy()
      if (gate.blocked) return { ok: false, error: gate.blocked, warnings: gate.warnings }
      await exportProjects()
      const result = await engine.push(options)
      remember('push', result)
      return { ...result, warnings: [...new Set([...(result.warnings ?? []), ...gate.warnings])] }
    },

    /** Download other devices' changes; then plan (or apply) their projects. */
    async pull(options = {}) {
      const gate = await checkPolicy()
      if (gate.blocked) return { ok: false, error: gate.blocked, warnings: gate.warnings }
      const result = await engine.pull(options)
      remember('pull', result)
      let projectPlan
      if (result.ok && projects.sync) {
        try {
          projectPlan = await planFromManifests()
          if (projects.autoCreate && deps.registry()?.create) {
            const outcome = await applyProjects(projectPlan, deps.registry())
            if (outcome.created.length) logger.info(`created ${outcome.created.length} project(s) from other devices`)
            projectPlan = await planFromManifests()
          }
        } catch (error) {
          logger.warn(`could not read other devices' projects: ${messageOf(error)}`)
        }
      }
      return { ...result, projectPlan, warnings: [...new Set([...(result.warnings ?? []), ...gate.warnings])] }
    },

    /** @returns {Promise<{plan: Array<object>, text: string}>} what applying projects would do. */
    async projects() {
      if (!projects.sync) return { plan: [], text: 'Project sync is off (projects.sync is false).' }
      const plan = await planFromManifests()
      return { plan, text: renderPlan(plan) }
    },

    /** @returns {Promise<{created: string[], failed: string[], text: string}>} add the projects that can be added. */
    async applyProjects() {
      if (!projects.sync) return { created: [], failed: [], text: 'Project sync is off (projects.sync is false).' }
      const registry = deps.registry()
      if (!registry?.create) return { created: [], failed: [], text: 'dsh has no project registry here, so projects cannot be added.' }
      const outcome = await applyProjects(await planFromManifests(), registry)
      return { ...outcome, text: `Added ${outcome.created.length} project(s)${outcome.failed.length ? `, ${outcome.failed.length} failed` : ''}.` }
    },
  }
  return service
}
