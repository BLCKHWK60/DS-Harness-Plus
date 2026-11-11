/**
 * Charts: bars and lines over named categories, points and lines over numbers,
 * and plots of formulas. Every value is placed from the numbers themselves, with
 * axis steps of 1, 2 or 5 times a power of ten.
 */
import { compile } from './expr.js';
import { esc, round, textBlock, textWidth, wrap } from './svg.js';

const PLOT_W = 540;
const PLOT_H = 320;
const SAMPLES = 480;

/**
 * Axis steps that are easy to read.
 * @param {number} min - smallest value to show.
 * @param {number} max - largest value to show.
 * @param {number} [about] - roughly how many steps.
 * @returns {{min: number, max: number, step: number, ticks: number[]}} the axis.
 */
export function niceAxis(min, max, about = 6) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) [min, max] = [0, 1];
  if (min === max) {
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.5 : 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / about;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * power).find((value) => value >= raw);
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks = [];
  for (let i = 0; lo + i * step <= hi + step * 1e-6; i += 1) ticks.push(Number((lo + i * step).toPrecision(12)));
  return { min: lo, max: hi, step, ticks };
}

/**
 * A number as short text: 1200 -> 1,200; 0.30000001 -> 0.3; 1e-7 stays readable.
 * @param {number} value - the number.
 * @returns {string} text.
 */
export function numberText(value) {
  if (!Number.isFinite(value)) return '–';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e9 || abs < 1e-4) return value.toExponential(2).replace(/\.?0+e/, 'e').replace('e+', 'e');
  const text = Number(value.toPrecision(6)).toString();
  const [whole, part] = text.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return part ? `${grouped}.${part}` : grouped;
}

/**
 * @param {object} spec - checked description; see `lib/spec.js`.
 * @returns {{width: number, height: number, body: string, boxes: object[], labels: object[], crossings: number, outline: string, notes: string[]}} the drawing.
 */
export function layoutChart(spec) {
  const notes = [];
  const byCategory = spec.categories.length > 0;
  const outline = [];

  // ---- the numbers ---------------------------------------------------------
  let xAxis = null;
  const curves = []; // {name, points: [[x, y] | null]} ; null breaks the line
  if (!byCategory) {
    const xs = spec.series.flatMap((series) => series.points.map((point) => point[0]));
    const from = spec.xMin ?? (xs.length > 0 ? Math.min(...xs) : -10);
    const to = spec.xMax ?? (xs.length > 0 ? Math.max(...xs) : 10);
    xAxis = niceAxis(from, to, 8);
    if (spec.xMin !== undefined) xAxis.min = Math.min(xAxis.min, spec.xMin);
    if (spec.functions.length > 0 && (spec.xMin !== undefined || spec.xMax !== undefined)) {
      // A formula is drawn exactly over the range asked for.
      xAxis.min = from;
      xAxis.max = to;
      xAxis.ticks = niceAxis(from, to, 8).ticks.filter((tick) => tick >= from - 1e-9 && tick <= to + 1e-9);
    }
    for (const fn of spec.functions) {
      const f = compile(fn.formula);
      const points = [];
      for (let i = 0; i <= SAMPLES; i += 1) {
        const x = xAxis.min + ((xAxis.max - xAxis.min) * i) / SAMPLES;
        const y = f(x);
        points.push(Number.isNaN(y) ? null : [x, y]);
      }
      curves.push({ name: fn.name || `y = ${fn.formula}`, points, f, formula: fn.formula });
    }
  }

  const values = byCategory ? spec.series.flatMap((series) => series.values) : [...spec.series.flatMap((series) => series.points.map((point) => point[1])), ...curves.flatMap((curve) => curve.points.filter(Boolean).map((point) => point[1]))];
  let finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) finite = [0, 1];
  let [low, high] = [finite[0], finite[finite.length - 1]];
  if (curves.length > 0 && spec.yMin === undefined && spec.yMax === undefined && finite.length > 40) {
    // A formula that shoots off (1/x, tan x) would flatten everything else: show the middle of its values.
    const [p2, p98] = [finite[Math.floor(finite.length * 0.02)], finite[Math.floor(finite.length * 0.98)]];
    const spread = p98 - p2;
    if (spread > 0 && (high - low) > spread * 6) {
      low = p2 - spread * 0.1;
      high = p98 + spread * 0.1;
      notes.push('The formula has values far outside the picture (it shoots up or down somewhere); the vertical range shows the main part. Give yMin and yMax to choose the range yourself.');
    }
  }
  if (spec.chart === 'bar') [low, high] = [Math.min(0, low), Math.max(0, high)];
  const yAxis = niceAxis(spec.yMin ?? low, spec.yMax ?? high, 6);
  if (spec.yMin !== undefined) yAxis.min = spec.yMin;
  if (spec.yMax !== undefined) yAxis.max = spec.yMax;
  yAxis.ticks = yAxis.ticks.filter((tick) => tick >= yAxis.min - 1e-9 && tick <= yAxis.max + 1e-9);

  // ---- room around the plot ----------------------------------------------------
  const tickTexts = yAxis.ticks.map(numberText);
  const left = 24 + (spec.yLabel ? 22 : 0) + Math.max(...tickTexts.map((text) => textWidth(text, 11))) + 10;
  const top = 18;
  const px = (x) => left + ((x - xAxis.min) / (xAxis.max - xAxis.min)) * PLOT_W;
  const py = (y) => top + PLOT_H - ((y - yAxis.min) / (yAxis.max - yAxis.min)) * PLOT_H;
  const parts = [];
  const boxes = [{ kind: 'plot', id: 'plot', x: left, y: top, w: PLOT_W, h: PLOT_H }];

  for (const [index, tick] of yAxis.ticks.entries()) {
    parts.push(`<path class="grid" stroke-width="1" d="M${round(left)} ${round(py(tick))}H${round(left + PLOT_W)}"/>`);
    parts.push(`<text x="${round(left - 8)}" y="${round(py(tick))}" class="sub" font-size="11" text-anchor="end" dominant-baseline="central">${esc(tickTexts[index])}</text>`);
  }
  if (spec.yLabel) parts.push(`<text transform="translate(${round(24)} ${round(top + PLOT_H / 2)}) rotate(-90)" class="sub" font-size="12" text-anchor="middle" dominant-baseline="central">${esc(wrap(spec.yLabel, PLOT_H, 12, 1)[0])}</text>`);
  const zeroY = yAxis.min <= 0 && yAxis.max >= 0 ? py(0) : top + PLOT_H;

  let bottom = top + PLOT_H + 8;
  const names = [];
  if (byCategory) {
    const slot = PLOT_W / spec.categories.length;
    const labelLines = spec.categories.map((category) => wrap(category, Math.max(30, slot - 6), 11, 2));
    const tall = Math.max(...labelLines.map((lines) => lines.length));
    spec.categories.forEach((category, index) => {
      parts.push(textBlock(labelLines[index], left + slot * (index + 0.5), bottom + (tall * 14) / 2 + 2, { size: 11, cls: 'sub', lineHeight: 14 }));
    });
    bottom += tall * 14 + 6;
    if (spec.chart === 'bar') {
      const group = slot * 0.72;
      const bar = group / spec.series.length;
      const showValues = spec.categories.length * spec.series.length <= 16;
      spec.series.forEach((series, s) => {
        series.values.forEach((value, index) => {
          if (!Number.isFinite(value)) return;
          const x = left + slot * index + (slot - group) / 2 + bar * s;
          const [y0, y1] = [Math.min(py(value), zeroY), Math.max(py(value), zeroY)];
          parts.push(`<rect class="f${(s % 6) + 1}" x="${round(x + 1)}" y="${round(y0)}" width="${round(Math.max(1, bar - 2))}" height="${round(Math.max(0.5, y1 - y0))}" rx="2"/>`);
          if (showValues) parts.push(`<text x="${round(x + bar / 2)}" y="${round(value >= 0 ? y0 - 7 : y1 + 9)}" class="ink" font-size="10" text-anchor="middle" dominant-baseline="central">${esc(numberText(value))}</text>`);
        });
      });
    } else {
      spec.series.forEach((series, s) => {
        let d = '';
        let pen = false;
        series.values.forEach((value, index) => {
          if (!Number.isFinite(value)) {
            pen = false;
            return;
          }
          const [x, y] = [left + slot * (index + 0.5), py(value)];
          d += `${pen ? 'L' : 'M'}${round(x)} ${round(y)}`;
          pen = true;
          parts.push(`<circle class="f${(s % 6) + 1}" cx="${round(x)}" cy="${round(y)}" r="3"/>`);
        });
        parts.unshift(`<path class="s${(s % 6) + 1}" stroke-width="2" stroke-linejoin="round" d="${d}"/>`);
      });
    }
    spec.series.forEach((series) => names.push(series.name));
    outline.push(`${spec.chart === 'bar' ? 'Bar' : 'Line'} chart over ${spec.categories.length} categories; vertical axis from ${numberText(yAxis.min)} to ${numberText(yAxis.max)} in steps of ${numberText(yAxis.step)}.`);
    for (const series of spec.series) outline.push(`${series.name || 'Values'}: ${spec.categories.map((category, index) => `${category} = ${numberText(series.values[index])}`).join(', ')}`);
  } else {
    for (const tick of xAxis.ticks) {
      parts.push(`<path class="grid" stroke-width="1" d="M${round(px(tick))} ${round(top)}V${round(top + PLOT_H)}"/>`);
      parts.push(`<text x="${round(px(tick))}" y="${round(bottom + 7)}" class="sub" font-size="11" text-anchor="middle" dominant-baseline="central">${esc(numberText(tick))}</text>`);
    }
    bottom += 18;
    if (xAxis.min <= 0 && xAxis.max >= 0) parts.push(`<path class="line" stroke-width="1.2" d="M${round(px(0))} ${round(top)}V${round(top + PLOT_H)}"/>`);
    const clip = `clip${Math.round(left)}`;
    parts.push(`<clipPath id="${clip}"><rect x="${round(left)}" y="${round(top)}" width="${PLOT_W}" height="${PLOT_H}"/></clipPath>`);
    const drawn = [];
    let color = 0;
    const jump = (yAxis.max - yAxis.min) * 1.5;
    for (const curve of curves) {
      let d = '';
      let last = null;
      for (const point of curve.points) {
        // Lift the pen where the formula has no value or leaps across the picture (an asymptote).
        if (!point || (last && Math.abs(point[1] - last[1]) > jump)) {
          last = point;
          if (point) d += `M${round(px(point[0]))} ${round(py(Math.max(yAxis.min - jump, Math.min(yAxis.max + jump, point[1]))))}`;
          continue;
        }
        const y = py(Math.max(yAxis.min - jump, Math.min(yAxis.max + jump, point[1])));
        d += `${last ? 'L' : 'M'}${round(px(point[0]))} ${round(y)}`;
        last = point;
      }
      drawn.push(`<path class="s${(color % 6) + 1}" stroke-width="2" stroke-linejoin="round" d="${d}"/>`);
      names.push(curve.name);
      color += 1;
      const at = xAxis.ticks.map((x) => `(${numberText(x)}, ${numberText(Number(curve.f(x).toPrecision(5)))})`);
      outline.push(`Curve ${curve.name} for x from ${numberText(xAxis.min)} to ${numberText(xAxis.max)}. Points on it: ${at.join(' ')}`);
    }
    for (const series of spec.series) {
      const points = [...series.points].sort((a, b) => a[0] - b[0]);
      if (spec.chart === 'line') drawn.push(`<path class="s${(color % 6) + 1}" stroke-width="2" stroke-linejoin="round" d="${points.map((point, index) => `${index === 0 ? 'M' : 'L'}${round(px(point[0]))} ${round(py(point[1]))}`).join('')}"/>`);
      drawn.push(points.map((point) => `<circle class="f${(color % 6) + 1}" cx="${round(px(point[0]))}" cy="${round(py(point[1]))}" r="${spec.chart === 'line' ? 3 : 4}"/>`).join(''));
      names.push(series.name);
      color += 1;
      outline.push(`${series.name || 'Points'} (${points.length}): ${points.slice(0, 24).map((point) => `(${numberText(point[0])}, ${numberText(point[1])})`).join(' ')}${points.length > 24 ? ' …' : ''}`);
    }
    parts.push(`<g clip-path="url(#${clip})">${drawn.join('')}</g>`);
    outline.unshift(`${spec.functions.length > 0 ? 'Plot' : spec.chart === 'line' ? 'Line chart' : 'Scatter chart'}; horizontal axis from ${numberText(xAxis.min)} to ${numberText(xAxis.max)}, vertical axis from ${numberText(yAxis.min)} to ${numberText(yAxis.max)}.`);
  }
  parts.push(`<path class="line" stroke-width="1.2" d="M${round(left)} ${round(zeroY)}H${round(left + PLOT_W)}"/>`);
  parts.push(`<path class="line" stroke-width="1" d="M${round(left)} ${round(top)}V${round(top + PLOT_H)}"/>`);
  if (spec.xLabel) {
    parts.push(`<text x="${round(left + PLOT_W / 2)}" y="${round(bottom + 10)}" class="sub" font-size="12" text-anchor="middle" dominant-baseline="central">${esc(wrap(spec.xLabel, PLOT_W, 12, 1)[0])}</text>`);
    bottom += 24;
  }

  // ---- the key ---------------------------------------------------------------------
  const shown = names.map((name, index) => ({ name, index })).filter((item) => item.name);
  if (shown.length > 1 || (shown.length === 1 && (curves.length > 0 || spec.series[0]?.name))) {
    let x = left;
    let y = bottom + 12;
    for (const item of shown) {
      const label = wrap(item.name, 220, 12, 1)[0];
      const w = 22 + textWidth(label, 12) + 18;
      if (x + w > left + PLOT_W && x > left) {
        x = left;
        y += 20;
      }
      parts.push(`<rect class="f${(item.index % 6) + 1}" x="${round(x)}" y="${round(y - 5)}" width="12" height="10" rx="2"/><text x="${round(x + 18)}" y="${round(y)}" class="ink" font-size="12" dominant-baseline="central">${esc(label)}</text>`);
      boxes.push({ kind: 'key', id: `key${item.index}`, x, y: y - 8, w: w - 18, h: 16 });
      x += w;
    }
    bottom = y + 14;
  }
  return { width: left + PLOT_W + 26, height: bottom + 12, body: parts.join(''), boxes, labels: [], crossings: 0, outline: outline.join('\n'), notes };
}
