// lib/projects.mjs — dsh-sync addition: carry the project list between devices.
//
// Each device writes ONE manifest of its own projects (title and folder) into the sync repository,
// `<mirror>/__dsh-sync__/projects/<device>.json`, so two devices never write the same file and never conflict.
// After a pull a device reads the other devices' manifests and, with `/sync projects apply` (or `autoCreate`),
// registers the projects whose folder exists on this machine, using a per-machine folder mapping.
// Nothing is ever deleted or renamed, and session files are never touched.
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { MIRROR_DIR, RESERVED_DIR } from './constants.mjs'

// Inside the mirrored tree on purpose: with the encrypted backend everything under it is encrypted before it leaves.
export const MANIFEST_DIR = `${MIRROR_DIR}/${RESERVED_DIR}/projects`
const MAX_PROJECTS = 500
const MAX_TEXT = 1000

/** @param {unknown} value @returns {string} text without control characters, cut to MAX_TEXT. */
function clean(value) {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, MAX_TEXT)
}

/**
 * Check folder mapping rules.
 * @param {Array<{from: string, to: string}>} rules - rules.
 * @returns {Array<{from: string, to: string}>} normalized rules.
 */
export function checkFolderMap(rules) {
  return (rules ?? []).map((rule, index) => {
    const from = String(rule?.from ?? '').replace(/\/+$/, '')
    const to = String(rule?.to ?? '').replace(/\/+$/, '')
    if (!from.startsWith('/') || !to.startsWith('/')) throw new Error(`projects.folderMap[${index}]: "from" and "to" must be absolute folders`)
    if (from.includes('\0') || to.includes('\0') || from.split('/').includes('..') || to.split('/').includes('..')) throw new Error(`projects.folderMap[${index}]: no ".." allowed`)
    return { from, to }
  })
}

/**
 * Map a folder from another device to this one.
 * @param {string} remotePath - absolute folder on the other device.
 * @param {Array<{from: string, to: string}>} rules - normalized rules, first match wins.
 * @returns {{path: string, mapped: boolean}} the local folder candidate.
 */
export function mapPath(remotePath, rules) {
  for (const rule of rules) {
    if (remotePath === rule.from) return { path: rule.to, mapped: true }
    if (remotePath.startsWith(`${rule.from}/`)) return { path: path.posix.join(rule.to, remotePath.slice(rule.from.length + 1)), mapped: true }
  }
  return { path: remotePath, mapped: false }
}

/**
 * Write this device's manifest if its project list changed.
 * @param {{repoDir: string, deviceShort: string, deviceId: string, label: string, projects: Array<{id: string, title: string, path: string}>}} spec - what to write.
 * @returns {Promise<boolean>} true when the file was written.
 */
export async function writeManifest({ repoDir, deviceShort, deviceId, label, projects }) {
  const list = projects.slice(0, MAX_PROJECTS).map((p) => ({ id: clean(p.id), title: clean(p.title), path: clean(p.path) }));
  const file = path.join(repoDir, ...MANIFEST_DIR.split('/'), `${deviceShort}.json`)
  let previous = null
  try {
    previous = JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    // no manifest yet
  }
  if (previous && JSON.stringify(previous.projects) === JSON.stringify(list) && previous.label === clean(label)) return false
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.dsh-sync.tmp`
  await fs.writeFile(temp, `${JSON.stringify({ version: 1, device: deviceShort, deviceId, label: clean(label), updatedAt: new Date().toISOString(), projects: list }, null, 1)}\n`, { mode: 0o600 })
  await fs.rename(temp, file)
  return true
}

/**
 * Read the other devices' manifests; malformed ones are skipped.
 * @param {{repoDir: string, ownShort: string}} spec - repository and this device.
 * @returns {Promise<Array<{device: string, label: string, projects: Array<{id: string, title: string, path: string}>}>>} manifests.
 */
export async function readManifests({ repoDir, ownShort }) {
  const dir = path.join(repoDir, ...MANIFEST_DIR.split('/'))
  let names = []
  try {
    names = await fs.readdir(dir)
  } catch {
    return []
  }
  const result = []
  for (const name of names.sort()) {
    const match = name.match(/^([0-9a-f]{8})\.json$/)
    if (!match || match[1] === ownShort) continue
    try {
      const parsed = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'))
      if (parsed?.version !== 1 || !Array.isArray(parsed.projects)) continue
      const projects = parsed.projects
        .filter((p) => p && typeof p.path === 'string' && p.path.startsWith('/') && !p.path.includes('\0') && typeof p.title === 'string')
        .slice(0, MAX_PROJECTS)
        .map((p) => ({ id: clean(p.id), title: clean(p.title), path: clean(p.path) }))
      result.push({ device: match[1], label: clean(parsed.label), projects })
    } catch {
      // skip a damaged manifest
    }
  }
  return result
}

/**
 * Decide, per project of the other devices, what applying would do here.
 * @param {{manifests: Array<object>, rules: Array<{from: string, to: string}>, registry?: {resolveByPath: (path: string) => Promise<unknown>}}} spec - inputs.
 * @returns {Promise<Array<{title: string, remotePath: string, localPath: string, device: string, state: 'present' | 'create' | 'missing-folder' | 'unmapped'}>>} one entry per distinct local folder.
 */
export async function planProjects({ manifests, rules, registry }) {
  const seen = new Set()
  const plan = []
  for (const manifest of manifests) {
    for (const project of manifest.projects) {
      const mapped = mapPath(project.path, rules)
      const localPath = path.posix.normalize(mapped.path)
      if (seen.has(localPath)) continue
      seen.add(localPath)
      let isDir = false
      try {
        isDir = (await fs.stat(localPath)).isDirectory()
      } catch {
        isDir = false
      }
      let state
      if (!isDir) state = mapped.mapped ? 'missing-folder' : 'unmapped'
      else if (!registry?.resolveByPath) state = 'create'
      else state = (await registry.resolveByPath(localPath).catch(() => undefined)) ? 'present' : 'create'
      plan.push({ title: project.title, remotePath: project.path, localPath, device: manifest.device, state })
    }
  }
  return plan
}

/**
 * Register the planned projects that can be created. Never deletes or renames anything.
 * @param {Array<{title: string, localPath: string, state: string}>} plan - from planProjects.
 * @param {{create: (path: string, title?: string) => Promise<unknown>}} registry - dsh workspace registry.
 * @returns {Promise<{created: string[], failed: string[]}>} outcome by local folder.
 */
export async function applyProjects(plan, registry) {
  const created = []
  const failed = []
  for (const item of plan) {
    if (item.state !== 'create') continue
    try {
      await registry.create(item.localPath, item.title || undefined)
      created.push(item.localPath)
    } catch {
      failed.push(item.localPath)
    }
  }
  return { created, failed }
}

/**
 * Text for a plan.
 * @param {Array<{title: string, remotePath: string, localPath: string, state: string}>} plan - the plan.
 * @returns {string} lines for the command output.
 */
export function renderPlan(plan) {
  if (!plan.length) return 'No projects from other devices.'
  const words = { present: 'already here', create: 'can be added', 'missing-folder': 'mapped folder does not exist here', unmapped: 'no mapping and no such folder here' }
  return plan.map((item) => `  ${item.title || '(untitled)'}: ${item.remotePath} -> ${item.localPath} (${words[item.state] ?? item.state})`).join('\n')
}
