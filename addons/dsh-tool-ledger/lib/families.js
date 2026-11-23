/**
 * Which tool family a tool belongs to, the same way Modes groups tools when a tab loads them as needed
 * (dsh-modes/lib/trim.js). Modes' own table is used when Modes sits beside this add-on; the copy below is
 * the fallback for when it does not. test/families.test.mjs fails when the copy and Modes' table drift apart.
 */

/** The tools a trimmed tab always has (a copy of Modes' CORE). */
export const CORE = [
  'read', 'write', 'edit', 'glob', 'grep', 'bash', 'job_output', 'job_list', 'job_kill',
  'todo_write', 'ask_user_question', 'skill', 'read_image', 'working_directory', 'exit_plan_mode', 'tools_find',
];

/** The families: tool names and name prefixes (a copy of Modes' FAMILIES, without the words and descriptions). */
export const FAMILIES = [
  { id: 'pdf', prefixes: ['pdf_'] },
  { id: 'data', prefixes: ['data_'] },
  { id: 'finance', prefixes: ['finance_'] },
  { id: 'visual', names: ['diagram_draw', 'present'] },
  { id: 'schedule', names: ['schedule_create', 'schedule_edit', 'schedule_list', 'schedule_view'], prefixes: ['schedule_'] },
  { id: 'helpers', names: ['subagent', 'subagent_fork', 'list_agents', 'wait_agent', 'send_message', 'list_subagent_models', 'delegate_role', 'run_swarm', 'run_pipeline', 'review_lanes', 'judge_candidates', 'deep_research'] },
  { id: 'goals', names: ['create_goal', 'get_goal', 'update_goal'] },
  { id: 'library', prefixes: ['library_'] },
  { id: 'memory', names: ['remember'] },
  { id: 'mac', prefixes: ['mac_'] },
  { id: 'code', prefixes: ['code_map_'] },
  { id: 'learn', prefixes: ['learn_'] },
  { id: 'mission', prefixes: ['mission_'] },
  { id: 'connectors', names: ['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource'], prefixes: ['mcp__'] },
  { id: 'app', names: ['plugin_manager', 'workflow'] },
  { id: 'office', names: ['load_workspace_dependencies', 'present'], prefixes: ['office_'] },
];

/**
 * Tools that are only on offer in a certain state of a conversation. A call of one of them that the tab did not offer
 * (rule `not-offered`) is what happens outside that state, not a sign the tab is missing it, so it is left out of the
 * two suggestion views (askedButOff, refusedMost). The lines on disk and the Every tool table keep it.
 * - `mission_step` (dsh-mission runner.js STEP_TOOL): Modes adds it to a conversation's tools only while a Mission run
 *   (Long run) is on there (dsh-modes lib/mask.js longRunMask, lib/isolation.js isolatedRunMask).
 * Not `mission_request_files`: Mission always registers it and Modes never adds it by itself (it is an ordinary
 * `mission_` family tool), so a tab that does not offer it while Mission tells the model to call it is missing it.
 */
export const STATE_ONLY_TOOLS = Object.freeze(['mission_step']);

/**
 * True when a call line is a state-only tool that the tab did not offer: expected outside its state, no suggestion.
 * @param {{tool?: string, rule?: string}} row - a call line.
 * @returns {boolean} true to leave it out of the suggestion views.
 */
export const isStateOnlyMiss = (row) => row?.rule === 'not-offered' && STATE_ONLY_TOOLS.includes(row?.tool);

/**
 * Build the family reader from a table.
 * @param {{core: string[], families: Array<{id: string, names?: string[], prefixes?: string[]}>}} table - Modes' table or the copy.
 * @returns {(name: string) => string} 'core', a family id, or 'other'.
 */
export function makeFamilyOf({ core, families }) {
  const coreSet = new Set(core);
  return (name) => {
    const tool = String(name ?? '');
    if (coreSet.has(tool)) return 'core';
    const found = families.find((family) => family.names?.includes(tool) || family.prefixes?.some((prefix) => tool.startsWith(prefix)));
    return found?.id ?? 'other';
  };
}

/** The fallback reader, from the copy above. */
export const familyOf = makeFamilyOf({ core: CORE, families: FAMILIES });

/**
 * Modes' own table when Modes is installed beside this add-on, else the copy.
 * @returns {Promise<(name: string) => string>} the reader.
 */
export async function loadFamilyOf() {
  try {
    const trim = await import(new URL('../../dsh-modes/lib/trim.js', import.meta.url).href);
    if (Array.isArray(trim.CORE) && Array.isArray(trim.FAMILIES)) return makeFamilyOf({ core: trim.CORE, families: trim.FAMILIES });
  } catch {
    // Modes is not beside this add-on: the copy serves.
  }
  return familyOf;
}
