// lib/backend.mjs — the transport backend seam (no dependencies).
//
// The Backend contract (the three kinds of transport backend share one surface; git and encrypted are built,
// object-storage is an interface placeholder, and configuring it fails loudly in resolveConfig):
//
//   kind     : 'git' | 'encrypted' | 'object-storage'   —— the backend asked for
//   mode     : 'plaintext' | 'encrypted'                 —— the transport mode actually in use
//   warnings : string[]                                  —— fallback and limit warnings (they go into the
//                                                          status/push/pull results)
//   status() -> StatusValue
//   push(opts) -> PushValue
//   pull(opts) -> PullValue
//
// git (GitBackend + SyncEngine) is the built-in plain-text implementation; encrypted (lib/encrypted.mjs)
// is git transport wrapped in age (the mirror's content is encrypted before a push and decrypted before a merge);
// object-storage has no implementation — only the contract and placeholder constants.

import { BACKENDS } from './constants.mjs'

/** The transport mode words. */
export const BACKEND_MODES = Object.freeze({
  PLAINTEXT: 'plaintext',
  ENCRYPTED: 'encrypted',
})

/**
 * Choose the transport mode the encrypted backend really uses (pure function; the probe result is passed in, for tests).
 *
 * Fallback rules (if any one fails, it falls back to plain git with a clear warning; never a silent fallback):
 * - backend !== 'encrypted' → plain text (no warning);
 * - the age program is not available → plain text + warning;
 * - ageRecipient is empty → plain text + warning (cannot encrypt);
 * - ageIdentity is empty → plain text + warning (cannot decrypt).
 *
 * @param {object} deps - {backend, ageAvailable, ageRecipient, ageIdentity}.
 * @param {string} deps.backend - one of BACKENDS.
 * @param {boolean} deps.ageAvailable - whether detectAge found the age program.
 * @param {string} deps.ageRecipient - the age recipient (public key or identity string).
 * @param {string} deps.ageIdentity - the age identity file path (the private key for decrypting).
 * @returns {{mode: 'plaintext'|'encrypted', warnings: string[]}}
 */
export function selectEncryptionMode({ backend, ageAvailable, ageRecipient, ageIdentity }) {
  if (backend !== BACKENDS.ENCRYPTED) return { mode: BACKEND_MODES.PLAINTEXT, warnings: [] }
  const warnings = []
  if (ageAvailable !== true) {
    warnings.push('age binary not found (probed `age --version`); mirror content will be pushed unencrypted')
  } else {
    if (typeof ageRecipient !== 'string' || ageRecipient.trim() === '') {
      warnings.push('ageRecipient is empty; mirror content will be pushed unencrypted')
    }
    if (typeof ageIdentity !== 'string' || ageIdentity.trim() === '') {
      warnings.push('ageIdentity is empty; mirror content will be pushed unencrypted')
    }
  }
  const mode = warnings.length === 0 ? BACKEND_MODES.ENCRYPTED : BACKEND_MODES.PLAINTEXT
  return { mode, warnings }
}
