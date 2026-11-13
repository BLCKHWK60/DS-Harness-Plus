/**
 * Charts from a query's result. The picture is drawn from the result's own rows, so the model
 * never copies numbers by hand. The drawing itself is done by the Diagrams add-on.
 */

const DATE = /^\d{4}-\d{1,2}(-\d{1,2})?([T ].*)?$/;
export const CATEGORIES_MAX = 30;
export const SERIES_MAX = 6;

/**
 * The description of a chart, in the form the Diagrams add-on draws.
 * @param {{columns: string[], rows: any[][]}} result - a query's result.
 * @param {object} wish - what to draw.
 * @param {string} [wish.chart] - bar, line or scatter; chosen from the data when left out.
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
  if (dated || (numbers && wish.chart !== 'bar')) {
    return {
      ...base,
      chart: wish.chart === 'scatter' ? 'scatter' : dated ? 'line' : wish.chart === 'line' ? 'line' : 'scatter',
      series: ys.map((index) => ({ name: columns[index], points: rows.filter((row) => filled(row, index)).map((row) => [dated ? String(row[xi]).trim().slice(0, 10) : row[xi], row[index]]) })),
    };
  }
  if (rows.length > CATEGORIES_MAX) throw new Error(`The result has ${rows.length} rows; a chart over names takes at most ${CATEGORIES_MAX}. Group or limit in the query (for example the top 15), or use a date or number column for the bottom axis.`);
  return {
    ...base,
    chart: wish.chart === 'line' ? 'line' : 'bar',
    categories: xs.map((value) => (value === null || value === '' ? '(empty)' : String(value).slice(0, 60))),
    series: ys.map((index) => ({ name: columns[index], values: rows.map((row) => (filled(row, index) ? row[index] : 0)) })),
  };
}
