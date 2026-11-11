/**
 * Reads the description of a diagram that a model wrote, and either turns it
 * into a clean, complete description or says exactly what is wrong with it, in
 * words the model can act on.
 */
import { compile } from './expr.js';
import { COLORS } from './svg.js';

export const KINDS = ['flow', 'tree', 'sequence', 'timeline', 'chart'];
export const SHAPES = ['box', 'round', 'pill', 'diamond', 'note'];
export const CHARTS = ['bar', 'line', 'scatter', 'plot'];

const text = (value, max = 200) => (typeof value === 'string' || typeof value === 'number' ? String(value).replace(/\s+/g, ' ').trim().slice(0, max) : '');
const list = (value) => (Array.isArray(value) ? value : []);
const colour = (value) => (COLORS.includes(value) ? value : undefined);
const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : undefined);

/**
 * @param {unknown} raw - what the model sent.
 * @returns {{spec?: object, errors: string[], warnings: string[]}} a clean description, or what to fix.
 */
export function readSpec(raw) {
  const errors = [];
  const warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { errors: ['Send the diagram as an object with a "kind".'], warnings };
  const kind = KINDS.includes(raw.kind) ? raw.kind : undefined;
  if (!kind) return { errors: [`"kind" must be one of: ${KINDS.join(', ')}.`], warnings };
  const spec = { kind, title: text(raw.title, 120) };
  const long = (label, what) => {
    if (label.length > 90) warnings.push(`The text of ${what} is long (${label.length} characters). Short labels read better; put detail in your answer, not in the box.`);
  };

  if (kind === 'flow') {
    spec.direction = raw.direction === 'right' ? 'right' : 'down';
    const ids = new Set();
    spec.nodes = [];
    for (const item of list(raw.nodes)) {
      const id = text(item?.id ?? item?.label, 60);
      if (!id) {
        errors.push('Every box in "nodes" needs an "id".');
        continue;
      }
      if (ids.has(id)) {
        errors.push(`Two boxes have the id "${id}". Ids must be different.`);
        continue;
      }
      ids.add(id);
      const label = text(item.label, 160) || id;
      long(label, `box "${id}"`);
      spec.nodes.push({ id, label, shape: SHAPES.includes(item.shape) ? item.shape : 'box', color: colour(item.color) ?? 'gray', group: text(item.group, 60) || undefined });
    }
    if (spec.nodes.length === 0) errors.push('A flowchart needs "nodes": a list of boxes, each with an "id" and a "label".');
    if (spec.nodes.length > 60) errors.push(`${spec.nodes.length} boxes are too many for one picture (the limit is 60). Split it into several diagrams.`);
    else if (spec.nodes.length > 22) warnings.push(`${spec.nodes.length} boxes make a crowded picture. A diagram teaches best with about 5 to 15; consider splitting it.`);
    spec.edges = [];
    for (const item of list(raw.edges)) {
      const from = text(item?.from, 60);
      const to = text(item?.to, 60);
      const missing = [from, to].filter((id) => !ids.has(id));
      if (missing.length > 0) {
        errors.push(`An arrow uses ${missing.map((id) => `"${id}"`).join(' and ')}, which is not the id of any box. The ids are: ${[...ids].slice(0, 40).join(', ')}.`);
        continue;
      }
      spec.edges.push({ from, to, label: text(item.label, 80), dashed: item.dashed === true });
    }
    if (spec.edges.length > 120) errors.push('More than 120 arrows are too many for one picture.');
    const declared = new Map(list(raw.groups).map((group) => [text(group?.id ?? group?.label, 60), text(group?.label, 80) || text(group?.id, 60)]));
    const used = [...new Set(spec.nodes.map((node) => node.group).filter(Boolean))];
    spec.groups = used.map((id) => ({ id, label: declared.get(id) ?? id }));
    const alone = spec.nodes.filter((node) => spec.nodes.length > 1 && !spec.edges.some((edge) => edge.from === node.id || edge.to === node.id));
    if (alone.length > 0) warnings.push(`${alone.length === 1 ? 'One box has' : `${alone.length} boxes have`} no arrow: ${alone.map((node) => `"${node.id}"`).join(', ')}. Connect ${alone.length === 1 ? 'it' : 'them'} or leave ${alone.length === 1 ? 'it' : 'them'} out.`);
  }

  if (kind === 'tree') {
    spec.direction = raw.direction === 'down' ? 'down' : 'right';
    let count = 0;
    let deepest = 0;
    const read = (item, depth) => {
      count += 1;
      deepest = Math.max(deepest, depth);
      const label = text(typeof item === 'string' ? item : item?.label, 140);
      if (!label) errors.push('Every branch of a tree needs a "label".');
      long(label, `branch "${label.slice(0, 30)}"`);
      const children = depth < 8 ? list(item?.children).slice(0, 40).map((child) => read(child, depth + 1)) : [];
      return { label: label || '?', color: colour(item?.color), children };
    };
    if (!raw.root || (typeof raw.root !== 'object' && typeof raw.root !== 'string')) errors.push('A tree needs "root": an object with a "label" and "children" (each child again with "label" and "children").');
    else spec.root = read(raw.root, 0);
    if (count > 120) errors.push(`${count} branches are too many for one picture (the limit is 120). Split the tree.`);
    else if (count > 40) warnings.push(`${count} branches make a large picture. Consider showing fewer levels.`);
    if (spec.root && spec.root.children.length === 0) warnings.push('The tree has only a root. Add "children".');
  }

  if (kind === 'sequence') {
    const ids = new Set();
    spec.actors = [];
    for (const item of list(raw.actors)) {
      const id = text(typeof item === 'string' ? item : item?.id ?? item?.label, 60);
      if (!id || ids.has(id)) {
        errors.push(id ? `Two parties have the id "${id}".` : 'Every party in "actors" needs an "id".');
        continue;
      }
      ids.add(id);
      spec.actors.push({ id, label: text(item?.label, 80) || id, color: colour(item?.color) });
    }
    if (spec.actors.length === 0) errors.push('A sequence needs "actors": the parties, each with an "id" and a "label".');
    if (spec.actors.length > 8) errors.push('More than 8 parties are too many for one sequence.');
    spec.steps = [];
    for (const item of list(raw.steps)) {
      if (item?.note !== undefined) {
        const over = list(item.over).map((id) => text(id, 60)).filter((id) => ids.has(id));
        spec.steps.push({ note: text(item.note, 240), over });
        continue;
      }
      const from = text(item?.from, 60);
      const to = text(item?.to, 60) || from;
      const missing = [from, to].filter((id) => !ids.has(id));
      if (missing.length > 0) {
        errors.push(`A step uses ${[...new Set(missing)].map((id) => `"${id}"`).join(' and ')}, which is not the id of any party. The ids are: ${[...ids].join(', ')}.`);
        continue;
      }
      spec.steps.push({ from, to, label: text(item.label, 160), reply: item.reply === true || item.dashed === true });
    }
    if (spec.steps.length === 0) errors.push('A sequence needs "steps": each with "from", "to" and a "label", in order.');
    if (spec.steps.length > 60) errors.push('More than 60 steps are too many for one sequence.');
  }

  if (kind === 'timeline') {
    spec.events = [];
    for (const item of list(raw.events)) {
      const when = text(item?.when ?? item?.date ?? item?.year, 40);
      const title = text(item?.title ?? item?.label, 120);
      if (!when || !title) {
        errors.push('Every event needs "when" (a date or a moment, as text) and a "title".');
        continue;
      }
      spec.events.push({ when, title, text: text(item.text, 300), color: colour(item.color) });
    }
    if (spec.events.length === 0 && errors.length === 0) errors.push('A timeline needs "events": each with "when", "title" and an optional "text", earliest first.');
    if (spec.events.length > 40) errors.push('More than 40 events are too many for one timeline.');
  }

  if (kind === 'chart') {
    spec.chart = CHARTS.includes(raw.chart) ? raw.chart : undefined;
    spec.xLabel = text(raw.xLabel, 80);
    spec.yLabel = text(raw.yLabel, 80);
    for (const key of ['xMin', 'xMax', 'yMin', 'yMax']) spec[key] = number(raw[key]);
    spec.categories = list(raw.categories).map((item) => text(item, 60)).filter(Boolean);
    spec.functions = [];
    for (const item of list(raw.functions)) {
      const formula = text(typeof item === 'string' ? item : item?.formula, 200);
      try {
        compile(formula);
        spec.functions.push({ formula, name: text(item?.name, 80) });
      } catch (error) {
        errors.push(error.message);
      }
    }
    spec.series = [];
    for (const item of list(raw.series)) {
      const name = text(item?.name, 80);
      if (spec.categories.length > 0) {
        const values = list(item?.values).map((value) => number(value) ?? NaN);
        if (values.length !== spec.categories.length) errors.push(`The series "${name || spec.series.length + 1}" has ${values.length} values but there are ${spec.categories.length} categories. Give one value per category.`);
        else spec.series.push({ name, values, points: [] });
      } else {
        const points = list(item?.points).map((point) => [number(list(point)[0]), number(list(point)[1])]).filter((point) => point[0] !== undefined && point[1] !== undefined);
        if (points.length === 0) errors.push(`The series "${name || spec.series.length + 1}" has no usable "points". Each point is [x, y], two numbers. (For named categories, give "categories" and "values".)`);
        else spec.series.push({ name, values: [], points });
      }
    }
    if (!spec.chart) spec.chart = spec.functions.length > 0 ? 'plot' : spec.categories.length > 0 ? 'bar' : 'scatter';
    if (spec.categories.length > 0 && spec.functions.length > 0) errors.push('A formula needs a number axis. Leave out "categories" when you give "functions".');
    if (spec.categories.length > 0 && (spec.chart === 'scatter' || spec.chart === 'plot')) spec.chart = 'line';
    if (spec.categories.length === 0 && spec.chart === 'bar') errors.push('A bar chart needs "categories" (the names along the bottom) and, per series, "values".');
    if (spec.series.length === 0 && spec.functions.length === 0 && errors.length === 0) errors.push('A chart needs "series" (with "values" per category, or "points" as [x, y] pairs) or "functions" (formulas in x).');
    if (spec.series.length + spec.functions.length > 6) errors.push('More than 6 series or formulas are too many for one chart.');
    if (spec.categories.length > 30) errors.push('More than 30 categories are too many for one chart.');
    else if (spec.categories.length > 14) warnings.push(`${spec.categories.length} categories make narrow bars and small labels. Consider grouping them.`);
    if (spec.series.reduce((total, series) => total + series.points.length, 0) > 3000) errors.push('More than 3,000 points are too many for one chart.');
    if (spec.xMin !== undefined && spec.xMax !== undefined && spec.xMin >= spec.xMax) errors.push('"xMin" must be smaller than "xMax".');
    if (spec.yMin !== undefined && spec.yMax !== undefined && spec.yMin >= spec.yMax) errors.push('"yMin" must be smaller than "yMax".');
    if (spec.functions.length > 0 && spec.series.length === 0 && spec.xMin === undefined && spec.xMax === undefined) warnings.push('No range was given for x, so the formula is drawn from -10 to 10. Give "xMin" and "xMax" to choose the part that matters.');
  }

  return errors.length > 0 ? { errors, warnings } : { spec, errors, warnings };
}
