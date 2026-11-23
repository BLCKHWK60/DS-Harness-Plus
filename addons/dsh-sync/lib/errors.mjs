// lib/errors.mjs — structured domain errors (code + details, no dependencies).

import { ERROR_CODES } from './constants.mjs'

/**
 * Base class of the plugin's domain errors: a stable code for UI and log routing; details carry machine-readable facts.
 */
export class SyncError extends Error {
  /**
   * @param {string} code - one of ERROR_CODES.
   * @param {string} message - the explanation shown to the user.
   * @param {object} [details] - optional structured facts.
   */
  constructor(code, message, details = undefined) {
    super(message)
    this.name = 'SyncError'
    this.code = code
    this.details = details
  }
}

/**
 * The config is not valid (used to fail loudly while loading).
 * @param {string} message - what exactly is not valid.
 * @returns {SyncError} code=BAD_CONFIG.
 */
export function badConfig(message) {
  return new SyncError(ERROR_CODES.BAD_CONFIG, `dsh-sync config: ${message}`)
}

/**
 * The configured backend is not built yet (object storage and other reserved surfaces).
 * @param {unknown} backend - the configured value.
 * @returns {SyncError} code=BACKEND_UNSUPPORTED.
 */
export function backendUnsupported(backend) {
  return new SyncError(
    ERROR_CODES.BACKEND_UNSUPPORTED,
    `sync backend ${JSON.stringify(backend)} is not implemented (available: git, encrypted; reserved: object-storage; keys never enter the repo)`,
    { backend },
  )
}

/**
 * The sync metadata domain is not available (opening, reading or writing failed).
 * @param {string} reason - why it failed.
 * @returns {SyncError} code=REGISTRY_UNAVAILABLE.
 */
export function registryUnavailable(reason) {
  return new SyncError(ERROR_CODES.REGISTRY_UNAVAILABLE, `session-sync metadata store unavailable: ${reason}`, { reason })
}

/**
 * A git command failed.
 * @param {string} operation - the step that failed (bootstrap|status|push|pull|merge…).
 * @param {string} message - what failed (with the exit code and a summary of stderr).
 * @param {object} [details] - optional structured facts.
 * @returns {SyncError} code=GIT_FAILED.
 */
export function gitFailed(operation, message, details = undefined) {
  return new SyncError(ERROR_CODES.GIT_FAILED, `git ${operation} failed: ${message}`, details)
}

/**
 * The remote refused the push (the remote is ahead; the caller should pull and try again, never force-push).
 * @param {string} message - why it was refused.
 * @returns {SyncError} code=PUSH_REJECTED.
 */
export function pushRejected(message) {
  return new SyncError(ERROR_CODES.PUSH_REJECTED, `git push rejected (never force-pushed): ${message}`)
}

/**
 * age encrypt or decrypt failed (an error of the encrypted backend during an operation; a missing age while resolving falls back instead of throwing).
 * @param {string} operation - the step that failed (encrypt|decrypt|detect).
 * @param {string} message - what failed (with the exit code and a summary of stderr).
 * @returns {SyncError} code=AGE_FAILED.
 */
export function ageFailed(operation, message) {
  return new SyncError(ERROR_CODES.AGE_FAILED, `age ${operation} failed: ${message}`, { operation })
}

/**
 * The confirmation gate refused, or nobody could answer it (fails closed).
 * @param {string} reason - why it was refused or not available.
 * @returns {SyncError} code=SYNC_DENIED.
 */
export function syncDenied(reason) {
  return new SyncError(ERROR_CODES.SYNC_DENIED, `sync cancelled: ${reason}`, { reason })
}

/**
 * A path outside the root (the check before joining failed: a path outside the root never goes into the work tree or a report).
 * @param {string} reason - what was outside.
 * @returns {SyncError} code=PATH_UNSAFE.
 */
export function pathUnsafe(reason) {
  return new SyncError(ERROR_CODES.PATH_UNSAFE, `unsafe sync path refused: ${reason}`, { reason })
}

/**
 * Any value → a stable message text (for logs and results; its own string conversion is not trusted).
 * @param {unknown} error - any thrown value.
 * @returns {string} the message text.
 */
export function messageOf(error) {
  if (error instanceof Error) return error.message
  return String(error)
}
