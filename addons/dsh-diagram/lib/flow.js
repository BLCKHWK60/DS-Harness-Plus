/**
 * Flowcharts and concept maps: boxes joined by arrows, laid out in layers.
 *
 * The method is the usual one for layered drawings: break cycles, give every
 * box a layer so arrows point one way, add invisible way-points where an arrow
 * skips layers (so it goes around boxes, not through them), order each layer
 * to cut down crossings, then place boxes so they sit near what they connect to.
 * Box sizes come from their text, so a label always fits its box.
 */
import { esc, round, textBlock, textWidth, wrap } from './svg.js';

const GAP = 30; // between boxes in a layer
const WAY_GAP = 24; // between an arrow's way-point and its neighbours
const MARGIN = 24;

function sizeOf(node) {
  const lines = wrap(node.label, 170, 13, 4);
  const textW = Math.max(...lines.map((line) => textWidth(line, 13)));
  let w = Math.max(72, textW + 30);
  let h = lines.length * 18 + 22;
  if (node.shape === 'diamond') {
    w = textW * 1.45 + 44;
    h = lines.length * 18 * 1.5 + 34;
  }
  return { lines, w: Math.ceil(w), h: Math.ceil(h) };
}

/** Count crossings between two neighbouring layers, given each item's place in its layer. */
function crossings(links, place) {
  let count = 0;
  for (let i = 0; i < links.length; i += 1) {
    for (let j = i + 1; j < links.length; j += 1) {
      const a = links[i];
      const b = links[j];
      if ((place.get(a[0]) - place.get(b[0])) * (place.get(a[1]) - place.get(b[1])) < 0) count += 1;
    }
  }
  return count;
}

/**
 * @param {object} spec - checked description: `direction`, `nodes`, `edges`, `groups`.
 * @returns {{width: number, height: number, body: string, boxes: object[], labels: object[], crossings: number, outline: string}} the drawing.
 */
export function layoutFlow(spec) {
  const down = spec.direction !== 'right';
  const items = new Map(); // id -> layout item (boxes and way-points)
  for (const node of spec.nodes) items.set(node.id, { id: node.id, node, ...sizeOf(node), layer: 0, way: false, up: [], downTo: [] });

  // ---- 1. make it acyclic, 2. layers ----------------------------------------
  const out = new Map(spec.nodes.map((node) => [node.id, []]));
  const loops = [];
  const real = [];
  for (const edge of spec.edges) {
    if (edge.from === edge.to) loops.push(edge);
    else {
      real.push({ ...edge, a: edge.from, b: edge.to, flipped: false });
      out.get(edge.from).push(real[real.length - 1]);
    }
  }
  const state = new Map();
  const order = [];
  const visit = (id) => {
    state.set(id, 1);
    for (const edge of out.get(id)) {
      if (edge.flipped) continue;
      const seen = state.get(edge.to);
      if (seen === 1) {
        // An arrow back to a box we are still inside: treat it as pointing the other way while laying out.
        edge.flipped = true;
        edge.a = edge.to;
        edge.b = edge.from;
      } else if (seen === undefined) visit(edge.to);
    }
    state.set(id, 2);
    order.unshift(id);
  };
  for (const node of spec.nodes) if (!state.has(node.id)) visit(node.id);
  for (const id of order) {
    for (const edge of real) if (edge.a === id) items.get(edge.b).layer = Math.max(items.get(edge.b).layer, items.get(id).layer + 1);
  }

  // ---- 3. way-points for arrows that skip layers ------------------------------
  const layers = [];
  const put = (item) => (layers[item.layer] ??= []).push(item);
  for (const id of [...order].sort((p, q) => spec.nodes.findIndex((n) => n.id === p) - spec.nodes.findIndex((n) => n.id === q))) put(items.get(id));
  const links = []; // [upper item, lower item] between neighbouring layers
  for (const edge of real) {
    const from = items.get(edge.a);
    const to = items.get(edge.b);
    edge.chain = [from];
    for (let layer = from.layer + 1; layer < to.layer; layer += 1) {
      const way = { id: `~${edge.a}~${edge.b}~${layer}~${links.length}`, way: true, w: 2, h: 2, layer, up: [], downTo: [], group: undefined };
      items.set(way.id, way);
      put(way);
      edge.chain.push(way);
    }
    edge.chain.push(to);
    for (let i = 0; i + 1 < edge.chain.length; i += 1) {
      edge.chain[i].downTo.push(edge.chain[i + 1]);
      edge.chain[i + 1].up.push(edge.chain[i]);
      links.push([edge.chain[i], edge.chain[i + 1]]);
    }
  }
  for (let i = 0; i < layers.length; i += 1) layers[i] ??= [];

  // ---- 4. order each layer to cut down crossings ------------------------------
  const place = new Map();
  const index = () => layers.forEach((layer) => layer.forEach((item, at) => place.set(item, at)));
  const groupOf = (item) => item.node?.group ?? item.id;
  const sortLayer = (layer, neighbours) => {
    const score = new Map();
    layer.forEach((item, at) => {
      const near = neighbours(item);
      score.set(item, near.length > 0 ? near.reduce((sum, other) => sum + place.get(other), 0) / near.length : at);
    });
    // Members of one group stay next to each other.
    const groupScore = new Map();
    for (const item of layer) {
      const key = groupOf(item);
      const entry = groupScore.get(key) ?? { sum: 0, n: 0 };
      entry.sum += score.get(item);
      entry.n += 1;
      groupScore.set(key, entry);
    }
    const g = (item) => groupScore.get(groupOf(item)).sum / groupScore.get(groupOf(item)).n;
    layer.sort((p, q) => g(p) - g(q) || (groupOf(p) === groupOf(q) ? 0 : groupOf(p) < groupOf(q) ? -1 : 1) || score.get(p) - score.get(q));
    layer.forEach((item, at) => place.set(item, at));
  };
  const total = () => {
    let count = 0;
    for (let i = 0; i + 1 < layers.length; i += 1) count += crossings(links.filter((link) => link[0].layer === i), place);
    return count;
  };
  index();
  let best = { count: total(), layers: layers.map((layer) => [...layer]) };
  for (let round_ = 0; round_ < 6 && best.count > 0; round_ += 1) {
    for (let i = 1; i < layers.length; i += 1) sortLayer(layers[i], (item) => item.up);
    for (let i = layers.length - 2; i >= 0; i -= 1) sortLayer(layers[i], (item) => item.downTo);
    const count = total();
    if (count < best.count) best = { count, layers: layers.map((layer) => [...layer]) };
  }
  best.layers.forEach((layer, i) => {
    layers[i] = layer;
  });
  index();

  // ---- 5. place boxes across each layer -----------------------------------------
  const across = (item) => (down ? item.w : item.h);
  const along = (item) => (down ? item.h : item.w);
  const gap = (a, b) => (a.way || b.way ? WAY_GAP : GAP) + (groupOf(a) !== groupOf(b) && (a.node?.group || b.node?.group) ? 18 : 0);
  for (const layer of layers) {
    let at = 0;
    layer.forEach((item, i) => {
      if (i > 0) at += across(layer[i - 1]) / 2 + gap(layer[i - 1], item) + across(item) / 2;
      item.c = at;
    });
    const mid = layer.length > 0 ? (layer[0].c + layer[layer.length - 1].c) / 2 : 0;
    for (const item of layer) item.c -= mid;
  }
  const settle = (layer, neighbours) => {
    if (layer.length === 0) return;
    const want = layer.map((item) => {
      const near = neighbours(item);
      return near.length > 0 ? near.reduce((sum, other) => sum + other.c, 0) / near.length : item.c;
    });
    // Push right, then push left, and take the middle: keeps the order and the gaps.
    const right = [...want];
    for (let i = 1; i < layer.length; i += 1) right[i] = Math.max(right[i], right[i - 1] + across(layer[i - 1]) / 2 + gap(layer[i - 1], layer[i]) + across(layer[i]) / 2);
    const left = [...want];
    for (let i = layer.length - 2; i >= 0; i -= 1) left[i] = Math.min(left[i], left[i + 1] - across(layer[i + 1]) / 2 - gap(layer[i], layer[i + 1]) - across(layer[i]) / 2);
    layer.forEach((item, i) => {
      item.c = (right[i] + left[i]) / 2;
    });
  };
  for (let pass = 0; pass < 8; pass += 1) {
    if (pass % 2 === 0) for (let i = 1; i < layers.length; i += 1) settle(layers[i], (item) => item.up);
    else for (let i = layers.length - 2; i >= 0; i -= 1) settle(layers[i], (item) => item.downTo);
  }

  // A box that is not in a group must not sit inside the group's frame: move it, and
  // whatever is beyond it in its layer, out to the nearer side.
  for (const group of spec.groups) {
    const members = [...items.values()].filter((item) => item.node?.group === group.id);
    if (members.length === 0) continue;
    const lo = Math.min(...members.map((item) => item.c - across(item) / 2)) - 26;
    const hi = Math.max(...members.map((item) => item.c + across(item) / 2)) + 26;
    const first = Math.min(...members.map((item) => item.layer));
    const last = Math.max(...members.map((item) => item.layer));
    for (let i = first; i <= last; i += 1) {
      const layer = layers[i];
      layer.sort((p, q) => p.c - q.c);
      layer.forEach((item, at) => {
        if (item.node?.group === group.id) return;
        const [left, right] = [item.c - across(item) / 2, item.c + across(item) / 2];
        if (right <= lo || left >= hi) return;
        if (item.c >= (lo + hi) / 2) {
          const shift = hi - left;
          for (let k = at; k < layer.length; k += 1) if (layer[k].node?.group !== group.id) layer[k].c += shift;
        } else {
          const shift = right - lo;
          for (let k = at; k >= 0; k -= 1) if (layer[k].node?.group !== group.id) layer[k].c -= shift;
        }
      });
    }
  }

  // Whatever was moved, boxes in a layer keep their distance. This is what guarantees no overlap.
  for (const layer of layers) {
    layer.sort((p, q) => p.c - q.c);
    for (let i = 1; i < layer.length; i += 1) {
      const least = layer[i - 1].c + across(layer[i - 1]) / 2 + gap(layer[i - 1], layer[i]) + across(layer[i]) / 2;
      if (layer[i].c < least) layer[i].c = least;
    }
  }

  // ---- 6. place the layers one after another ---------------------------------------
  const labelled = real.some((edge) => edge.label);
  const layerGap = labelled ? (down ? 66 : 96) : 48;
  const hasGroups = spec.nodes.some((node) => node.group);
  let cursor = 0;
  for (const layer of layers) {
    const thick = Math.max(0, ...layer.map(along));
    for (const item of layer) {
      item.m = cursor + thick / 2;
      item.thick = thick;
    }
    cursor += thick + layerGap + (hasGroups ? 10 : 0);
  }
  const all = [...items.values()];
  const minC = Math.min(...all.map((item) => item.c - across(item) / 2));
  const pad = MARGIN + (hasGroups ? 18 : 0);
  for (const item of all) {
    const c = item.c - minC + pad;
    const m = item.m + pad + (hasGroups ? 14 : 0);
    item.x = down ? c : m;
    item.y = down ? m : c;
  }

  // ---- 7. draw --------------------------------------------------------------------
  const boxes = [];
  const labels = [];
  const parts = [];
  const nodes = all.filter((item) => !item.way);

  for (const group of spec.groups) {
    const members = nodes.filter((item) => item.node.group === group.id);
    if (members.length === 0) continue;
    const x0 = Math.min(...members.map((item) => item.x - item.w / 2)) - 14;
    const y0 = Math.min(...members.map((item) => item.y - item.h / 2)) - 26;
    const x1 = Math.max(...members.map((item) => item.x + item.w / 2)) + 14;
    const y1 = Math.max(...members.map((item) => item.y + item.h / 2)) + 14;
    const box = { kind: 'group', id: group.id, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    boxes.push(box);
    parts.push(`<rect class="group" x="${round(x0)}" y="${round(y0)}" width="${round(box.w)}" height="${round(box.h)}" rx="10"/>`);
    parts.push(`<text x="${round(x0 + 10)}" y="${round(y0 + 13)}" class="sub" font-size="11" font-weight="600" dominant-baseline="central">${esc(wrap(group.label, Math.max(60, box.w - 20), 11, 1)[0])}</text>`);
  }

  const edgeParts = [];
  const labelParts = [];
  const segments = [];
  for (const edge of real) {
    const chain = edge.flipped ? [...edge.chain].reverse() : edge.chain;
    // Each piece of the arrow is a curve across the space between two layers. A way-point
    // is passed in a straight line through its whole layer, so the arrow clears the boxes there.
    const curves = [];
    const forward = (down ? chain[1].y > chain[0].y : chain[1].x > chain[0].x) ? 1 : -1;
    for (let i = 0; i + 1 < chain.length; i += 1) {
      const [a, b] = [chain[i], chain[i + 1]];
      const half = (item) => (item.way ? item.thick / 2 : (down ? item.h : item.w) / 2);
      const start = down ? [a.x, a.y + forward * half(a)] : [a.x + forward * half(a), a.y];
      const end = down ? [b.x, b.y - forward * half(b)] : [b.x - forward * half(b), b.y];
      curves.push([start, end]);
    }
    let d = '';
    curves.forEach(([[x1, y1], [x2, y2]], i) => {
      segments.push([x1, y1, x2, y2]);
      d += `${i === 0 ? 'M' : 'L'}${round(x1)} ${round(y1)}`;
      d += down ? `C${round(x1)} ${round((y1 + y2) / 2)} ${round(x2)} ${round((y1 + y2) / 2)} ${round(x2)} ${round(y2)}` : `C${round((x1 + x2) / 2)} ${round(y1)} ${round((x1 + x2) / 2)} ${round(y2)} ${round(x2)} ${round(y2)}`;
    });
    edgeParts.push(`<path class="line" d="${d}" stroke-width="1.4"${edge.dashed ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#arrow)"/>`);
    if (edge.label) {
      // Put the label where this arrow is alone: near its end if several arrows leave the
      // same box, near its start if several arrive at the same box.
      const leaving = real.filter((other) => other.from === edge.from).length;
      const arriving = real.filter((other) => other.to === edge.to).length;
      const nearEnd = leaving > arriving;
      const [[x1, y1], [x2, y2]] = nearEnd ? curves[curves.length - 1] : curves[0];
      const t = leaving === arriving ? 0.5 : nearEnd ? 0.66 : 0.34;
      const bez = (p0, p1, p2, p3) => (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3;
      const text = wrap(edge.label, 130, 11, 2);
      const w = Math.max(...text.map((line) => textWidth(line, 11))) + 10;
      const h = text.length * 15 + 4;
      const cx = down ? bez(x1, x1, x2, x2) : bez(x1, (x1 + x2) / 2, (x1 + x2) / 2, x2);
      const cy = down ? bez(y1, (y1 + y2) / 2, (y1 + y2) / 2, y2) : bez(y1, y1, y2, y2);
      let box = null;
      for (const shift of [0, 16, -16, 32, -32, 48, -48]) {
        box = { kind: 'label', text: edge.label, x: (down ? cx + shift * 1.5 : cx) - w / 2, y: (down ? cy : cy + shift) - h / 2, w, h };
        if (!labels.some((other) => other.x < box.x + box.w && box.x < other.x + other.w && other.y < box.y + box.h && box.y < other.y + other.h)) break;
      }
      labels.push(box);
      labelParts.push(`<rect class="label-bg" x="${round(box.x)}" y="${round(box.y)}" width="${round(w)}" height="${h}" rx="3"/>${textBlock(text, box.x + w / 2, box.y + h / 2, { size: 11, cls: 'sub', lineHeight: 15 })}`);
    }
  }
  for (const edge of loops) {
    const item = items.get(edge.from);
    const x = item.x + item.w / 2;
    const y = item.y;
    edgeParts.push(`<path class="line" d="M${round(x)} ${round(y - 8)}C${round(x + 34)} ${round(y - 26)} ${round(x + 34)} ${round(y + 26)} ${round(x)} ${round(y + 8)}" stroke-width="1.4" marker-end="url(#arrow)"/>`);
    if (edge.label) {
      const w = textWidth(edge.label, 11) + 10;
      labels.push({ kind: 'label', text: edge.label, x: x + 30, y: y - 9, w, h: 18 });
      labelParts.push(textBlock([edge.label], x + 30 + w / 2, y, { size: 11, cls: 'sub' }));
    }
  }
  parts.push(...edgeParts, ...labelParts);

  for (const item of nodes) {
    const color = item.node.color;
    const x = item.x - item.w / 2;
    const y = item.y - item.h / 2;
    boxes.push({ kind: 'node', id: item.id, group: item.node.group, label: item.node.label, x, y, w: item.w, h: item.h, textWidth: Math.max(...item.lines.map((line) => textWidth(line, 13))), inner: item.node.shape === 'diamond' ? item.w / 1.45 : item.w - 12 });
    if (item.node.shape === 'diamond') parts.push(`<polygon class="c-${color}" stroke-width="1.2" points="${round(item.x)},${round(y)} ${round(x + item.w)},${round(item.y)} ${round(item.x)},${round(y + item.h)} ${round(x)},${round(item.y)}"/>`);
    else {
      const rx = item.node.shape === 'pill' ? item.h / 2 : item.node.shape === 'round' ? 14 : 6;
      parts.push(`<rect class="c-${color}" stroke-width="1.2" x="${round(x)}" y="${round(y)}" width="${item.w}" height="${item.h}" rx="${round(rx)}"${item.node.shape === 'note' ? ' stroke-dasharray="4 3"' : ''}/>`);
    }
    parts.push(textBlock(item.lines, item.x, item.y, { cls: `t-${color}`, lineHeight: 18 }));
  }

  const every = [...boxes, ...labels];
  const width = Math.max(...every.map((box) => box.x + box.w), ...loops.map((edge) => items.get(edge.from).x + items.get(edge.from).w / 2 + 40)) + MARGIN;
  const height = Math.max(...every.map((box) => box.y + box.h)) + MARGIN;

  // Crossings as drawn, counted on straight pieces.
  let crossed = 0;
  const side = (ax, ay, bx, by, cx, cy) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const [a, b] = [segments[i], segments[j]];
      const shared = (p, q) => Math.abs(p[0] - q[0]) < 0.5 && Math.abs(p[1] - q[1]) < 0.5;
      if (shared([a[0], a[1]], [b[0], b[1]]) || shared([a[2], a[3]], [b[2], b[3]]) || shared([a[0], a[1]], [b[2], b[3]]) || shared([a[2], a[3]], [b[0], b[1]])) continue;
      if (side(a[0], a[1], a[2], a[3], b[0], b[1]) * side(a[0], a[1], a[2], a[3], b[2], b[3]) < 0 && side(b[0], b[1], b[2], b[3], a[0], a[1]) * side(b[0], b[1], b[2], b[3], a[2], a[3]) < 0) crossed += 1;
    }
  }

  const name = (id) => `"${spec.nodes.find((node) => node.id === id)?.label ?? id}"`;
  const outline = [
    `Flowchart reading ${down ? 'top to bottom' : 'left to right'}: ${spec.nodes.length} boxes, ${spec.edges.length} arrows${spec.groups.length > 0 ? `, ${spec.groups.length} groups` : ''}.`,
    ...layers.map((layer, i) => `Row ${i + 1}: ${layer.filter((item) => !item.way).map((item) => name(item.id)).join(', ') || '(only arrows pass here)'}`),
    'Arrows:',
    ...spec.edges.map((edge) => `  ${name(edge.from)} → ${name(edge.to)}${edge.label ? ` [${edge.label}]` : ''}`),
    ...spec.groups.map((group) => `Group "${group.label}": ${spec.nodes.filter((node) => node.group === group.id).map((node) => name(node.id)).join(', ')}`),
  ].join('\n');

  return { width, height, body: parts.join(''), boxes, labels, crossings: crossed, outline };
}
