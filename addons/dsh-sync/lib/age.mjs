// lib/age.mjs — finding the age program, and encrypting and decrypting with it (no DSH dependency).
//
// age is an optional outside program used as "find it → use it → fall back cleanly": the encrypted backend looks
// for it when the config is resolved, and without age, a recipient or an identity it falls back to plain git with a
// clear warning; age is never a hard requirement. During an operation (encrypted mode) any encrypt or decrypt
// failure fails closed (AGE_FAILED) and never silently falls back to sending plain text.
//
// The runner contract (as for git, but args is the "full argv including the program path"):
//   run(args, { cwd, timeoutMs, signal, binary, maxBytes }) → { code, stdout, stderr }
//   args[0] is the age program path, the rest are age's arguments.

import { redactText } from './sanitize.mjs'
import { ageFailed } from './errors.mjs'

/**
 * Find age: `age --version` exits 0 → returns the configured program path; otherwise (including a runner that
 * throws) returns null. Only a probe, never throws: the caller falls back on null.
 * @param {(args: string[], opts?: object) => Promise<{code: number, stdout: string|Buffer, stderr: string}>} run - the child-process runner.
 * @param {string} [ageBin] - the age program path (default 'age').
 * @param {{timeoutMs?: number, cwd?: string}} [opts] - probe options.
 * @returns {Promise<string|null>} the program path, or null.
 */
export async function detectAge(run, ageBin = 'age', opts = {}) {
  if (typeof ageBin !== 'string' || ageBin.length === 0) return null
  try {
    const result = await run([ageBin, '--version'], { timeoutMs: opts.timeoutMs, cwd: opts.cwd })
    return result.code === 0 ? ageBin : null
  } catch {
    return null
  }
}

/**
 * Run one age command and wrap a failure as AGE_FAILED (with the tail of stderr, secrets removed).
 * @param {(args: string[], opts?: object) => Promise<{code: number, stdout: string|Buffer, stderr: string}>} run - the child-process runner.
 * @param {string[]} args - the full argv (including the program path).
 * @param {{cwd?: string, timeoutMs?: number}} [opts] - command options.
 * @returns {Promise<{code: number, stdout: string|Buffer, stderr: string}>}
 */
async function runAge(run, args, opts = {}) {
  let result
  try {
    result = await run(args, { cwd: opts.cwd, timeoutMs: opts.timeoutMs })
  } catch (error) {
    throw ageFailed(args[0] ?? 'age', redactText(error instanceof Error ? error.message : String(error)))
  }
  if (result.code !== 0) {
    const tail = redactText(String(result.stderr ?? '')).trim().split('\n').slice(-3).join(' | ') || `exit ${result.code}`
    throw ageFailed(args[0] ?? 'age', tail)
  }
  return result
}

/**
 * age-encrypt one plain file → an encrypted file: `age -r <recipient> -o <out> <in>`.
 * File arguments (not stdin) avoid the host's limits on writing to a pipe; no identity file is needed, no network.
 * @param {(args: string[], opts?: object) => Promise<{code: number, stdout: string|Buffer, stderr: string}>} run - the child-process runner.
 * @param {object} deps - {ageBin, recipient, inPath, outPath, timeoutMs?, cwd?}.
 * @returns {Promise<string>} the encrypted output path.
 */
export async function ageEncrypt(run, deps) {
  await runAge(run, [deps.ageBin, '-r', deps.recipient, '-o', deps.outPath, deps.inPath], deps)
  return deps.outPath
}

/**
 * age-decrypt one encrypted file → a plain file: `age -d -i <identity> -o <out> <in>`.
 * The identity file must be an age private key WITHOUT a passphrase (a passphrase asks on the TTY; stdin is ignored,
 * so it fails at once — the expected fail-closed behaviour; the user needs an identity file without a passphrase).
 * @param {(args: string[], opts?: object) => Promise<{code: number, stdout: string|Buffer, stderr: string}>} run - the child-process runner.
 * @param {object} deps - {ageBin, identity, inPath, outPath, timeoutMs?, cwd?}.
 * @returns {Promise<string>} the plain output path.
 */
export async function ageDecrypt(run, deps) {
  await runAge(run, [deps.ageBin, '-d', '-i', deps.identity, '-o', deps.outPath, deps.inPath], deps)
  return deps.outPath
}
