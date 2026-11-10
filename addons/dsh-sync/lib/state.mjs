// lib/state.mjs — dsh-sync addition. Small JSON state file (device id, last pull/push, last error), replacing the
// original's storage-domain record. Written atomically, mode 0600.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

export class SyncState {
  #file
  #data
  #pending = Promise.resolve()

  /** @param {string} dir - data folder (created on first write). */
  constructor(dir) {
    this.#file = join(dir, 'state.json')
    this.#dir = dir
    let data = {}
    try {
      const parsed = JSON.parse(readFileSync(this.#file, 'utf8'))
      if (parsed && typeof parsed === 'object') data = parsed
    } catch {
      // first run, or a damaged file: start again with a new device id
    }
    if (typeof data.deviceId !== 'string' || !/^[0-9a-f-]{36}$/.test(data.deviceId)) {
      data = { ...data, deviceId: randomUUID() }
      this.#data = data
      this.#write()
    } else {
      this.#data = data
    }
  }

  #dir

  /** @returns {string} random device id (UUID). */
  get deviceId() {
    return this.#data.deviceId
  }

  /** @returns {string} short id used in fork file names and manifests (8 hex characters). */
  get deviceShort() {
    return this.#data.deviceId.replaceAll('-', '').slice(0, 8).toLowerCase()
  }

  /** @returns {object} a copy of the state. */
  read() {
    return { ...this.#data }
  }

  /** @param {object} patch - fields to merge (last error is cut to 500 characters). */
  patch(patch) {
    const next = { ...this.#data, ...patch }
    if (typeof next.lastError === 'string') next.lastError = next.lastError.slice(0, 500)
    this.#data = next
    this.#write()
  }

  #write() {
    try {
      mkdirSync(this.#dir, { recursive: true, mode: 0o700 })
      const temp = `${this.#file}.${process.pid}.tmp`
      writeFileSync(temp, `${JSON.stringify(this.#data)}\n`, { mode: 0o600 })
      renameSync(temp, this.#file)
    } catch {
      // state is advisory: losing it must never break a sync
    }
  }
}
