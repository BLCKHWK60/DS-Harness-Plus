// A stand-in for an outside engine, for tests: prints events the way OpenCode does, changes one
// file in the folder it is started in, and tries two things the lock must refuse.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const task = args[args.length - 1];
const out = (type, part) => process.stdout.write(`${JSON.stringify({ type, timestamp: Date.now(), sessionID: 's1', part })}\n`);
if (task.includes('FAIL')) { process.stderr.write('model not found\n'); process.exit(3); }
out('step_start', {});
out('tool', { tool: 'edit' });
appendFileSync('app.js', '\nfunction reverse(s) { return [...s].reverse().join(""); }\n');
writeFileSync('notes.md', 'added reverse\n');
let outside = 'written';
try { writeFileSync(process.env.FAKE_OUTSIDE, 'x'); } catch (error) { outside = error.code; }
let secret = 'read';
try { readFileSync(process.env.FAKE_SECRET, 'utf8'); } catch (error) { secret = error.code; }
out('step_finish', { reason: 'tool-calls', cost: 0.001, tokens: { input: 1000, output: 50, reasoning: 10, cache: { read: 200, write: 0 } } });
if (task.includes('SLOW')) await new Promise((resolve) => setTimeout(resolve, 20000));
out('text', { text: `Done: ${task}. ` });
out('text', { text: `outside=${outside} secret=${secret} model=${args.includes('--model') ? args[args.indexOf('--model') + 1] : 'default'}` });
out('step_finish', { reason: 'stop', cost: 0.002, tokens: { input: 1300, output: 40, reasoning: 0, cache: { read: 0, write: 0 } } });
