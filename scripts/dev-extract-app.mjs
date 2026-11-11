// Extracts text files (js/json/md/yml/css) from an asar into a folder. Read-only on the asar.
import fs from 'node:fs'; import path from 'node:path';
const [asar, out] = process.argv.slice(2);
const fd = fs.openSync(asar, 'r');
const head = Buffer.alloc(16); fs.readSync(fd, head, 0, 16, 0);
const headerSize = head.readUInt32LE(4); const jsonLen = head.readUInt32LE(12);
const json = Buffer.alloc(jsonLen); fs.readSync(fd, json, 0, jsonLen, 16);
const base = 8 + headerSize; const tree = JSON.parse(json.toString('utf8'));
let n = 0;
(function walk(node, rel) {
  for (const [name, e] of Object.entries(node.files ?? {})) {
    const p = path.join(rel, name);
    if (e.files) walk(e, p);
    else if (!e.unpacked && e.offset !== undefined && /\.(m?js|cjs|json|md|ya?ml|css)$/.test(name) && e.size < 8e6) {
      const buf = Buffer.alloc(e.size); fs.readSync(fd, buf, 0, e.size, base + Number(e.offset));
      const dest = path.join(out, p); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, buf); n++;
    }
  }
})(tree, '');
console.log('files', n);
