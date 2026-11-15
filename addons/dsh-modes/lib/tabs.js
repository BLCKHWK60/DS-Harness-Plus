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
 * The modes that have a tab in the sidebar, in its order.
 * @param {Array<{id: string, label: string, extra?: boolean}>} modes - every mode; `extra` marks one an add-on adds.
 * @param {unknown} maxTabs - the sidebar's tab count.
 * @returns {Array<{id: string, label: string}>} the modes with a tab.
 */
export function sidebarTabs(modes, maxTabs) {
  const list = Array.isArray(modes) ? modes : [];
  return [...list.filter((mode) => !mode.extra).slice(0, tabCount(maxTabs)), ...list.filter((mode) => mode.extra)];
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
  return `Not switched. Before the first message, the selected sidebar tab decides the mode of a new conversation (now: ${current}).${list} Pick a tab, or use /${command} after your first message.`;
}
