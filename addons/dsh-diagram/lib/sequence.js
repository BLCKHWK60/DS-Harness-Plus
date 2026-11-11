/**
 * Sequences (who tells whom what, in order) and timelines (events in order).
 * Both are drawn row by row, so nothing can overlap.
 */
import { round, textBlock, textWidth, wrap } from './svg.js';

const MARGIN = 24;

/**
 * @param {object} spec - checked description: `actors` and `steps` (messages and notes).
 * @returns {{width: number, height: number, body: string, boxes: object[], labels: object[], crossings: number, outline: string}} the drawing.
 */
export function layoutSequence(spec) {
  const actors = spec.actors.map((actor) => {
    const lines = wrap(actor.label, 130, 13, 2);
    return { ...actor, lines, w: Math.ceil(Math.max(80, Math.max(...lines.map((line) => textWidth(line, 13))) + 26)), h: lines.length * 18 + 16 };
  });
  const at = new Map(actors.map((actor, index) => [actor.id, index]));
  const headH = Math.max(...actors.map((actor) => actor.h));

  // The space between two neighbours must hold the widest label that runs between them.
  const gaps = actors.slice(1).map((actor, index) => (actors[index].w + actor.w) / 2 + 40);
  const steps = spec.steps.map((step) => {
    if (step.note !== undefined) return { ...step, lines: wrap(step.note, 220, 12, 4) };
    const lines = wrap(step.label ?? '', 200, 12, 3);
    const w = Math.max(0, ...lines.map((line) => textWidth(line, 12))) + 28;
    const [i, j] = [at.get(step.from), at.get(step.to)].sort((p, q) => p - q);
    if (i !== j) {
      const share = w / (j - i);
      for (let k = i; k < j; k += 1) gaps[k] = Math.max(gaps[k], share);
    }
    return { ...step, lines, w };
  });
  const xs = [MARGIN + actors[0].w / 2];
  gaps.forEach((gap, index) => xs.push(xs[index] + Math.ceil(gap)));

  const parts = [];
  const boxes = [];
  const labels = [];
  let y = MARGIN + headH + 22;
  const rows = [];
  for (const step of steps) {
    if (step.note !== undefined) {
      const over = (step.over ?? []).map((id) => at.get(id)).filter((index) => index !== undefined);
      const [i, j] = over.length > 0 ? [Math.min(...over), Math.max(...over)] : [0, actors.length - 1];
      const textW = Math.max(...step.lines.map((line) => textWidth(line, 12))) + 20;
      const w = Math.max(textW, xs[j] - xs[i] + 40);
      const h = step.lines.length * 16 + 12;
      const x = (xs[i] + xs[j]) / 2 - w / 2;
      rows.push(`<rect class="c-amber" stroke-width="1" x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${h}" rx="4"/>${textBlock(step.lines, x + w / 2, y + h / 2, { size: 12, cls: 't-amber', lineHeight: 16 })}`);
      boxes.push({ kind: 'note', id: `note${rows.length}`, x, y, w, h, textWidth: textW - 20, inner: w - 12 });
      y += h + 16;
      continue;
    }
    const [x1, x2] = [xs[at.get(step.from)], xs[at.get(step.to)]];
    const textH = step.lines.length * 15;
    const dash = step.reply ? ' stroke-dasharray="6 4"' : '';
    if (x1 === x2) {
      // A step someone does alone: a small loop back to their own line.
      const top = y + (step.label ? textH + 2 : 0);
      if (step.label) rows.push(textBlock(step.lines, x1 + 12, y + textH / 2, { size: 12, cls: 'sub', anchor: 'start', lineHeight: 15 }));
      rows.push(`<path class="line" stroke-width="1.3"${dash} d="M${round(x1)} ${round(top + 4)}H${round(x1 + 34)}V${round(top + 22)}H${round(x1 + 2)}" marker-end="url(#arrow)"/>`);
      labels.push({ kind: 'label', text: step.label ?? '', x: x1 + 12, y, w: step.w, h: textH });
      y = top + 22 + 18;
    } else {
      const line = y + (step.label ? textH + 6 : 6);
      if (step.label) {
        rows.push(textBlock(step.lines, (x1 + x2) / 2, y + textH / 2, { size: 12, cls: 'sub', lineHeight: 15 }));
        labels.push({ kind: 'label', text: step.label, x: (x1 + x2) / 2 - step.w / 2 + 14, y, w: step.w - 28, h: textH });
      }
      rows.push(`<path class="line" stroke-width="1.3"${dash} d="M${round(x1)} ${round(line)}H${round(x2 + (x2 > x1 ? -2 : 2))}" marker-end="url(#arrow)"/>`);
      y = line + 20;
    }
  }
  const bottom = y + 4;
  actors.forEach((actor, index) => {
    const x = xs[index];
    parts.push(`<path class="line" stroke-width="1" stroke-dasharray="3 4" d="M${round(x)} ${MARGIN + headH}V${round(bottom)}"/>`);
    const color = actor.color ?? 'blue';
    parts.push(`<rect class="c-${color}" stroke-width="1.2" x="${round(x - actor.w / 2)}" y="${MARGIN + (headH - actor.h) / 2}" width="${actor.w}" height="${actor.h}" rx="6"/>${textBlock(actor.lines, x, MARGIN + headH / 2, { cls: `t-${color}`, lineHeight: 18 })}`);
    boxes.push({ kind: 'node', id: actor.id, x: x - actor.w / 2, y: MARGIN + (headH - actor.h) / 2, w: actor.w, h: actor.h, textWidth: Math.max(...actor.lines.map((line) => textWidth(line, 13))), inner: actor.w - 12 });
  });
  const every = [...boxes, ...labels];
  const width = Math.max(xs[xs.length - 1] + actors[actors.length - 1].w / 2, ...every.map((box) => box.x + box.w), ...steps.filter((step) => step.note === undefined && step.from === step.to).map((step) => xs[at.get(step.from)] + 44)) + MARGIN;
  const name = (id) => actors[at.get(id)].label;
  const outline = [
    `Sequence with ${actors.length} parties (${actors.map((actor) => actor.label).join(', ')}) and ${steps.length} steps, read top to bottom:`,
    ...steps.map((step, index) => (step.note !== undefined ? `${index + 1}. Note: ${step.note}` : `${index + 1}. ${name(step.from)} → ${name(step.to)}${step.reply ? ' (reply)' : ''}${step.label ? `: ${step.label}` : ''}`)),
  ].join('\n');
  return { width, height: bottom + MARGIN, body: parts.join('') + rows.join(''), boxes, labels, crossings: 0, outline };
}

/**
 * @param {object} spec - checked description: `events`, each with `when`, `title` and optional `text`.
 * @returns {{width: number, height: number, body: string, boxes: object[], labels: object[], crossings: number, outline: string}} the drawing.
 */
export function layoutTimeline(spec) {
  const whenW = Math.min(150, Math.max(50, ...spec.events.map((event) => textWidth(event.when, 12, true)))) + 8;
  const lineX = MARGIN + whenW + 18;
  const textX = lineX + 20;
  const textW = 380;
  const parts = [];
  const boxes = [];
  let y = MARGIN + 6;
  const dots = [];
  const palette = ['purple', 'teal', 'coral', 'blue', 'amber', 'green'];
  spec.events.forEach((event, index) => {
    const when = wrap(event.when, whenW, 12, 2);
    const title = wrap(event.title, textW, 13, 2);
    const body = event.text ? wrap(event.text, textW, 12, 4) : [];
    const h = Math.max(when.length * 16, title.length * 18 + (body.length > 0 ? body.length * 16 + 4 : 0));
    const color = event.color ?? palette[index % palette.length];
    parts.push(textBlock(when, lineX - 18, y + (when.length * 16) / 2, { size: 12, cls: 'sub', anchor: 'end', bold: true, lineHeight: 16 }));
    parts.push(textBlock(title, textX, y + (title.length * 18) / 2, { size: 13, anchor: 'start', bold: true, lineHeight: 18 }));
    if (body.length > 0) parts.push(textBlock(body, textX, y + title.length * 18 + 4 + (body.length * 16) / 2, { size: 12, cls: 'sub', anchor: 'start', lineHeight: 16 }));
    dots.push({ y: y + 9, color });
    const own = Math.max(...title.map((line) => textWidth(line, 13, true)), ...body.map((line) => textWidth(line, 12)));
    boxes.push({ kind: 'event', id: `e${index + 1}`, x: textX, y, w: own, h, textWidth: own, inner: textW });
    y += h + 22;
  });
  const first = dots[0].y;
  const last = dots[dots.length - 1].y;
  const rail = `<path class="line" stroke-width="2" d="M${lineX} ${round(first)}V${round(last)}"/>${dots.map((dot) => `<circle class="c-${dot.color}" stroke-width="2" cx="${lineX}" cy="${round(dot.y)}" r="6"/>`).join('')}`;
  const used = Math.max(...boxes.map((box) => box.textWidth));
  return {
    width: textX + Math.max(200, used) + MARGIN,
    height: y - 22 + MARGIN,
    body: rail + parts.join(''),
    boxes,
    labels: [],
    crossings: 0,
    outline: [`Timeline with ${spec.events.length} events, earliest at the top:`, ...spec.events.map((event) => `- ${event.when}: ${event.title}${event.text ? ` (${event.text})` : ''}`)].join('\n'),
  };
}
