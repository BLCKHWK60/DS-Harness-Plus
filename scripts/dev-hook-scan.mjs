/**
 * Release check: finds a React hook that is called after an early return in a settings page or
 * other component of an add-on's client.js. React then sees a different number of hooks from one
 * draw to the next and takes the whole page down (the blank Data settings page of 0.33.0).
 * Usage: node scripts/dev-hook-scan.mjs <client.js files>. Prints one line per finding and
 * exits with 1 when there is any.
 */
import { readFileSync } from 'node:fs';

for (const file of process.argv.slice(2)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let fn = null, indent = 0, returned = false;
  lines.forEach((line, i) => {
    const m = line.match(/^(\s*)(?:async )?function ([A-Z]\w*)\(/);
    if (m) { fn = m[2]; indent = m[1].length; returned = false; return; }
    if (!fn) return;
    if (line.startsWith(' '.repeat(indent) + '}') && line.trim() === '}') { fn = null; return; }
    const body = ' '.repeat(indent + 2);
    if (!line.startsWith(body) || line[body.length] === ' ') return; // only the component's own top level
    const rest = line.slice(body.length);
    if (/^if \(.*\) return\b/.test(rest) || (/^if \(.*\) \{\s*$/.test(rest) && /^\s*return\b/.test(lines[i + 1] ?? ''))) returned = true;
    if (returned && /^(const .*= )?(React\.)?use[A-Z]\w*\(/.test(rest)) { console.log(`${file}:${i + 1} ${fn}: ${rest.slice(0, 80)}`); process.exitCode = 1; }
  });
}
