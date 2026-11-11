/**
 * Trees and mind maps: one root that branches out. Every branch gets the room
 * its own sub-branches need, so nothing can overlap.
 */
import { round, textBlock, textWidth, wrap } from './svg.js';

const MARGIN = 24;

/**
 * @param {object} spec - checked description: `direction` (`down` or `right`), `root` with nested `children`.
 * @returns {{width: number, height: number, body: string, boxes: object[], labels: object[], crossings: number, outline: string}} the drawing.
 */
export function layoutTree(spec) {
  const down = spec.direction === 'down';
  const sibling = down ? 18 : 12;
  const level = down ? 46 : 54;
  let count = 0;

  const measure = (node, depth) => {
    const lines = wrap(node.label, depth === 0 ? 200 : 160, 13, 3);
    const w = Math.ceil(Math.max(64, Math.max(...lines.map((line) => textWidth(line, 13))) + 26));
    const h = lines.length * 18 + 18;
    const item = { node, lines, w, h, depth, children: (node.children ?? []).map((child) => measure(child, depth + 1)), id: `n${(count += 1)}` };
    const own = down ? w : h;
    const kids = item.children.reduce((sum, child) => sum + child.span, 0) + sibling * Math.max(0, item.children.length - 1);
    item.span = Math.max(own, kids);
    item.kids = kids;
    return item;
  };
  const root = measure(spec.root, 0);

  // Thickness of each level, so that every level lines up.
  const thick = [];
  const each = (item, fn) => {
    fn(item);
    item.children.forEach((child) => each(child, fn));
  };
  each(root, (item) => {
    thick[item.depth] = Math.max(thick[item.depth] ?? 0, down ? item.h : item.w);
  });
  const start = [];
  thick.reduce((at, size, depth) => {
    start[depth] = at;
    return at + size + level;
  }, MARGIN);

  const place = (item, from) => {
    const centre = from + item.span / 2;
    const along = start[item.depth];
    if (down) {
      item.x = centre;
      item.y = along + thick[item.depth] / 2;
    } else {
      item.x = along + item.w / 2;
      item.y = centre;
    }
    let at = from + (item.span - item.kids) / 2;
    for (const child of item.children) {
      place(child, at);
      at += child.span + sibling;
    }
  };
  place(root, MARGIN);

  const parts = [];
  const boxes = [];
  const palette = ['purple', 'teal', 'coral', 'blue', 'amber', 'green'];
  // Each main branch keeps one colour, so the eye can follow it.
  const colour = (item, branch) => item.node.color ?? (item.depth === 0 ? 'gray' : palette[branch % palette.length]);
  const lines = [];
  const draw = (item, branch) => {
    item.children.forEach((child, index) => {
      const b = item.depth === 0 ? index : branch;
      if (down) {
        const y1 = item.y + item.h / 2;
        const y2 = child.y - child.h / 2;
        const mid = start[child.depth] - level / 2;
        lines.push(`<path class="line" stroke-width="1.3" d="M${round(item.x)} ${round(y1)}V${round(mid)}H${round(child.x)}V${round(y2)}"/>`);
      } else {
        const x1 = item.x + item.w / 2;
        const x2 = child.x - child.w / 2;
        const mid = start[child.depth] - level / 2;
        lines.push(`<path class="line" stroke-width="1.3" d="M${round(x1)} ${round(item.y)}H${round(mid)}V${round(child.y)}H${round(x2)}"/>`);
      }
      draw(child, b);
    });
    const c = colour(item, branch);
    const x = item.x - item.w / 2;
    const y = item.y - item.h / 2;
    boxes.push({ kind: 'node', id: item.id, x, y, w: item.w, h: item.h, textWidth: Math.max(...item.lines.map((line) => textWidth(line, 13))), inner: item.w - 12 });
    parts.push(`<rect class="c-${c}" stroke-width="1.2" x="${round(x)}" y="${round(y)}" width="${item.w}" height="${item.h}" rx="${item.depth === 0 ? round(item.h / 2) : 6}"/>${textBlock(item.lines, item.x, item.y, { cls: `t-${c}`, lineHeight: 18, bold: item.depth === 0 })}`);
  };
  draw(root, 0);

  const width = Math.max(...boxes.map((box) => box.x + box.w)) + MARGIN;
  const height = Math.max(...boxes.map((box) => box.y + box.h)) + MARGIN;
  const text = [];
  const list = (item) => {
    text.push(`${'  '.repeat(item.depth)}- ${item.node.label}`);
    item.children.forEach(list);
  };
  list(root);
  return { width, height, body: lines.join('') + parts.join(''), boxes, labels: [], crossings: 0, outline: `Tree growing ${down ? 'downwards' : 'to the right'}: ${boxes.length} boxes, ${thick.length} levels.\n${text.join('\n')}` };
}
