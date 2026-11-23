/**
 * The Cowork sidebar's tabs as Modes sees them: the first modes of the list, up to the sidebar's
 * tab count, then every mode an add-on adds. Kept apart from the plugin so it can be tested without the app.
 */

/** Tabs the sidebar shows when its own setting cannot be read. */
export const DEFAULT_TABS = 3;

/**
 * The sidebar's tab count, checked.
 * @param {unknown} value - the Cowork sidebar's `maxTabs`.
 * @returns {number} 1 to 5; 3 when unknown.
 */
export function tabCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= 5 ? count : DEFAULT_TABS;
}

/**
 * The tabs in the owner's own order (the Cowork sidebar's `tabOrder`): those it names first, in that
 * order; a tab it does not name follows, in the usual order; names of tabs not here are skipped. The
 * same rule as `orderTabs` in the Cowork sidebar's client.js.
 * @param {Array<{id: string}>} tabs - the tabs in the usual order.
 * @param {unknown} order - the saved order (tab ids).
 * @returns {Array<{id: string}>} the same tabs, reordered.
 */
export function orderTabs(tabs, order) {
  const list = Array.isArray(tabs) ? tabs : [];
  const seen = new Set();
  for (const id of Array.isArray(order) ? order : []) {
    if (typeof id === 'string' && /^[A-Za-z0-9][\w-]{0,127}$/.test(id) && seen.size < 50) seen.add(id);
  }
  if (seen.size === 0) return list;
  const rank = new Map([...seen].map((id, i) => [id, i]));
  const named = list.filter((tab) => rank.has(tab.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id));
  return [...named, ...list.filter((tab) => !rank.has(tab.id))];
}

/**
 * The modes that have a tab in the sidebar, in its order.
 * @param {Array<{id: string, label: string, extra?: boolean, added?: boolean}>} modes - every mode; `extra` marks one an add-on adds, `added` a built-in mode added later.
 * @param {unknown} maxTabs - the sidebar's tab count.
 * @param {unknown} [order] - the sidebar's own tab order (`tabOrder`), if any.
 * @returns {Array<{id: string, label: string}>} the modes with a tab.
 */
export function sidebarTabs(modes, maxTabs, order) {
  const list = Array.isArray(modes) ? modes : [];
  // A built-in mode added later (Plain chat, `added`) never takes a tab: it lives in the Mode list.
  const own = list.filter((mode) => !mode.added);
  return orderTabs([...own.filter((mode) => !mode.extra).slice(0, tabCount(maxTabs)), ...own.filter((mode) => mode.extra)], order);
}

/**
 * The answer to `/mode <id>` before a conversation's first message while the sidebar is on: the
 * selected tab decides the mode of a new conversation.
 * @param {object} want - what to say.
 * @param {string} want.current - the label of the mode the selected tab gives.
 * @param {string[]} want.tabs - the labels of the tabs.
 * @param {string} want.command - the command's name, without the slash.
 * @returns {string} the answer.
 */
export function beforeFirstMessage({ current, tabs, command }) {
  const list = tabs.length > 0 ? ` Tabs: ${tabs.join(', ')}.` : '';
  return `Not switched. Before the first message, the selected tab in the left panel decides the mode of a new thread (now: ${current}).${list} Pick a tab, or use /${command} after your first message.`;
}
