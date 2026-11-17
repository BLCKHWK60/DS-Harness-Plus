/**
 * Lessons in each plugin's passport (plan step T7): worked examples of calling a plugin's tools correctly.
 * Each lesson comes from a tool call that really worked in the harness (the proof) and is checked against
 * the tool's own parameter schema (the check). Where several runs solved the same task, the one with the
 * fewest calls is kept. The harness adapter's set takes them; a plugin that is added or changed makes the
 * harness adapter due for a rebuild.
 */
import { makeRow } from './rows.js';

/**
 * Whether arguments fit a tool's JSON schema (the parts tools use: object, required, properties with
 * type, enum, minimum, maximum, maxLength, items).
 * @returns {string} why they do not fit, or ''.
 */
export function schemaProblem(schema, value, path = 'arguments') {
  if (!schema || typeof schema !== 'object') return '';
  const type = schema.type;
  const is = {
    object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
    array: Array.isArray,
    string: (v) => typeof v === 'string',
    number: (v) => typeof v === 'number' && Number.isFinite(v),
    integer: Number.isInteger,
    boolean: (v) => typeof v === 'boolean',
  };
  if (typeof type === 'string' && is[type] && !is[type](value)) return `${path} is not ${type === 'integer' ? 'a whole number' : `a${type === 'object' || type === 'array' ? 'n' : ''} ${type}`}`;
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return `${path} is not one of ${schema.enum.slice(0, 6).join(', ')}`;
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) return `${path} is below ${schema.minimum}`;
    if (typeof schema.maximum === 'number' && value > schema.maximum) return `${path} is above ${schema.maximum}`;
  }
  if (typeof value === 'string' && typeof schema.maxLength === 'number' && value.length > schema.maxLength) return `${path} is longer than ${schema.maxLength}`;
  if (Array.isArray(value) && schema.items) {
    for (const [index, item] of value.slice(0, 50).entries()) {
      const problem = schemaProblem(schema.items, item, `${path}[${index}]`);
      if (problem) return problem;
    }
  }
  if (is.object(value)) {
    for (const key of Array.isArray(schema.required) ? schema.required : []) if (!(key in value)) return `${path}.${key} is missing`;
    const props = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
    for (const [key, item] of Object.entries(value)) {
      if (props[key]) {
        const problem = schemaProblem(props[key], item, `${path}.${key}`);
        if (problem) return problem;
      } else if (schema.additionalProperties === false) return `${path}.${key} is not a parameter`;
    }
  }
  return '';
}

/**
 * Lessons from the harvested tool-call rows.
 * @param {object[]} rows - rows of kind toolcalls (from the pool, or from the exam: each lesson stays on its row's side).
 * @param {{schemaOf: (tool: string) => object | undefined, pluginOf: (tool: string) => string, most?: number}} lookups -
 *   a tool's parameter schema, the plugin a tool belongs to, and how many lessons per tool at most.
 * @returns {Record<string, object[]>} lesson rows per plugin.
 */
export function lessonsFrom(rows, { schemaOf, pluginOf, most = 8 }) {
  const byTool = new Map();
  for (const row of rows) {
    if (row.kind !== 'toolcalls') continue;
    let solved;
    try {
      solved = JSON.parse(row.output);
    } catch {
      continue;
    }
    const calls = Array.isArray(solved?.calls) ? solved.calls : [];
    for (const call of calls) {
      const tool = String(call?.name ?? '');
      const plugin = pluginOf(tool);
      if (!tool || !plugin) continue;
      const schema = schemaOf(tool);
      if (!schema || schemaProblem(schema, call.arguments ?? {})) continue;
      const list = byTool.get(tool) ?? [];
      list.push({ row, call, steps: calls.length, plugin });
      byTool.set(tool, list);
    }
  }
  const out = {};
  for (const [tool, list] of byTool) {
    // The fewest calls first: the shortest way to the same result is the one to learn.
    const best = list.sort((a, b) => a.steps - b.steps || (a.row.at ?? 0) - (b.row.at ?? 0)).slice(0, most);
    for (const { row, call, plugin } of best) {
      // A lesson is made from a row, so it keeps that row's flags and its side of the exam split.
      const lesson = makeRow({ kind: 'lesson', mode: row.mode, input: row.input, output: JSON.stringify({ calls: [{ name: tool, arguments: call.arguments ?? {} }] }), proof: { check: 'schema', detail: `${tool} worked in the harness and fits its parameters` }, by: row.by, from: { tool, plugin, session: row.from?.session }, at: row.at, signedIn: row.signedIn === true, unsure: row.unsure === true });
      lesson.exam = row.exam === true;
      lesson.from.derived = row.id;
      (out[plugin] ??= []).push(lesson);
    }
  }
  return out;
}

/** A fingerprint of the tools the harness offers (names and parameter shapes): a change makes the harness adapter due. */
export function toolsKey(tools) {
  return (Array.isArray(tools) ? tools : []).map((tool) => `${tool.name}:${Object.keys(tool.parameters?.properties ?? {}).sort().join(',')}`).sort().join('|');
}
