/**
 * Checks that decide whether a test run passed. All of them are deterministic
 * except `judge`, which the caller runs with a model and passes in as a result.
 *
 * A check never throws: something it cannot decide is NOT_EVALUATED, and
 * NOT_EVALUATED never counts as a pass.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const CHECK_TYPES = ['contains', 'notContains', 'noneOf', 'equals', 'regex', 'json', 'wordCount', 'lineCount', 'fileExists', 'fileContains', 'judge'];

/** What each check type means, for the page. */
export const CHECK_HELP = {
  contains: 'The answer contains this text (upper and lower case count as the same).',
  notContains: 'The answer does not contain this text.',
  noneOf: 'The answer contains none of these words or marks. Separate them with a vertical bar, like delve | tapestry | **.',
  equals: 'The answer is exactly this text, ignoring spaces at the ends.',
  regex: 'The answer matches this pattern (a regular expression).',
  json: 'The answer is valid JSON. Optionally list keys it must have, separated by commas.',
  wordCount: 'The answer has this many words: one number like 10, or a range like 150-220.',
  lineCount: 'The answer has this many lines, not counting empty ones: one number like 12, or a range like 8-40.',
  fileExists: 'A file exists at this path in the task folder (tasks that use tools only).',
  fileContains: 'A file in the task folder contains this text. Write it as path :: text (tasks that use tools only).',
  judge: 'A judge model scores the answer against this description, 1 to 5; 4 or more passes.',
};

const MAX_FILE_BYTES = 2_000_000;

/**
 * Normalize one stored check.
 * @param {unknown} raw - stored check.
 * @returns {{type: string, value: string} | undefined} check, or undefined when unusable.
 */
export function normalizeCheck(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const type = CHECK_TYPES.includes(raw.type) ? raw.type : undefined;
  const value = typeof raw.value === 'string' ? raw.value.slice(0, 4000) : '';
  if (!type) return undefined;
  if (type !== 'json' && value.trim() === '') return undefined;
  if ((type === 'wordCount' || type === 'lineCount') && !rangeOf(value)) return undefined;
  if (type === 'noneOf' && phrasesOf(value).length === 0) return undefined;
  if (type === 'regex') {
    try {
      new RegExp(value);
    } catch {
      return undefined;
    }
  }
  return { type, value };
}

/**
 * Resolve a path inside a folder, refusing anything that leaves it.
 * @param {string} root - absolute folder.
 * @param {string} path - path written in a check.
 * @returns {string | undefined} absolute path inside the folder.
 */
export function insideFolder(root, path) {
  if (!root || typeof path !== 'string' || path.trim() === '' || isAbsolute(path) || path.includes('\0')) return undefined;
  const full = resolve(root, path);
  const rel = relative(resolve(root), full);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel) || rel.split(sep).includes('..')) return undefined;
  return full;
}

/**
 * Pull the first JSON value out of an answer that may wrap it in a code fence.
 * @param {string} text - answer text.
 * @returns {unknown} parsed value, or undefined.
 */
export function extractJson(text) {
  const source = String(text ?? '').trim();
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], source, source.match(/[\[{][\s\S]*[\]}]/)?.[0]].filter((item) => typeof item === 'string');
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next shape.
    }
  }
  return undefined;
}

/**
 * Run one check.
 * @param {{type: string, value: string}} check - the check.
 * @param {{answer: string, folder?: string, judge?: {status: string, detail: string}}} run - what the run produced.
 * @returns {{status: 'PASS' | 'FAIL' | 'NOT_EVALUATED', detail: string}} outcome.
 */
export function runCheck(check, run) {
  const answer = String(run.answer ?? '');
  const lower = answer.toLowerCase();
  const value = check.value;
  try {
    switch (check.type) {
      case 'contains':
        return lower.includes(value.toLowerCase()) ? ok() : fail(`The answer does not contain "${clip(value)}".`);
      case 'notContains':
        return lower.includes(value.toLowerCase()) ? fail(`The answer contains "${clip(value)}".`) : ok();
      case 'noneOf': {
        const found = phrasesOf(value).find((phrase) => lower.includes(phrase.toLowerCase()));
        return found ? fail(`The answer contains "${clip(found)}".`) : ok();
      }
      case 'wordCount':
        return inRange(value, answer.trim().split(/\s+/).filter(Boolean).length, 'words');
      case 'lineCount':
        return inRange(value, answer.split('\n').filter((line) => line.trim() !== '').length, 'lines');
      case 'equals':
        return answer.trim() === value.trim() ? ok() : fail('The answer is not exactly the expected text.');
      case 'regex':
        return new RegExp(value, 'm').test(answer) ? ok() : fail('The answer does not match the pattern.');
      case 'json': {
        const parsed = extractJson(answer);
        if (parsed === undefined) return fail('The answer is not valid JSON.');
        const keys = value.split(',').map((key) => key.trim()).filter(Boolean);
        const missing = keys.filter((key) => !(parsed && typeof parsed === 'object' && key in parsed));
        return missing.length === 0 ? ok() : fail(`The JSON lacks: ${missing.join(', ')}.`);
      }
      case 'fileExists': {
        if (!run.folder) return skip('This check needs a task that uses tools.');
        const path = insideFolder(run.folder, value.trim());
        if (!path) return fail('The path leaves the task folder.');
        return existsSync(path) ? ok() : fail(`No file at ${clip(value)}.`);
      }
      case 'fileContains': {
        if (!run.folder) return skip('This check needs a task that uses tools.');
        const at = value.indexOf('::');
        if (at < 0) return skip('Write this check as path :: text.');
        const path = insideFolder(run.folder, value.slice(0, at).trim());
        const needle = value.slice(at + 2).trim();
        if (!path || !needle) return fail('The path leaves the task folder, or no text was given.');
        if (!existsSync(path)) return fail(`No file at ${clip(value.slice(0, at).trim())}.`);
        if (statSync(path).size > MAX_FILE_BYTES) return skip('The file is too large to check.');
        return readFileSync(path, 'utf8').toLowerCase().includes(needle.toLowerCase())
          ? ok()
          : fail(`The file does not contain "${clip(needle)}".`);
      }
      case 'judge':
        if (!run.judge) return skip('No judge model is set.');
        return { status: run.judge.status, detail: run.judge.detail };
      default:
        return skip('Unknown check.');
    }
  } catch (error) {
    return skip(`The check could not run: ${String(error?.message ?? error).slice(0, 120)}`);
  }
}

/**
 * Decide a run from all of its checks. Every check must pass.
 * @param {Array<{type: string, value: string}>} checks - the task's checks.
 * @param {object} run - what the run produced.
 * @returns {{status: 'PASS' | 'FAIL' | 'NOT_EVALUATED', detail: string}} verdict.
 */
export function verdictOf(checks, run) {
  if (!Array.isArray(checks) || checks.length === 0) return skip('The task has no checks.');
  const outcomes = checks.map((check) => runCheck(check, run));
  const failed = outcomes.find((outcome) => outcome.status === 'FAIL');
  if (failed) return failed;
  const undecided = outcomes.find((outcome) => outcome.status === 'NOT_EVALUATED');
  if (undecided) return undecided;
  return ok();
}

/**
 * Read a count or a range such as `12` or `150-220`.
 * @param {string} text - what the check holds.
 * @returns {{min: number, max: number} | undefined} the range, or undefined when it is not one.
 */
export function rangeOf(text) {
  const match = String(text ?? '').trim().match(/^(\d{1,6})(?:\s*-\s*(\d{1,6}))?$/);
  if (!match) return undefined;
  const min = Number(match[1]);
  const max = match[2] === undefined ? min : Number(match[2]);
  return max >= min ? { min, max } : undefined;
}

/**
 * Split a `noneOf` list on vertical bars.
 * @param {string} text - what the check holds.
 * @returns {string[]} the phrases, without empty ones.
 */
export function phrasesOf(text) {
  return String(text ?? '').split('|').map((phrase) => phrase.trim()).filter(Boolean);
}

function inRange(value, count, unit) {
  const range = rangeOf(value);
  if (!range) return skip('Write this check as one number or a range like 150-220.');
  if (count >= range.min && count <= range.max) return ok();
  const wanted = range.min === range.max ? `${range.min}` : `${range.min} to ${range.max}`;
  return fail(`The answer has ${count} ${unit}; it should have ${wanted}.`);
}

function ok() {
  return { status: 'PASS', detail: '' };
}
function fail(detail) {
  return { status: 'FAIL', detail };
}
function skip(detail) {
  return { status: 'NOT_EVALUATED', detail };
}
function clip(text) {
  const value = String(text);
  return value.length > 60 ? `${value.slice(0, 57)}…` : value;
}
