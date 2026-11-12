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
  if (typeof wanted === 'string' && wanted && modes?.[wanted]) return wanted;
  return Object.keys(modes ?? {}).find((id) => modes[id]?.tools === 'all');
}
