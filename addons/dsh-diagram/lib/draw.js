/**
 * From a description to a finished drawing, with a list of anything a reader
 * would stumble over. The list goes back to the model, so it can fix the
 * description and draw again.
 */
import { layoutChart } from './chart.js';
import { layoutFlow } from './flow.js';
import { layoutSequence, layoutTimeline } from './sequence.js';
import { readSpec } from './spec.js';
import { document, withTitle } from './svg.js';
import { layoutTree } from './tree.js';

const LAYOUTS = { flow: layoutFlow, tree: layoutTree, sequence: layoutSequence, timeline: layoutTimeline, chart: layoutChart };

const overlap = (a, b, slack = 0) => a.x + slack < b.x + b.w && b.x + slack < a.x + a.w && a.y + slack < b.y + b.h && b.y + slack < a.y + a.h;

/**
 * Look over a laid-out drawing for things that would confuse a reader.
 * @param {{width: number, height: number, boxes: object[], labels: object[], crossings: number}} drawing - the laid-out drawing.
 * @param {object} spec - its description.
 * @returns {string[]} problems, in plain words; empty when the drawing is clean.
 */
export function inspect(drawing, spec) {
  const problems = [];
  const nodes = drawing.boxes.filter((box) => box.kind === 'node' || box.kind === 'note');
  const groups = drawing.boxes.filter((box) => box.kind === 'group');
  const name = (box) => `"${box.label ?? box.id}"`;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) if (overlap(nodes[i], nodes[j], 1)) problems.push(`The boxes ${name(nodes[i])} and ${name(nodes[j])} overlap.`);
    if (nodes[i].textWidth > nodes[i].inner + 1) problems.push(`The text of ${name(nodes[i])} does not fit its box. Shorten it.`);
  }
  for (const label of drawing.labels) {
    const hit = nodes.find((box) => overlap(label, box, 2));
    if (hit && label.text) problems.push(`The arrow label "${label.text}" sits on top of the box ${name(hit)}. Shorten the label or leave it out.`);
  }
  for (let i = 0; i < drawing.labels.length; i += 1) {
    for (let j = i + 1; j < drawing.labels.length; j += 1) {
      if (overlap(drawing.labels[i], drawing.labels[j], 1) && drawing.labels[i].text && drawing.labels[j].text) problems.push(`The arrow labels "${drawing.labels[i].text}" and "${drawing.labels[j].text}" overlap. Shorten them or leave one out.`);
    }
  }
  for (const group of groups) {
    const inside = nodes.filter((box) => box.group !== group.id && overlap(group, box, 2));
    if (inside.length > 0) problems.push(`The frame of the group "${group.id}" also covers ${inside.map(name).join(', ')}, which ${inside.length === 1 ? 'is' : 'are'} not in the group. Put ${inside.length === 1 ? 'it' : 'them'} in the group, or give the group fewer members.`);
  }
  for (let i = 0; i < groups.length; i += 1) for (let j = i + 1; j < groups.length; j += 1) if (overlap(groups[i], groups[j], 2)) problems.push(`The groups "${groups[i].id}" and "${groups[j].id}" overlap. Arrows between their members may be pulling them together; try the other direction.`);
  const arrows = spec.edges?.length ?? 0;
  if (drawing.crossings > Math.max(2, Math.round(arrows * 0.35))) problems.push(`${drawing.crossings} arrows cross each other, which is hard to follow. Use fewer arrows, split the diagram in two, or try direction "${spec.direction === 'right' ? 'down' : 'right'}".`);
  if (drawing.width > 1700 || drawing.height > 2200) problems.push(`The picture is very large (${Math.round(drawing.width)} × ${Math.round(drawing.height)}). Split it into smaller diagrams.`);
  if ([...nodes, ...drawing.labels].some((box) => box.x < -1 || box.y < -1 || box.x + box.w > drawing.width + 1 || box.y + box.h > drawing.height + 1)) problems.push('Part of the drawing falls outside the picture.');
  return problems;
}

/**
 * Draw a diagram from its description.
 * @param {unknown} raw - the description as the model wrote it.
 * @returns {{ok: boolean, errors?: string[], kind?: string, title?: string, width?: number, height?: number, outline?: string, problems?: string[], svg?: (options?: {theme?: string, background?: boolean}) => string}} the result.
 */
export function draw(raw) {
  const read = readSpec(raw);
  if (!read.spec) return { ok: false, errors: read.errors };
  let laid;
  try {
    laid = LAYOUTS[read.spec.kind](read.spec);
  } catch (error) {
    return { ok: false, errors: [`The diagram could not be laid out (${String(error?.message ?? error).slice(0, 160)}). Simplify it and try again.`] };
  }
  const problems = [...read.warnings, ...(laid.notes ?? []), ...inspect(laid, read.spec)];
  const titled = withTitle(laid, read.spec.title);
  const title = read.spec.title || { flow: 'Flowchart', tree: 'Tree', sequence: 'Sequence', timeline: 'Timeline', chart: 'Chart' }[read.spec.kind];
  return {
    ok: true,
    kind: read.spec.kind,
    title,
    width: Math.ceil(titled.width),
    height: Math.ceil(titled.height),
    outline: laid.outline,
    problems,
    svg: (options = {}) => document({ width: titled.width, height: titled.height, title, desc: laid.outline.split('\n')[0], body: titled.body }, options),
  };
}
