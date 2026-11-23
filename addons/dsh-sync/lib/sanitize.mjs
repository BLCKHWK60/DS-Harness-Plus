// lib/sanitize.mjs — pure functions that remove secrets for display and logs (no dependencies).
//
// Rule: any text that may carry a credential (a remote URL, git output, an error message) must go through these
// pure functions before it reaches a log, a command result or a tool result. The functions never throw and never
// do I/O; on input that is not valid they return a cautious, cleaned text.

/** Query keys in a URL that count as credentials (their values are always masked in full). */
const CREDENTIAL_QUERY_KEYS = /^(?:access_?token|token|key|secret|password|passwd|auth|credential|code|signature|x-amz-|sig)$/iu

/**
 * Common token shapes (a prefix + a long enough secret).
 * `gh[pousr]_` covers GitHub's whole ghp/gho/ghu/ghs/ghr family; `github_pat_` has its own entry
 * (the fine-grained PAT is now the default shape, and once slipped through entirely); the rest are each provider's most
 * widely used prefix shapes.
 */
const TOKEN_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{16,}|gldt-[A-Za-z0-9_-]{16,}|npm_[A-Za-z0-9]{30,}|pypi-[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{8,}|AKIA[0-9A-Z]{12,}|AIza[0-9A-Za-z_-]{30,}|ya29\.[A-Za-z0-9_-]{20,}|SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}|dop_v1_[A-Fa-f0-9]{40,}|shpat_[A-Fa-f0-9]{32,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{8,}|authorization:\s*[A-Za-z0-9._~+/=-]{8,})/giu

/** Credentials in key=value form (the whole value is masked). */
const CREDENTIAL_ASSIGNMENT = /\b((?:api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|password|passwd|client[_-]?secret|private[_-]?key)\s*=\s*)([^\s&;,]+)/giu

/** URL userinfo (user:password@) — git stderr may echo the remote address. */
const URL_USERINFO = /\/\/([^/\s:@]+):([^/\s@]+)@/gu

/**
 * Whether, with no password, the user name in a URL is itself the credential.
 * `https://<token>@host/…` is the most common no-prompt way to write a PAT: the user-name field then holds the
 * secret, not an identity, so the "the user name is not a secret" assumption of `user:pass@` does not hold here.
 * @param {string} username - the user-name part of the URL.
 * @returns {boolean} whether to treat it as a credential.
 */
function usernameIsCredential(username) {
  if (username.length === 0) return false
  if (redactText(username) !== username) return true
  if (/^[A-Fa-f0-9]{16,}$/u.test(username)) return true
  if (username.length >= 20 && !/[-_.]/u.test(username)) {
    const classes = [/[a-z]/u, /[A-Z]/u, /[0-9]/u].filter(pattern => pattern.test(username)).length
    if (classes >= 2) return true
  }
  return false
}

/**
 * Clean a remote URL: mask the password in the userinfo and the values of credential query keys.
 * scp syntax (user@host:path) has no password and stays as it is (the user name is not a secret).
 * @param {string} remote - the git remote address.
 * @returns {string} the cleaned address.
 */
export function sanitizeRemote(remote) {
  if (typeof remote !== 'string' || remote.length === 0) return '<unset>'
  const trimmed = remote.trim()
  try {
    const url = new URL(trimmed)
    if (url.username !== '' && url.password !== '') {
      url.password = '***'
    } else if (url.username !== '') {
      if (usernameIsCredential(url.username)) url.username = '***'
    }
    for (const key of [...url.searchParams.keys()]) {
      if (CREDENTIAL_QUERY_KEYS.test(key)) url.searchParams.set(key, '***')
    }
    return url.toString()
  } catch {
    // Parsing failed (scp syntax, a malformed URL): use the general cleaning. The module contract is "on input that is
    // not valid, return a cautious cleaned text": echoing it as is would put a token in a malformed URL straight into logs and the model.
    return redactText(trimmed)
  }
}

/**
 * Clean a text: mask tokens, Bearer/authorization headers and key=value credentials.
 * Input that is not a string is turned into one with String() first (never throws — a test pins this contract).
 * @param {unknown} text - any output text (git stderr, error messages…).
 * @returns {string} the cleaned text.
 */
export function redactText(text) {
  if (typeof text !== 'string') return String(text)
  return text
    .replace(TOKEN_PATTERN, '***')
    .replace(CREDENTIAL_ASSIGNMENT, '$1***')
    .replace(URL_USERINFO, '//***@')
}

/**
 * The path to show: an absolute path inside root becomes a relative path (as seen inside the repository); otherwise a
 * neutral placeholder — a path outside the root is never shown as it is to the model or the user (path-escape defence).
 * @param {string} absolute - the absolute path.
 * @param {string} root - the owning root folder (absolute, normalised).
 * @returns {string} the relative path, or '<outside>'.
 */
export function displayPath(absolute, root) {
  if (typeof absolute !== 'string' || absolute.length === 0) return '<missing>'
  if (typeof root !== 'string' || root.length === 0) return '<outside>'
  const rel = relativeWithin(absolute, root)
  return rel === undefined ? '<outside>' : rel
}

/**
 * The path of absolute relative to root; undefined when it is not inside root.
 * Pure path arithmetic (no file-system access); refuses a `..` escape.
 * @param {string} absolute - the absolute path (may be relative; it is computed as given).
 * @param {string} root - the root folder.
 * @returns {string|undefined} the relative path, or undefined.
 */
export function relativeWithin(absolute, root) {
  const normalized = normalizeSegments(absolute)
  const rootSegments = normalizeSegments(root)
  if (normalized.length < rootSegments.length) return undefined
  for (let index = 0; index < rootSegments.length; index += 1) {
    if (normalized[index] !== rootSegments[index]) return undefined
  }
  // Fold `.` and `..` in the relative segments with a stack: `..` on an empty stack leaves root → undefined (a path
  // that could escape root through `..` is never shown).
  const stack = []
  for (const segment of normalized.slice(rootSegments.length)) {
    if (segment === '..') {
      if (stack.length === 0) return undefined
      stack.pop()
    } else {
      stack.push(segment)
    }
  }
  return stack.length === 0 ? '.' : stack.join('/')
}

/** Split a path into normal segments (skips empty segments and `.`, no I/O). */
function normalizeSegments(path) {
  return String(path)
    .replaceAll('\\', '/')
    .split('/')
    .filter(segment => segment.length > 0 && segment !== '.')
}
