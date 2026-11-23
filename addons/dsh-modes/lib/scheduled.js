/**
 * Conversations opened by the app's scheduler (Automation tasks).
 * Kept apart from the plugin so it can be tested without the app.
 */

/**
 * Whether messages put into a conversation's inbox came from the scheduler.
 * @param {unknown} inserted - the `inserted` list of an `agent/inbox/spliced` event.
 * @returns {boolean} true when at least one did.
 */
export function fromScheduler(inserted) {
  if (!Array.isArray(inserted)) return false;
  return inserted.some((item) => (item?.source ?? item?.message?.source)?.kind === 'schedule');
}

/**
 * The mode a conversation opened by the scheduler starts in.
 * Nobody chose a tab for it, so the tab last looked at must not decide: in Chat it would have no tools.
 * @param {Record<string, {tools: unknown}>} modes - the mode table.
 * @param {unknown} wanted - the configured mode id.
 * @returns {string | undefined} a mode id, or undefined to leave the usual rule in charge.
 */
export function scheduledModeId(modes, wanted) {
  // Never the Automations tab: it manages automations, it is no place for one to run (step A5).
  if (typeof wanted === 'string' && wanted && wanted !== 'automations' && modes?.[wanted]) return wanted;
  return Object.keys(modes ?? {}).find((id) => modes[id]?.tools === 'all');
}

/**
 * Item 4A, stage 6b (Revision 2 L4): the task ids of the scheduler's messages put into an inbox, read as Automations and
 * Finance read them (the "[SCHEDULE REMINDER" text with `schedule_id_json` or `reminders_json`).
 * @param {unknown} inserted - the `inserted` list of an `agent/inbox/spliced` event.
 * @returns {string[]} the ids, each once.
 */
export function scheduledTaskIds(inserted) {
  const ids = [];
  for (const item of Array.isArray(inserted) ? inserted : []) {
    const message = item?.message ?? item;
    if ((message?.source ?? item?.source)?.kind !== 'schedule') continue;
    const text = (Array.isArray(message?.content) ? message.content : []).map((block) => (block?.type === 'text' ? String(block.text ?? '') : '')).join('\n');
    if (!text.trimStart().startsWith('[SCHEDULE REMINDER')) continue;
    const one = /^schedule_id_json: (.+)$/m.exec(text);
    if (one) {
      try {
        ids.push(String(JSON.parse(one[1])));
      } catch {
        /* not a task id */
      }
    }
    const many = /^reminders_json: (.+)$/m.exec(text);
    if (many) {
      try {
        for (const entry of JSON.parse(many[1])) if (entry?.schedule_id) ids.push(String(entry.schedule_id));
      } catch {
        /* not a list */
      }
    }
  }
  return [...new Set(ids)];
}
