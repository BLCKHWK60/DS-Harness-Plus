// lib/constants.mjs — word lists and protocol constants (no dependencies).

// The plugin id, the command name and the tool names.
export const PLUGIN_NAME = 'sync'
export const COMMAND_NAME = 'sync'

// The ctx.storageDomain domain name (sync metadata: the device id, the last push and pull times, and errors).
// Underscores: the storage-domain name pattern does not allow hyphens.
export const DOMAIN_NAME = 'session_sync'

// The mirror folder inside the git work tree: sessionRoot's relative mirror goes to <repoDir>/<MIRROR_DIR>/….
export const MIRROR_DIR = 'sessions'

// dsh-sync addition: a reserved top-level folder inside the mirror for the plugin's own files (per-device project
// manifests). Never copied from or restored into the live session store.
export const RESERVED_DIR = '__dsh-sync__'

// The device identity file at the repository root (a random UUID, committed so forks can be traced to a device).
export const DEVICE_FILE = 'device.txt'

// The single key of the storage domain's state table.
export const STATE_KEY = 'singleton'

// Backend words: git is plain-text transport, encrypted is git transport encrypted with age (the mirror's content is
// encrypted before a push; see the seam contract in lib/backend.mjs and lib/encrypted.mjs).
export const BACKENDS = Object.freeze({
  GIT: 'git',
  ENCRYPTED: 'encrypted',
})

// A reserved backend (interface placeholder, not built yet): configuring it fails loudly while loading (backendUnsupported).
// It shares the same seam as git/encrypted (the three methods status/push/pull); only the transport differs.
export const RESERVED_BACKENDS = Object.freeze({
  OBJECT_STORAGE: 'object-storage',
})

// The folder name for the encrypted mirror inside the git work tree, and the suffix of one encrypted file
// (one .age file per session file; the plain mirror sessions/ exists only locally and is never committed).
export const ENC_DIR = 'encrypted'
export const ENC_EXT = '.age'

// The values of Config.confirmVia.
export const CONFIRM_CHANNELS = Object.freeze({
  AUTO: 'auto',
  USER_QUESTIONS: 'userQuestions',
  APPROVAL: 'approval',
})

// Conflict classes (the output of lib/merge.mjs's three-way merge; shared by the command and tool rendering and by events).
export const MERGE_KINDS = Object.freeze({
  IDENTICAL: 'identical',
  OURS_ONLY: 'ours-only',
  THEIRS_ONLY: 'theirs-only',
  APPEND_BOTH: 'append-both',
  DIVERGED: 'diverged',
})

// Session event types (the plugin's own; whether they are appended at run time depends on whether the host knows the type,
// or whether the host's append accepts an ignorable envelope; see the adaptive gate in lib/gate.mjs).
export const SESSION_EVENTS = Object.freeze({
  PUSH: 'sync/push',
  PULL: 'sync/pull',
  CONFLICT: 'sync/conflict',
})

// Domain error codes (stable, routable).
export const ERROR_CODES = Object.freeze({
  BAD_CONFIG: 'BAD_CONFIG',
  BACKEND_UNSUPPORTED: 'BACKEND_UNSUPPORTED',
  REGISTRY_UNAVAILABLE: 'REGISTRY_UNAVAILABLE',
  GIT_FAILED: 'GIT_FAILED',
  PUSH_REJECTED: 'PUSH_REJECTED',
  SYNC_DENIED: 'SYNC_DENIED',
  PATH_UNSAFE: 'PATH_UNSAFE',
  AGE_FAILED: 'AGE_FAILED',
})

// The fork file name pattern: <basename>.remote-fork-<UTC timestamp>-<short device id>; mirroring and
// cleanup never delete and never overwrite a file that matches it (the lasting carrier of both sides).
export const FORK_NAME_RE = /\.remote-fork-\d{14}-[0-9a-z]{8}(?:\.|$)/iu

// Host-private session artifacts: the session lease and migration staging files. The host makes and cleans them in the
// session folder itself; they are runtime state, not content to sync — the mirror neither copies a source file with that
// name into the work tree nor ever deletes a target file with that name (or one pull/commit would spread one device's passing lock state as a delete).
// Where the names come from (session-persistence-jsonl):
// - lease.ts:40  LEASE_FILENAME = 'session.lock' (the flock lease; exists only while the session is open)
// - generation.ts:725  `session.migration.<token><suffix>.tmp` (migration staging, cleaned up on failure)
// Note: `session.jsonl` / `session.v<N>.jsonl[.zstd]` (sessionFormatLogFilename in session-format/filename.ts
// + logSuffix in format.ts) are the **sync payload** and are not in this list.
// dsh-sync addition: our own atomic-write temp files (`<name>.dsh-sync.tmp`) are never synced either.
export const HOST_ARTIFACT_NAME_RE = /^(?:session\.lock|session\.migration\..+\.tmp|.+\.dsh-sync\.tmp)$/u

// Defaults (the Config schema's defaults and the DEFAULT_* constants come from one place; cordis.yml can override them all).
export const DEFAULTS = Object.freeze({
  ENABLED: true,
  BACKEND: BACKENDS.GIT,
  SESSION_ROOT: '',
  REPO_DIR: '',
  REMOTE: '',
  BRANCH: 'main',
  GIT_BIN: 'git',
  AGE_BIN: 'age',
  AGE_RECIPIENT: '',
  AGE_IDENTITY: '',
  AUTO_PULL_ON_START: false,
  AUTO_PUSH_ON_TURN_END: false,
  PULL_INTERVAL_MINUTES: 0,
  CONFIRM_VIA: CONFIRM_CHANNELS.AUTO,
  GRACE_MS: 10000,
  COMMAND_TIMEOUT_MS: 120000,
  MAX_OUTPUT_BYTES: 262144,
  COMMIT_NAME: 'dsh-sync',
  COMMIT_EMAIL: 'dsh-sync@localhost',
  REGISTER_COMMAND: true,
})

// Valid ranges of config fields (checked while loading; out of range fails loudly).
export const LIMITS = Object.freeze({
  MIN_GRACE_MS: 1000,
  MAX_GRACE_MS: 2_147_483_647, // the upper limit of SubprocessSpawnSpec.graceMs (Node's timer limit).
  MIN_COMMAND_TIMEOUT_MS: 1000,
  MAX_COMMAND_TIMEOUT_MS: 3_600_000,
  MIN_MAX_OUTPUT_BYTES: 4096,
  MAX_MAX_OUTPUT_BYTES: 16 * 1024 * 1024,
  MIN_PULL_INTERVAL_MINUTES: 0,
  MAX_PULL_INTERVAL_MINUTES: 10080,
  MAX_COMMIT_MESSAGE_LENGTH: 200,
  MAX_DEVICE_ID_LENGTH: 128,
})

// The git verbs on the allow list (asserted at run time; see ALLOWED_VERBS in lib/git.mjs).
// Putting them in lib/git.mjs would create a circular-dependency warning inside lib, so only the explanation constants for display live here.
export const GIT_ENV = Object.freeze({
  // A terminal credential prompt would make git hang waiting for input; the optional lock keeps read-only primitives from fighting over the lock.
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
})
