/**
 * Tool access, part 3: what the user has allowed, and the record of what was asked.
 *
 * Two files in one folder on this Mac, never synced (the folder is not a setting, and the shared
 * settings add-on never sees it):
 *  - `grants.json`: permissions given (once, this conversation, this mode, always) and "don't ask again" marks;
 *  - `tool-access.jsonl`: one line per event (asked, allowed, denied, refused, waiting, revoked, expired).
 * A damaged `grants.json` is kept aside (`grants.json.damaged-<time>`) and a new one started; it is never
 * silently overwritten. The log never holds a secret: the AI's reason is cut to 300 characters and
 * nothing else the AI wrote is stored.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { REASON_MAX, SCOPES, cleanReason, live } from './access.js';

/** A permission for one conversation lapses after this long, so old ones do not pile up. */
export const CONVERSATION_DAYS = 30;
const LOG_MAX = 4 * 1024 * 1024;
const READ_MAX = 2 * 1024 * 1024;

const id = () => randomBytes(6).toString('hex');

/**
 * @param {object} options - where and when.
 * @param {string} options.dir - the folder (made when first needed).
 * @param {() => number} [options.now] - the clock.
 * @returns {object} the store.
 */
export function createStore({ dir, now = Date.now }) {
  const grantsFile = path.join(dir, 'grants.json');
  const logFile = path.join(dir, 'tool-access.jsonl');
  const outsideFile = path.join(dir, 'outside.json');
  let state;
  /** Conversation -> {kind, at}: what outside material it has read (kept across turns and restarts until the conversation ends). */
  let outside;

  const ensure = () => {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  };
  const load = () => {
    if (state) return state;
    state = { version: 1, grants: [], blocks: [] };
    if (!existsSync(grantsFile)) return state;
    try {
      const read = JSON.parse(readFileSync(grantsFile, 'utf8'));
      if (!read || typeof read !== 'object' || !Array.isArray(read.grants)) throw new Error('not a grants file');
      state = { version: 1, grants: read.grants.filter(sound), blocks: Array.isArray(read.blocks) ? read.blocks.filter((b) => b && typeof b.tool === 'string' && typeof b.id === 'string') : [] };
    } catch {
      try {
        renameSync(grantsFile, `${grantsFile}.damaged-${now()}`);
      } catch {
        // leave it where it is; a new file is written over only after the copy above worked
      }
    }
    return state;
  };
  const save = () => {
    ensure();
    const tmp = `${grantsFile}.tmp-${process.pid}`;
    writeFileSync(tmp, `${JSON.stringify(load(), null, 1)}\n`, { mode: 0o600 });
    renameSync(tmp, grantsFile);
  };
  const loadOutside = () => {
    if (outside) return outside;
    outside = {};
    try {
      if (existsSync(outsideFile)) {
        const read = JSON.parse(readFileSync(outsideFile, 'utf8'));
        if (read && typeof read === 'object' && read.items && typeof read.items === 'object') for (const [key, value] of Object.entries(read.items)) if (value && typeof value.kind === 'string') outside[key] = { kind: value.kind, at: Number(value.at) || 0 };
      }
    } catch {
      // damaged: starts empty (a warning is only a hint, never a permission)
    }
    return outside;
  };
  const saveOutside = () => {
    ensure();
    const tmp = `${outsideFile}.tmp-${process.pid}`;
    writeFileSync(tmp, `${JSON.stringify({ version: 1, items: loadOutside() })}\n`, { mode: 0o600 });
    renameSync(tmp, outsideFile);
  };
  const OUTSIDE_MAX = 500;
  const sound = (grant) => grant && typeof grant === 'object' && typeof grant.id === 'string' && typeof grant.tool === 'string' && SCOPES.includes(grant.scope);

  const log = (event) => {
    try {
      ensure();
      const line = {
        t: now(),
        type: String(event.type ?? ''),
        ...(event.id ? { id: String(event.id) } : {}),
        ...(event.sessionId ? { sessionId: String(event.sessionId) } : {}),
        ...(event.modeId ? { modeId: String(event.modeId) } : {}),
        ...(event.tool ? { tool: String(event.tool) } : {}),
        ...(typeof event.tier === 'number' ? { tier: event.tier } : {}),
        ...(event.choice ? { choice: String(event.choice) } : {}),
        ...(event.code ? { code: String(event.code) } : {}),
        ...(event.reason ? { reason: cleanReason(event.reason).slice(0, REASON_MAX) } : {}),
        ...(event.outside ? { outside: true } : {}),
        ...(event.unattended ? { unattended: true } : {}),
        ...(event.who ? { who: String(event.who).slice(0, 80) } : {}),
      };
      if (existsSync(logFile) && statSync(logFile).size > LOG_MAX) renameSync(logFile, `${logFile}.1`);
      appendFileSync(logFile, `${JSON.stringify(line)}\n`, { mode: 0o600 });
      return line;
    } catch {
      return undefined;
    }
  };
  const readLog = () => {
    try {
      if (!existsSync(logFile)) return [];
      let text = readFileSync(logFile, 'utf8');
      if (text.length > READ_MAX) text = text.slice(text.length - READ_MAX);
      const out = [];
      for (const line of text.split('\n')) {
        if (!line) continue;
        try {
          out.push(JSON.parse(line));
        } catch {
          // a cut first line or a damaged one: skipped
        }
      }
      return out;
    } catch {
      return [];
    }
  };

  /** Drop what has run out, and record it. */
  const prune = () => {
    const kept = [];
    let changed = false;
    for (const grant of load().grants) {
      if (live(grant, now())) kept.push(grant);
      else {
        changed = true;
        if (grant.scope !== 'once') log({ type: 'expired', id: grant.id, tool: grant.tool, sessionId: grant.sessionId, modeId: grant.modeId });
      }
    }
    if (changed) {
      load().grants = kept;
      save();
    }
  };

  return {
    log,
    /** @returns {object[]} the permissions in force. */
    grants() {
      prune();
      return load().grants.map((grant) => ({ ...grant }));
    },
    /**
     * Give a permission.
     * @param {object} grant - `{tool, scope, sessionId?, modeId?, expiresAt?, tier?, reason?}`.
     * @returns {object} the stored permission.
     */
    add(grant) {
      if (!grant || typeof grant.tool !== 'string' || !SCOPES.includes(grant.scope)) throw new Error('toolAccess: not a permission');
      if (grant.scope === 'conversation' || grant.scope === 'once') if (!grant.sessionId) throw new Error('toolAccess: a conversation permission needs the conversation');
      if (grant.scope === 'mode' && !grant.modeId) throw new Error('toolAccess: a mode permission needs the mode');
      const lapse = grant.scope === 'conversation' ? now() + CONVERSATION_DAYS * 86_400_000 : undefined;
      const stored = {
        id: id(),
        tool: grant.tool,
        scope: grant.scope,
        ...(grant.sessionId ? { sessionId: String(grant.sessionId) } : {}),
        ...(grant.modeId ? { modeId: String(grant.modeId) } : {}),
        createdAt: now(),
        ...(typeof grant.expiresAt === 'number' ? { expiresAt: grant.expiresAt } : lapse ? { expiresAt: lapse } : {}),
        ...(typeof grant.tier === 'number' ? { tier: grant.tier } : {}),
        ...(grant.scope === 'once' ? { used: false } : {}),
      };
      // The same tool in the same place is one permission, not two.
      load().grants = load().grants.filter((one) => !(one.tool === stored.tool && one.scope === stored.scope && one.sessionId === stored.sessionId && one.modeId === stored.modeId));
      load().grants.push(stored);
      save();
      return { ...stored };
    },
    /**
     * Use up a one-time permission, when there is one.
     * @returns {boolean} true when one was there.
     */
    consumeOnce(tool, sessionId) {
      const found = load().grants.find((grant) => grant.scope === 'once' && grant.tool === tool && grant.sessionId === sessionId && live(grant, now()));
      if (!found) return false;
      found.used = true;
      load().grants = load().grants.filter((grant) => grant !== found);
      save();
      return true;
    },
    /**
     * Drop one-time permissions that were not used (the turn ended, or the app started).
     * @param {string} [sessionId] - one conversation, or all of them.
     * @returns {number} how many lapsed.
     */
    dropOnce(sessionId) {
      const gone = load().grants.filter((grant) => grant.scope === 'once' && (!sessionId || grant.sessionId === sessionId));
      if (gone.length === 0) return 0;
      load().grants = load().grants.filter((grant) => !gone.includes(grant));
      save();
      for (const grant of gone) log({ type: 'expired', id: grant.id, tool: grant.tool, sessionId: grant.sessionId, modeId: grant.modeId, who: 'unused one-time permission' });
      return gone.length;
    },
    /** @returns {'web' | 'file' | 'app' | 'helper' | ''} what a conversation has read from outside, kept until it ends. */
    outsideOf(sessionId) {
      return loadOutside()[sessionId]?.kind ?? '';
    },
    /** Note that a conversation read outside material. A web page always counts most; the note is kept on disk. */
    markOutside(sessionId, kind) {
      if (!sessionId || !kind) return;
      const mine = loadOutside();
      if (mine[sessionId]?.kind === 'web' || mine[sessionId]?.kind === kind) return;
      mine[sessionId] = { kind, at: now() };
      const keys = Object.keys(mine);
      if (keys.length > OUTSIDE_MAX) for (const key of keys.sort((a, b) => mine[a].at - mine[b].at).slice(0, keys.length - OUTSIDE_MAX)) delete mine[key];
      try {
        saveOutside();
      } catch {
        // kept in memory for this run
      }
    },
    /** @returns {string[]} every conversation the store holds something about. */
    conversations() {
      return [...new Set([...load().grants.map((grant) => grant.sessionId), ...Object.keys(loadOutside())].filter(Boolean))];
    },
    /** A conversation ended (deleted): its permissions and its "read outside" note go. @returns {number} permissions removed. */
    forgetConversation(sessionId) {
      const before = load().grants.length;
      load().grants = load().grants.filter((grant) => grant.sessionId !== sessionId);
      if (load().grants.length !== before) save();
      if (loadOutside()[sessionId]) {
        delete loadOutside()[sessionId];
        try {
          saveOutside();
        } catch {
          // kept in memory for this run
        }
      }
      return before - load().grants.length;
    },
    /**
     * Fix round (6a review): a conversation wiped (Recon's End and wipe): its lines go from the log and its older copy,
     * so nothing of it stays outside Recon's room. @returns {number} lines removed.
     */
    dropLog(sessionIds) {
      const gone = new Set((Array.isArray(sessionIds) ? sessionIds : [sessionIds]).map((id) => String(id ?? '')).filter(Boolean));
      if (gone.size === 0) return 0;
      let removed = 0;
      for (const file of [logFile, `${logFile}.1`]) {
        try {
          if (!existsSync(file)) continue;
          const lines = readFileSync(file, 'utf8').split('\n');
          const kept = lines.filter((line) => {
            if (!line) return false;
            try {
              return !gone.has(String(JSON.parse(line)?.sessionId ?? ''));
            } catch {
              return true;
            }
          });
          const dropped = lines.filter(Boolean).length - kept.length;
          if (dropped === 0) continue;
          const tmp = `${file}.${process.pid}.tmp`;
          writeFileSync(tmp, kept.length > 0 ? `${kept.join('\n')}\n` : '', { mode: 0o600 });
          renameSync(tmp, file);
          removed += dropped;
        } catch {
          // tried again at the next wipe event or timer
        }
      }
      return removed;
    },
    /** @returns {boolean} whether something was revoked. */
    revoke(grantId, who = 'user') {
      const found = load().grants.find((grant) => grant.id === grantId);
      if (!found) return false;
      load().grants = load().grants.filter((grant) => grant !== found);
      save();
      log({ type: 'revoked', id: found.id, tool: found.tool, sessionId: found.sessionId, modeId: found.modeId, who });
      return true;
    },
    /** @returns {number} how many permissions and "don't ask again" marks went. */
    revokeAll(who = 'user') {
      const count = load().grants.length + load().blocks.length;
      load().grants = [];
      load().blocks = [];
      save();
      log({ type: 'revoked-all', who, reason: `${count} removed` });
      return count;
    },
    /** @returns {number} how many went: the permissions of one conversation (when it ends). */
    revokeConversation(sessionId) {
      const before = load().grants.length;
      load().grants = load().grants.filter((grant) => !((grant.scope === 'conversation' || grant.scope === 'once') && grant.sessionId === sessionId));
      if (load().grants.length !== before) save();
      return before - load().grants.length;
    },
    /** "Don't ask again" for a tool in a mode. */
    block({ tool, modeId, sessionId }) {
      if (!load().blocks.some((one) => one.tool === tool && one.modeId === modeId)) {
        load().blocks.push({ id: id(), tool, modeId, createdAt: now(), ...(sessionId ? { sessionId } : {}) });
        save();
      }
    },
    blocks() {
      return load().blocks.map((one) => ({ ...one }));
    },
    unblock(blockId) {
      const before = load().blocks.length;
      load().blocks = load().blocks.filter((one) => one.id !== blockId);
      if (load().blocks.length !== before) save();
      return load().blocks.length !== before;
    },
    isBlocked(tool, modeId) {
      return load().blocks.some((one) => one.tool === tool && (one.modeId === modeId || !one.modeId));
    },
    /**
     * The record, newest first.
     * @param {{limit?: number, sessionId?: string}} [filter] - how much.
     * @returns {object[]} events.
     */
    history({ limit = 200, sessionId } = {}) {
      const events = readLog().filter((event) => !sessionId || event.sessionId === sessionId);
      return events.slice(-limit).reverse();
    },
    /** @returns {object[]} requests nobody answered (unattended runs and time-outs), not yet cleared. */
    waiting() {
      const events = readLog();
      const cleared = new Set(events.filter((event) => event.type === 'waiting-cleared').map((event) => event.id));
      return events.filter((event) => event.type === 'waiting' && !cleared.has(event.id)).reverse();
    },
    clearWaiting(waitingId, who = 'user') {
      if (!this.waiting().some((event) => event.id === waitingId)) return false;
      log({ type: 'waiting-cleared', id: waitingId, who });
      return true;
    },
    /** @returns {{asked: number, allowed: number, denied: number}} the plain record of one conversation. */
    record(sessionId) {
      const out = { asked: 0, allowed: 0, denied: 0 };
      for (const event of readLog()) {
        if (event.sessionId !== sessionId) continue;
        if (event.type === 'asked') out.asked += 1;
        else if (event.type === 'allowed') out.allowed += 1;
        else if (event.type === 'denied') out.denied += 1;
      }
      return out;
    },
    newId: id,
  };
}
