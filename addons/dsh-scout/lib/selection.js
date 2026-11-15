/**
 * What the user chose on the Scout start page (title, place, pay, work type, markets), the note
 * every Scout conversation gets about it, and which choice each conversation started with.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_MARKETS, MARKETS, WORK_TYPES } from './registry.js';

const clip = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Market names: known ones spelled as listed, others kept as typed. */
export function cleanMarkets(list) {
  const known = Object.keys(MARKETS);
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const name = clip(raw, 40);
    if (!name) continue;
    const match = known.find((market) => market.toLowerCase() === name.toLowerCase()) ?? name;
    if (!out.some((market) => market.toLowerCase() === match.toLowerCase())) out.push(match);
  }
  return out.slice(0, 20);
}

/** The selection, checked. */
export function readSelection(raw = {}) {
  const markets = cleanMarkets(raw.markets);
  return {
    title: clip(raw.title, 120),
    location: clip(raw.location, 100),
    salary: clip(raw.salary, 60),
    workType: raw.workType === 'any' || WORK_TYPES.includes(raw.workType) ? raw.workType : 'any',
    markets: Array.isArray(raw.markets) ? markets : [...DEFAULT_MARKETS],
  };
}

/** The note a Scout conversation gets. */
export function selectionNote(selection, { profile, files, model } = {}) {
  const given = [
    selection.title && `Work: ${selection.title}`,
    selection.location && `Where: ${selection.location}`,
    selection.salary && `Pay target: ${selection.salary}`,
    `Work type: ${selection.workType === 'any' ? 'any (employee, freelance, contract)' : selection.workType}`,
    `Markets: ${selection.markets.length > 0 ? selection.markets.map((market) => `${market}${MARKETS[market] ? ` (${MARKETS[market].languages.join('/')})` : ''}`).join(', ') : 'none chosen; ask which'}`,
  ].filter(Boolean);
  return [
    'Scout selection when this conversation started (the user\'s own entries; anything empty is for you to infer and state):',
    ...given.map((item) => `- ${item}`),
    model ? `Model: ${model}` : '',
    files ? `User's files: ${files}` : '',
    profile ? `Profile: ${profile}` : '',
  ].filter(Boolean).join('\n');
}

/** Which selection each conversation started with. Kept in a small file. */
export function openPins(file, max = 500) {
  let table = {};
  try {
    if (file && existsSync(file)) table = JSON.parse(readFileSync(file, 'utf8')) ?? {};
  } catch {
    table = {};
  }
  const write = () => {
    if (!file) return;
    try {
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
      writeFileSync(file, JSON.stringify(table), { mode: 0o600 });
    } catch {
      /* the pins are a convenience */
    }
  };
  return {
    get: (id) => (table[id] ? readSelection(table[id]) : undefined),
    pin(id, selection) {
      table[id] = selection;
      const ids = Object.keys(table);
      if (ids.length > max) for (const old of ids.slice(0, ids.length - max)) delete table[old];
      write();
    },
  };
}
