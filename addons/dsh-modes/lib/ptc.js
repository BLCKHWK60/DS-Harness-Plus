/**
 * Conversations where the model reaches tools through programs (the app's PTC preset, or any
 * preset built on the same executor). Kept apart from the plugin so it can be tested without the app.
 */

/** The one tool such a conversation can call directly. */
export const PROGRAM_TOOL = 'run_code';
/**
 * Add-on tools that can run for minutes: research and swarm runs, the judge, PDF text recognition, the image
 * tools and a Mac Shortcut (item 7). The note tells the model to run each alone with the longest time limit.
 */
export const SLOW_TOOLS = ['deep_research', 'run_swarm', 'run_pipeline', 'delegate_role', 'review_lanes', 'judge_candidates', 'pdf_ocr', 'generate_image', 'edit_image', 'mac_run_shortcut'];
/**
 * Tools that can take as long as a program's default limit but suit batching (Data's data_python, 2 minutes of its
 * own): the note asks only for a higher time limit, never to run them alone, so Data keeps batching.
 */
export const TIMED_TOOLS = ['data_python'];

/**
 * Whether an agent's tools are reachable only from inside a program.
 * @param {object} tools - the app's tools service.
 * @param {object} agent - live Agent.
 * @returns {boolean} true for PTC; false when it is not, or cannot be told.
 */
export function programOnly(tools, agent) {
  try {
    const names = tools?.selectExecutor?.(agent)?.describe?.([])?.knownNames;
    return Array.isArray(names) && names.length === 1 && names[0] === PROGRAM_TOOL;
  } catch {
    return false;
  }
}

/**
 * The note added to the instructions of such a conversation.
 * @param {object} [want] - what applies.
 * @param {{defaultMs?: number, maxMs?: number}} [want.timeout] - the app's time limits for one program.
 * @param {string[]} [want.slow] - slow tools this conversation can reach.
 * @param {string[]} [want.timed] - tools that only need a higher time limit (TIMED_TOOLS) this conversation can reach.
 * @returns {string} the note.
 */
export function programNote({ timeout, slow = [], timed = [] } = {}) {
  const lines = [
    `Wherever these instructions or a skill say to use or call a tool, call it from inside a \`${PROGRAM_TOOL}\` program. A direct call to any other tool fails.`,
  ];
  const max = Number(timeout?.maxMs);
  const usual = Number(timeout?.defaultMs);
  if (slow.length > 0 && max > 0) {
    const stops = usual > 0 ? `A program is stopped after ${Math.round(usual / 1000)} seconds unless you pass \`timeoutMs\`. ` : '';
    lines.push(
      `${stops}${slow.join(', ')} can take minutes: call such a tool alone in its own program and pass \`timeoutMs: ${max}\` (the most allowed), or its work is lost.`,
    );
  }
  if (timed.length > 0 && max > 0) {
    const stops = slow.length === 0 && usual > 0 ? `A program is stopped after ${Math.round(usual / 1000)} seconds unless you pass \`timeoutMs\`. ` : '';
    lines.push(`${stops}${timed.join(', ')} can take up to a few minutes: pass a higher \`timeoutMs\` (up to ${max}) to a program that calls it.`);
  }
  return lines.join(' ');
}
