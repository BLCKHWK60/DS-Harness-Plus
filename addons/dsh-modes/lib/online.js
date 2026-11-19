/**
 * The ONE list of tools that can reach the internet (or something outside this Mac), and the one rule
 * for what Recon may ask for. It is used twice, from the same code: when the AI asks for a tool
 * (lib/access.js, lib/toolaccess.js) and when a tool runs (the guards of index.js and lib/isolation.js),
 * so a stored permission can never run `curl` in Recon or in a tab with Web Off.
 * Pure functions: no files, no app.
 */
import { COMMAND_TOOLS, HIDDEN_FROM_AI, RECON_NEVER, SETTINGS_ONLY, classify } from './catalog.js';
import { IMAGE_TOOLS, OTHER_TOOLS, RESEARCH_TOOL, WEB_TOOLS, webReaching } from './mask.js';

/** The tools that run a command in a shell. Web Off stops the ones whose command goes online (index.js, `SHELL_TOOLS`). */
export const SHELL_NAMES = Object.freeze(['bash', 'shell', 'pwsh', 'powershell', 'terminal_send']);
/** The tools that run a program (code): it can open a connection of its own. */
export const PROGRAM_NAMES = Object.freeze(['run_code', 'data_python']);
/** Tools of connectors (mail, calendar, drives, stores): every call leaves this Mac. */
const isConnector = (name) => name.startsWith('mcp__') || ['read_mcp_resource', 'list_mcp_resources', 'list_mcp_resource_templates'].includes(name);
/** The groups Recon is never given anything from: they run commands, call services, start other models, drive other apps or devices, or change the app. */
const RECON_CLOSED_GROUPS = ['run', 'accounts', 'helpers', 'mac', 'devices', 'app'];

/**
 * Whether a tool can go online or hand data to something outside Recon's own routes.
 * @param {string} name - the tool's raw name.
 * @param {{online?: string[]}} [options] - `online`: image tools the app has found to go online (the image service is not on this Mac).
 * @returns {boolean} true when it can. A tool nobody has sorted counts as yes: until sorted it is assumed to reach out.
 */
export function canGoOnline(name, { online = [] } = {}) {
  const raw = String(name ?? '');
  if (!raw) return true;
  if (WEB_TOOLS.includes(raw) || OTHER_TOOLS.includes(raw) || raw === RESEARCH_TOOL || webReaching([raw]).length > 0) return true;
  if (IMAGE_TOOLS.includes(raw) || online.includes(raw)) return true;
  if (SHELL_NAMES.includes(raw) || COMMAND_TOOLS.has(raw) || PROGRAM_NAMES.includes(raw)) return true;
  if (isConnector(raw)) return true;
  const entry = classify(raw);
  if (!entry.sorted) return true;
  if (entry.group === 'helpers' || entry.group === 'accounts' || raw === 'workflow' || raw === 'plugin_manager') return true;
  if (raw.startsWith('mac_') && raw !== 'mac_find_files') return true;
  return false;
}

/**
 * Whether Recon may ask for a tool at all. Recon keeps the final say over everything that leaves it (its routes, its cloud-model
 * rule, its export door), so it may only ask for tools that cannot reach outside those routes: no Terminal, no connectors, no
 * engines, no helpers or other models, nothing that can go online, nothing nobody has sorted yet, never the secret store, the
 * Keychain or Recon's route rules.
 * @param {string} name - the tool's raw name.
 * @param {{online?: string[]}} [options] - as for `canGoOnline`.
 * @returns {boolean} true when Recon may ask for it.
 */
export function reconMayAsk(name, options) {
  const raw = String(name ?? '');
  const entry = classify(raw);
  if (!entry.sorted || entry.tier >= SETTINGS_ONLY || HIDDEN_FROM_AI(raw) || RECON_NEVER.includes(raw)) return false;
  if (RECON_CLOSED_GROUPS.includes(entry.group) || entry.addon === 'dsh-creator-plus') return false;
  return !canGoOnline(raw, options);
}

/** The plain sentence the AI is given when Recon asks for something it may not ask for. */
export const RECON_LIMIT_TEXT = 'Recon cannot be given this tool. Recon keeps the final say over everything that leaves it, so it may only ask for tools that stay on this Mac (files, folders, documents): never the Terminal, connectors, engines, helpers or other models, or anything that can go online. Carry on with the tools you have, or tell the user what you could not do.';
