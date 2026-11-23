/**
 * Item 4A, stage 6a: what the Modes add-on says about a thread's space (STAGE6A-DESIGN.md 2.6), and the guest test
 * Devices uses when Modes is older than apiVersion 2 (2.3 `guestRefuses`, with the catalog groups written out).
 *
 * The same small reader is copied into every add-on that needs it (never imported across add-ons).
 * - No Modes service: not sealed, no space (as before; a missing Modes add-on means "no").
 * - A Modes service with `guardOf` (apiVersion 2): its answer.
 * - An older Modes service: worked out from `get`, `isolated` and `spaces.of`.
 * - The service is there and throws: fail closed (sealed, unknown guard).
 *
 * Refusals test `sealed`; permissions test `reconSpace`; guards test `guardedBy` ('unknown' counts as Devices).
 */

const GUARDED_FALLBACK = ['devices', 'recon', 'workshop'];

export const NO_GUARD = Object.freeze({ top: '', space: '', mode: '', sealed: false, sealedBy: '', reconSpace: false, guardedBy: '', noPrograms: false, homeMode: false, fresh: false, unknownTop: false, legacy: true, absent: true });
export const ERROR_GUARD = Object.freeze({ top: '', space: '', mode: '', sealed: true, sealedBy: '', reconSpace: false, guardedBy: 'unknown', noPrograms: true, homeMode: false, fresh: false, unknownTop: true, legacy: true });

/**
 * @param {() => any} getModes - returns the Modes service (may throw or return undefined).
 * @returns {(id: string) => Readonly<object>} guardOf.
 */
export function makeGuardOf(getModes) {
  return (id) => {
    let m;
    try {
      m = getModes();
    } catch {
      return NO_GUARD;
    }
    if (!m) return NO_GUARD;
    try {
      if (typeof m.guardOf === 'function') return m.guardOf(String(id ?? '')) ?? ERROR_GUARD;
      const mode = String(m.get?.(id) ?? '');
      const sealed = m.isolated?.(id) === true;
      const space = String(m.spaces?.of?.(id) ?? '');
      const reconSpace = space === 'recon' || (mode === 'recon' && sealed);
      return {
        top: String(id ?? ''), space, mode, sealed, sealedBy: reconSpace ? 'recon' : sealed ? 'mode' : '', reconSpace,
        guardedBy: space === 'devices' || space === 'workshop' ? space : '', noPrograms: sealed || GUARDED_FALLBACK.includes(space),
        homeMode: ['recon', 'bench', 'creator-plus'].includes(mode), fresh: false, unknownTop: false, legacy: true,
      };
    } catch {
      return ERROR_GUARD;
    }
  };
}

// ---- the guest test (2.3), for a Modes add-on without `spaces.guestRefuses` ----------------------------------------
// A copy of Modes' rule with the catalog groups written out: what a guest may run is what the catalog sorts into the
// groups read, change, web, make, schedule and devices (minus Office files and Creator Plus's tools; stage 6b: schedules
// only for a guest in Devices or Workshop, never for the unknown guard); the
// helper family, Spotlight search and the two Tool access tools are kept. Anything else (a tool nobody sorted, a
// connector, another Mac app, the app's own tools) is refused, so an unknown tool is never let through.

/** 2.3 GUEST_REFUSED: names and prefixes refused whatever their group. */
export const GUEST_REFUSED = Object.freeze({
  names: Object.freeze(['bash', 'shell', 'pwsh', 'powershell', 'terminal', 'terminal_open', 'terminal_send', 'run_code', 'data_python', 'job_output', 'job_list', 'job_kill', 'engine', 'workflow', 'plugin_manager', 'mac_shortcuts']),
  prefixes: Object.freeze(['terminal_', 'mcp__', 'office_', 'creator_', 'mac_']),
  keepHelpers: Object.freeze(['subagent', 'subagent_fork', 'list_agents', 'wait_agent', 'send_message', 'list_subagent_models', 'delegate_role', 'review_lanes', 'run_pipeline', 'judge_candidates', 'run_swarm', 'deep_research']),
  // Item 4A, stage 6a (integration): Mission's own two tools are kept, as in Modes' rule, so a Mission runs for guests
  // under Devices' Mission rules.
  keepNames: Object.freeze(['mac_find_files', 'tools_catalog', 'request_tool_access', 'mission_step', 'mission_request']),
});

/** The catalog's sorted names in the groups a guest keeps (dsh-modes lib/catalog.js, 22 Nov 2026). */
const GUEST_OK_NAMES = new Set([
  // read
  'read', 'glob', 'grep', 'read_image', 'working_directory', 'data_files', 'data_profile', 'data_query', 'data_text', 'data_analyses', 'data_chart',
  'pdf_info', 'pdf_read', 'pdf_search', 'pdf_page_image', 'pdf_ocr', 'library_search', 'library_read',
  'code_map_overview', 'code_map_file', 'code_map_find', 'code_map_related', 'code_map_read',
  'finance_prices', 'finance_news', 'finance_social', 'finance_company_figures', 'finance_company_filings', 'finance_economy', 'finance_source_get',
  'learn_plan', 'learn_mark', 'learn_review', 'learn_status', 'learn_end',
  // change
  'write', 'edit', 'multi_edit', 'apply_patch', 'str_replace_editor', 'notebook_edit', 'move', 'delete', 'remove', 'data_save_analysis', 'data_rerun_analysis', 'finance_profile_save',
  // web
  'web_search', 'web_fetch', 'other_search', 'other_read', 'weather', 'multi_search', 'advanced_search', 'platform_search', 'video_search', 'cache_search', 'domain_search', 'research', 'search_web_pages', 'web_search_exa', 'zhihu_search', 'global_search', 'search_pro', 'free_search_test',
  'scout_sources', 'scout_search', 'scout_titles', 'scout_demand', 'scout_pay', 'scout_posting', 'scout_assess', 'scout_files', 'scout_profile', 'scout_report', 'scout_reports',
  // make
  'diagram_draw', 'present', 'generate_image', 'edit_image', 'automation_results',
  'content_reports', 'content_ledger', 'content_rule', 'content_plan', 'content_formats', 'content_draft', 'content_check', 'content_approve', 'content_correct', 'content_library', 'content_continue', 'content_inventory', 'content_setup', 'content_save', 'content_conversations', 'content_bring_in',
  // schedule (stage 6b, point 27: the app's four schedule tools, for a guest in Devices or Workshop only)
  'todo_write', 'ask_user_question', 'skill', 'exit_plan_mode', 'remember', 'create_goal', 'get_goal', 'update_goal', 'tools_find',
  'schedule_create', 'schedule_edit', 'schedule_list', 'schedule_view',
]);

const matches = (name, { names, prefixes }) => names.includes(name) || prefixes.some((prefix) => name.startsWith(prefix));

/**
 * Whether a guest in Devices (or Workshop, or the unknown guard) may never run a tool: the local copy of Modes'
 * `spaces.guestRefuses`, used only when Modes does not offer it.
 * @param {string} name - the tool's raw name.
 * @param {{space?: string}} [opts] - stage 6b (J14): the guest's space; anything but 'devices' or 'workshop' (none
 *   included) is the unknown guard, which still refuses the schedule tools (fail closed).
 * @returns {boolean} true when refused.
 */
export function localGuestRefuses(name, opts = {}) {
  const raw = String(name ?? '');
  if (/^bench_/.test(raw)) return false;
  if (GUEST_REFUSED.keepHelpers.includes(raw) || GUEST_REFUSED.keepNames.includes(raw)) return false;
  if (matches(raw, GUEST_REFUSED)) return true;
  const space = String(opts?.space ?? '');
  if (raw.startsWith('schedule_') && space !== 'devices' && space !== 'workshop') return true;
  return !GUEST_OK_NAMES.has(raw);
}
