/**
 * Charts from a query's result. The picture is drawn from the result's own rows, so the model
 * never copies numbers by hand. The drawing itself is done by the Diagrams add-on; in a Data
 * conversation each chart is also saved as an SVG file in the conversation's output folder.
 */
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';

const DATE = /^\d{4}-\d{1,2}(-\d{1,2})?([T ].*)?$/;
/** A date with no time, or with midnight as its time (`2026-03-31 00:00:00`, `2026-03-31T00:00:00Z`): the date alone names it. */
const DAY = /^\d{4}-\d{1,2}(-\d{1,2})?([T ]00:00(:00(\.0+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
export const CATEGORIES_MAX = 30;
export const SERIES_MAX = 6;
/** The kinds data_chart draws. Pie, area and other charts are drawn with Python. */
export const CHART_KINDS = ['bar', 'line', 'scatter'];

/**
 * The description of a chart, in the form the Diagrams add-on draws.
 * @param {{columns: string[], rows: any[][]}} result - a query's result.
 * @param {object} wish - what to draw.
 * @param {string} [wish.chart] - bar, line or scatter; chosen from the data when left out. Bar is kept
 *   over dates too: each date is then one bar, labelled with the date.
 * @param {string} [wish.x] - the column along the bottom; the first column when left out.
 * @param {string[]} [wish.y] - the number columns to draw; every other number column when left out.
 * @param {string} [wish.title] - the chart's title.
 * @param {string} [wish.xLabel] - words under the bottom axis.
 * @param {string} [wish.yLabel] - words beside the upright axis.
 * @returns {object} the description.
 */
export function chartSpec(result, wish = {}) {
  const columns = result?.columns ?? [];
  const rows = result?.rows ?? [];
  if (columns.length < 2) throw new Error('A chart needs a result with at least two columns: one for the bottom axis and one with numbers.');
  if (rows.length === 0) throw new Error('The query returned no rows, so there is nothing to draw.');
  const at = (name) => {
    const index = columns.findIndex((column) => column.toLowerCase() === String(name).trim().toLowerCase());
    if (index < 0) throw new Error(`The result has no column "${name}". Its columns are: ${columns.join(', ')}.`);
    return index;
  };
  const xi = wish.x ? at(wish.x) : 0;
  const numeric = (index) => rows.some((row) => typeof row[index] === 'number') && rows.every((row) => row[index] === null || row[index] === '' || typeof row[index] === 'number');
  let ys = Array.isArray(wish.y) && wish.y.length > 0 ? wish.y.map(at) : columns.map((_, index) => index).filter((index) => index !== xi && numeric(index));
  if (ys.length === 0) throw new Error('None of the other columns holds numbers. Name the number columns in "y", or convert them in the query.');
  for (const index of ys) if (!numeric(index)) throw new Error(`The column "${columns[index]}" does not hold numbers only. Convert it in the query (CAST(... AS REAL)).`);
  ys = ys.slice(0, SERIES_MAX);
  const xs = rows.map((row) => row[xi]);
  const dated = xs.every((value) => typeof value === 'string' && DATE.test(value.trim()));
  const numbers = !dated && xs.every((value) => typeof value === 'number');
  const base = { kind: 'chart', title: String(wish.title ?? '').slice(0, 120), xLabel: String(wish.xLabel ?? (dated ? '' : columns[xi])).slice(0, 80), yLabel: String(wish.yLabel ?? (ys.length === 1 ? columns[ys[0]] : '')).slice(0, 80) };
  const filled = (row, index) => typeof row[index] === 'number';
  // Dates and numbers along the bottom give a line or points, unless bars were asked for: then each
  // value is one bar with its own label, like a name (monthly figures as bars, for instance).
  if ((dated || numbers) && wish.chart !== 'bar') {
    return {
      ...base,
      chart: wish.chart === 'scatter' ? 'scatter' : dated ? 'line' : wish.chart === 'line' ? 'line' : 'scatter',
      series: ys.map((index) => ({ name: columns[index], points: rows.filter((row) => filled(row, index)).map((row) => [dated ? String(row[xi]).trim().slice(0, 10) : row[xi], row[index]]) })),
    };
  }
  if (rows.length > CATEGORIES_MAX) {
    if (dated) throw new Error(`The result has ${rows.length} rows; a bar chart takes at most ${CATEGORIES_MAX} bars. Group by a longer period in the query (months instead of days, for example), or leave out "chart" to get a line.`);
    if (numbers) throw new Error(`The result has ${rows.length} rows; a bar chart takes at most ${CATEGORIES_MAX} bars. Group the values in the query, or leave out "chart" to get points.`);
    throw new Error(`The result has ${rows.length} rows; a chart over names takes at most ${CATEGORIES_MAX}. Group or limit in the query (for example the top 15), or use a date or number column for the bottom axis.`);
  }
  // Bars over dates whose times are all midnight (or missing) are labelled with the date alone.
  const days = dated && xs.every((value) => DAY.test(value.trim()));
  const label = (value) => (days ? String(value).trim().split(/[T ]/)[0] : String(value).trim().slice(0, 60));
  return {
    ...base,
    chart: wish.chart === 'line' ? 'line' : 'bar',
    categories: xs.map((value) => (value === null || value === '' ? '(empty)' : label(value))),
    series: ys.map((index) => ({ name: columns[index], values: rows.map((row) => (filled(row, index) ? row[index] : 0)) })),
  };
}

/**
 * The file name of a chart, without its ending: its title and the id of its query, for example
 * `revenue-by-region-q7`.
 * @param {unknown} title - the chart's title.
 * @param {unknown} id - the query id.
 * @returns {string} the name, letters, digits and dashes only.
 */
export function chartName(title, id) {
  const words = String(title ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48).replace(/^-+|-+$/g, '');
  const tag = String(id ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return [words || 'chart', tag].filter(Boolean).join('-');
}

/**
 * Save a chart as an SVG file in the output folder inside the conversation's folder. A file that is
 * already there is never replaced: the new one gets a number (`-2`, `-3`, …).
 * @param {string} base - the conversation's folder, as a real path.
 * @param {string} folder - the output folder's name inside it.
 * @param {string} name - from `chartName`.
 * @param {string} svg - the picture.
 * @returns {string} the saved file's path.
 */
export function saveChart(base, folder, name, svg) {
  const root = realpathSync(base);
  const wanted = join(root, folder);
  mkdirSync(wanted, { recursive: true });
  // A link that leads out of the conversation's folder is not followed.
  const dir = realpathSync(wanted);
  if (dir !== root && !dir.startsWith(root + sep)) throw new Error(`${folder} leads outside this thread's folder`);
  for (let n = 1; n <= 200; n += 1) {
    const path = join(dir, `${name}${n === 1 ? '' : `-${n}`}.svg`);
    try {
      // `wx`: only a new file; an existing file or link of that name is left alone.
      writeFileSync(path, svg, { flag: 'wx' });
      return path;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  throw new Error(`there are too many charts called ${name} in ${folder}`);
}
