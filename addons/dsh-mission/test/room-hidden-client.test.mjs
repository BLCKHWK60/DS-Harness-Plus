// Stage 7 (lab, 6a decision): Settings → Mission → "Add a project" never offers Recon's room.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const line = source.split('\n').find((text) => text.includes('const RECON_ROOM_PATH = '));
const ROOM = new Function(`${line.trim()}\nreturn RECON_ROOM_PATH;`)();

test('add-project-no-recon-room: the room\'s paths are left out, other folders stay', () => {
  for (const path of ['/tmp/dsh-recon-room', '/private/tmp/dsh-recon-room/', '/private/tmp/dsh-recon-lab-16', '/var/folders/ab/cd1234/T/dsh-recon-x']) assert.equal(ROOM.test(path), true, path);
  for (const path of ['/Users/me/code', '/tmp/dsh-recon-room/inner', '/Users/me/dsh-recon-room', '/tmp/other']) assert.equal(ROOM.test(path), false, path);
  assert.match(source, /item\.path && !RECON_ROOM_PATH\.test\(item\.path\)/, 'the project list is filtered with it');
});
