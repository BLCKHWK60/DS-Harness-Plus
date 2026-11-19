import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanPage, findProblems, scanRepo } from './check-css-classes.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const page = (css, jsx = '') => scanPage(`const CSS = \`${css}\`;\n${jsx}`);

test('a class created by two add-ons is reported', () => {
  const pages = { a: page('.dsh-aa-x { color: red; }', "h('div', { className: 'dsh-aa-x' })"), b: page('.dsh-aa-x { color: blue; }', "h('div', { className: 'dsh-aa-x' })") };
  const problems = findProblems(pages, {});
  assert.ok(problems.some((line) => line.includes('"dsh-aa-x" is created by a and b')));
  assert.ok(problems.some((line) => line.includes('prefix "dsh-aa-"')));
});

test('an allowlisted shared class is accepted', () => {
  const pages = { a: page('', "h('div', { className: 'dsh-opt-pick' })"), b: page('', "h('div', { className: 'dsh-opt-pick' })") };
  assert.deepEqual(findProblems(pages, { sharedClasses: ['dsh-opt-*'] }), []);
});

test('a bare class rule would reach other pages', () => {
  const pages = { a: page('.title { font-size: 20px; }\n.dsh-aa-box .title { margin: 0; }\nhtml[data-x] .row { gap: 2px; }') };
  const problems = findProblems(pages, {});
  assert.equal(problems.length, 1);
  assert.match(problems[0], /\.title/);
});

test('a rule that restyles a shared part is reported, using one is fine', () => {
  const pages = { a: page('.dsh-aa-box .dshu-btn { height: 30px; }', "h('button', { className: 'dshu-btn' })") };
  const problems = findProblems(pages, {});
  assert.equal(problems.length, 1);
  assert.match(problems[0], /shared part/);
});

test('the shared blocks are not scanned as the add-on\'s own CSS', () => {
  const text = "// ---- dsh-ui:begin ----\nconst CSS = `.dshu-btn { height: 28px; }`;\n// ---- dsh-ui:end ----\nconst X = 1;";
  assert.deepEqual(scanPage(text).selectors, []);
});

test('this repository has no clashing page CSS', () => {
  const { pages, allow } = scanRepo(join(dirname(fileURLToPath(import.meta.url)), '..'));
  assert.deepEqual(findProblems(pages, allow), []);
});
