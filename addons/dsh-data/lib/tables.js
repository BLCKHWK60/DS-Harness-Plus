/**
 * Turning data files into tables: CSV and TSV, JSON and JSON Lines, and Excel workbooks.
 * A table is `{ name, columns: [{ name, type }], rows: any[][] }`, where a cell is a number, a
 * string or null. Kept apart from the plugin so it can be tested without the app.
 */
import { execFile } from 'node:child_process';
import { basename, extname } from 'node:path';

/** File endings read as tables, by kind. */
export const TABLE_KINDS = {
  csv: ['.csv', '.tsv', '.tab'],
  json: ['.json', '.jsonl', '.ndjson'],
  excel: ['.xlsx', '.xlsm'],
};
/** File endings read as text (not tables). PDFs are left to the PDF reader add-on. */
export const TEXT_ENDINGS = ['.txt', '.md', '.markdown', '.log', '.docx', '.doc', '.rtf', '.odt', '.html', '.htm', '.xml', '.yaml', '.yml'];
export const MAX_FILE_BYTES = 200 * 1024 * 1024;
export const MAX_ROWS = 2_000_000;
export const MAX_COLUMNS = 500;

/**
 * What kind of table file a path is.
 * @param {string} path - the file.
 * @returns {'csv' | 'json' | 'excel' | undefined} its kind; undefined when it is not read as tables.
 */
export function tableKind(path) {
  const ending = extname(String(path)).toLowerCase();
  return Object.keys(TABLE_KINDS).find((kind) => TABLE_KINDS[kind].includes(ending));
}

/**
 * A name usable as a table or column name in SQL.
 * @param {unknown} value - any text.
 * @param {string} fallback - used when nothing is left.
 * @returns {string} lower-case letters, digits and underscores, not starting with a digit.
 */
export function sqlName(value, fallback = 'x') {
  const name = String(value ?? '').replace(/ß/g, 'ss').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  if (!name) return fallback;
  return /^[0-9]/.test(name) ? `_${name}` : name;
}

/**
 * Names made unique by adding _2, _3 and so on.
 * @param {string[]} names - wanted names.
 * @returns {string[]} the same names, without repeats.
 */
export function unique(names) {
  const seen = new Map();
  return names.map((name) => {
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    if (count === 1) return name;
    let candidate = `${name}_${count}`;
    while (seen.has(candidate)) candidate = `${candidate}_`;
    seen.set(candidate, 1);
    return candidate;
  });
}

/**
 * Which character separates the fields of a CSV text.
 * @param {string} text - the start of the file.
 * @returns {string} a comma, semicolon, tab or pipe.
 */
export function sniffDelimiter(text) {
  const lines = text.split(/\r?\n/, 12).filter((line) => line.trim() !== '').slice(0, 10);
  let best = ',';
  let bestScore = 0;
  for (const candidate of [',', ';', '\t', '|']) {
    const counts = lines.map((line) => {
      let count = 0;
      let quoted = false;
      for (const char of line) {
        if (char === '"') quoted = !quoted;
        else if (char === candidate && !quoted) count += 1;
      }
      return count;
    });
    const first = counts[0] ?? 0;
    // A real delimiter appears on every line, the same number of times.
    const steady = first > 0 && counts.every((count) => count === first);
    const score = steady ? first * 2 + 1 : Math.min(...counts) > 0 ? 1 : 0;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The records of a CSV text (RFC 4180: quotes, doubled quotes, line breaks inside quotes).
 * @param {string} text - the file's text.
 * @param {string} [delimiter] - the separator; sniffed when left out.
 * @param {number} [most] - stop after this many records.
 * @returns {string[][]} the records, each a list of fields.
 */
export function parseCsv(text, delimiter = sniffDelimiter(text.slice(0, 20000)), most = MAX_ROWS + 1) {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const end = source.length;
  while (i < end) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      // Take everything up to the next quote in one step.
      const next = source.indexOf('"', i);
      const stop = next < 0 ? end : next;
      field += source.slice(i, stop);
      i = stop;
      continue;
    }
    if (char === '"' && field === '') {
      quoted = true;
      i += 1;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
      i += 1;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      i += 1;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      if (rows.length >= most) return rows;
    } else {
      field += char;
      i += 1;
    }
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

const INTEGER = /^[+-]?\d{1,15}$/;
const DECIMAL = /^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$/;
const THOUSANDS = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/;
const EMPTY = new Set(['', 'null', 'NULL', 'NA', 'N/A', 'n/a', 'NaN', '#N/A']);

/**
 * A text cell as a number when it is one, else as text; empty markers become null.
 * @param {unknown} raw - the cell.
 * @returns {number | string | null} the value.
 */
export function cell(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  const text = String(raw).trim();
  if (EMPTY.has(text)) return null;
  // A leading zero means an identifier (a postcode, a phone number), not a number.
  if (/^[+-]?0\d/.test(text)) return text;
  if (INTEGER.test(text) || DECIMAL.test(text)) return Number(text);
  if (THOUSANDS.test(text)) return Number(text.replace(/,/g, ''));
  return text;
}

/**
 * A column's type from its values.
 * @param {any[][]} rows - the table's rows.
 * @param {number} index - the column.
 * @returns {'integer' | 'real' | 'text'} the type; text when the column mixes numbers and text.
 */
export function columnType(rows, index) {
  let numbers = 0;
  let whole = true;
  let texts = 0;
  for (const row of rows) {
    const value = row[index];
    if (value === null || value === undefined) continue;
    if (typeof value === 'number') {
      numbers += 1;
      if (!Number.isInteger(value)) whole = false;
    } else texts += 1;
  }
  if (texts > 0 || numbers === 0) return 'text';
  return whole ? 'integer' : 'real';
}

/**
 * A table from a header and records.
 * @param {string} name - the table's name.
 * @param {unknown[]} header - the column titles.
 * @param {unknown[][]} records - the rows, as raw cells.
 * @returns {{name: string, columns: {name: string, title: string, type: string}[], rows: any[][]}} the table.
 */
export function tableOf(name, header, records) {
  const width = Math.min(MAX_COLUMNS, Math.max(header.length, ...records.slice(0, 200).map((record) => record.length)));
  const titles = Array.from({ length: width }, (_, index) => String(header[index] ?? '').trim() || `column_${index + 1}`);
  const names = unique(titles.map((title, index) => sqlName(title, `column_${index + 1}`)));
  const rows = records.map((record) => Array.from({ length: width }, (_, index) => cell(record[index])));
  const columns = names.map((columnName, index) => ({ name: columnName, title: titles[index], type: columnType(rows, index) }));
  // A column that is text overall keeps its numbers as text too, so comparisons behave.
  columns.forEach((column, index) => {
    if (column.type !== 'text') return;
    for (const row of rows) if (typeof row[index] === 'number') row[index] = String(row[index]);
  });
  return { name, columns, rows };
}

/**
 * The table of a CSV or TSV text. The first record is the header.
 * @param {string} text - the file's text.
 * @param {string} name - the table's name.
 * @returns {object} the table.
 */
export function csvTable(text, name) {
  const records = parseCsv(text);
  if (records.length > MAX_ROWS + 1) throw new Error(`it has more than ${MAX_ROWS.toLocaleString('en-US')} rows`);
  return tableOf(name, records[0] ?? [], records.slice(1));
}

const flat = (value) => (value !== null && typeof value === 'object' ? JSON.stringify(value) : value);

/**
 * A table from a list of JSON objects. Nested objects one level down become `outer.inner` columns.
 * @param {string} name - the table's name.
 * @param {unknown[]} list - the objects.
 * @returns {object} the table.
 */
export function objectsTable(name, list) {
  const keys = [];
  const index = new Map();
  const records = [];
  for (const item of list.slice(0, MAX_ROWS)) {
    const record = [];
    const put = (key, value) => {
      let at = index.get(key);
      if (at === undefined) {
        if (keys.length >= MAX_COLUMNS) return;
        at = keys.length;
        keys.push(key);
        index.set(key, at);
      }
      record[at] = flat(value);
    };
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      for (const [key, value] of Object.entries(item)) {
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) for (const [inner, deep] of Object.entries(value)) put(`${key}.${inner}`, deep);
        else put(key, value);
      }
    } else put('value', item);
    records.push(record);
  }
  return tableOf(name, keys, records);
}

/**
 * The tables of a JSON or JSON Lines text: a list of objects is one table; an object whose
 * properties are lists of objects gives one table per property.
 * @param {string} text - the file's text.
 * @param {string} name - the base name for the tables.
 * @param {boolean} lines - whether it is JSON Lines.
 * @returns {object[]} the tables.
 */
export function jsonTables(text, name, lines) {
  if (lines) {
    const list = [];
    for (const line of text.split(/\r?\n/)) {
      if (line.trim() === '') continue;
      list.push(JSON.parse(line));
      if (list.length > MAX_ROWS) throw new Error(`it has more than ${MAX_ROWS.toLocaleString('en-US')} rows`);
    }
    return [objectsTable(name, list)];
  }
  const data = JSON.parse(text);
  if (Array.isArray(data)) return [objectsTable(name, data)];
  if (data !== null && typeof data === 'object') {
    const lists = Object.entries(data).filter(([, value]) => Array.isArray(value) && value.length > 0 && value.every((item) => item !== null && typeof item === 'object'));
    if (lists.length > 0) return lists.slice(0, 50).map(([key, value]) => objectsTable(`${name}__${sqlName(key)}`, value));
    return [objectsTable(name, [data])];
  }
  throw new Error('it holds a single value, not a list or an object');
}

// ---- Excel ------------------------------------------------------------------------------------

const decode = (text) => String(text).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16))).replace(/&amp;/g, '&');
const attr = (tag, name) => (new RegExp(`\\b${name}="([^"]*)"`).exec(tag) ?? [])[1];

/**
 * The shared strings of a workbook.
 * @param {string} xml - `xl/sharedStrings.xml`.
 * @returns {string[]} the strings, in order.
 */
export function sharedStrings(xml) {
  const out = [];
  for (const match of String(xml).matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)) {
    out.push(decode([...String(match[1] ?? '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join('')));
  }
  return out;
}

/** Built-in number formats that are dates or times. */
const DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

/**
 * Which cell styles of a workbook are dates.
 * @param {string} xml - `xl/styles.xml`.
 * @returns {boolean[]} true at the index of each date style.
 */
export function dateStyles(xml) {
  const custom = new Map();
  for (const match of String(xml).matchAll(/<numFmt\b[^>]*>/g)) {
    const code = decode(attr(match[0], 'formatCode') ?? '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
    custom.set(Number(attr(match[0], 'numFmtId')), /[dy]/i.test(code) || /(^|[^a-z])m{1,5}([^a-z]|$)/i.test(code) || /[hs]/i.test(code));
  }
  const block = (/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(String(xml)) ?? [])[1] ?? '';
  return [...block.matchAll(/<xf\b[^>]*>/g)].map((match) => {
    const id = Number(attr(match[0], 'numFmtId') ?? 0);
    return custom.has(id) ? custom.get(id) : DATE_FORMATS.has(id);
  });
}

/**
 * An Excel date number as text.
 * @param {number} serial - days since the end of 1899, with the time as the fraction.
 * @returns {string} `YYYY-MM-DD`, or `YYYY-MM-DD HH:MM:SS` when it has a time.
 */
export function excelDate(serial) {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const iso = new Date(ms).toISOString();
  return Number.isInteger(serial) ? iso.slice(0, 10) : iso.slice(0, 19).replace('T', ' ');
}

const columnIndex = (ref) => {
  let index = 0;
  for (const char of String(ref).replace(/\d+$/, '')) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
};

/**
 * The rows of one worksheet.
 * @param {string} xml - the sheet's XML.
 * @param {string[]} strings - the workbook's shared strings.
 * @param {boolean[]} dates - which styles are dates.
 * @returns {unknown[][]} the rows, as raw cells.
 */
export function sheetRows(xml, strings, dates) {
  const rows = [];
  for (const rowMatch of String(xml).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = cellMatch[1];
      const at = columnIndex(attr(tag, 'r') ?? '');
      if (at < 0 || at >= MAX_COLUMNS) continue;
      const body = cellMatch[2] ?? '';
      const type = attr(tag, 't');
      const raw = (/<v>([\s\S]*?)<\/v>/.exec(body) ?? [])[1];
      let value = null;
      if (type === 's') value = strings[Number(raw)] ?? null;
      else if (type === 'inlineStr') value = decode([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join(''));
      else if (type === 'str' || type === 'e') value = raw === undefined ? null : decode(raw);
      else if (type === 'b') value = raw === '1' ? 1 : 0;
      else if (raw !== undefined && raw !== '') {
        const number = Number(raw);
        value = dates[Number(attr(tag, 's') ?? -1)] === true && Number.isFinite(number) && number > 0 ? excelDate(number) : number;
      }
      row[at] = value;
    }
    // Cells a row skips are empty cells, not holes.
    if (row.some((value) => value !== null && value !== undefined && value !== '')) rows.push(Array.from(row, (value) => value ?? null));
    if (rows.length > MAX_ROWS + 1) throw new Error(`a sheet has more than ${MAX_ROWS.toLocaleString('en-US')} rows`);
  }
  return rows;
}

/** macOS's own unzip; replaceable by tests. */
export const hooks = {
  /**
   * One file out of a zip archive, as text.
   * @param {string} archive - the archive.
   * @param {string} member - the path inside it.
   * @returns {Promise<string>} the text; '' when the member does not exist.
   */
  unzip(archive, member) {
    return new Promise((done) => {
      execFile('/usr/bin/unzip', ['-p', archive, member], { timeout: 120_000, maxBuffer: 1024 * 1024 * 1024 }, (error, stdout) => done(error ? '' : String(stdout)));
    });
  },
};

/**
 * The tables of an Excel workbook, one per sheet that has rows. The first row with content is the header.
 * @param {string} path - the workbook.
 * @param {string} name - the base name for the tables.
 * @returns {Promise<object[]>} the tables.
 */
export async function excelTables(path, name) {
  const workbook = await hooks.unzip(path, 'xl/workbook.xml');
  if (!workbook) throw new Error('it could not be opened as an Excel workbook');
  const rels = await hooks.unzip(path, 'xl/_rels/workbook.xml.rels');
  const targets = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((match) => [attr(match[0], 'Id'), attr(match[0], 'Target')]));
  const strings = sharedStrings(await hooks.unzip(path, 'xl/sharedStrings.xml'));
  const dates = dateStyles(await hooks.unzip(path, 'xl/styles.xml'));
  const tables = [];
  for (const match of [...workbook.matchAll(/<sheet\b[^>]*>/g)].slice(0, 50)) {
    const title = decode(attr(match[0], 'name') ?? '');
    const target = targets.get(attr(match[0], 'r:id')) ?? '';
    if (!target) continue;
    const member = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    const rows = sheetRows(await hooks.unzip(path, member), strings, dates);
    if (rows.length === 0) continue;
    const table = tableOf(`${name}__${sqlName(title, `sheet${tables.length + 1}`)}`, rows[0], rows.slice(1));
    table.sheet = title;
    tables.push(table);
  }
  if (tables.length === 0) throw new Error('the workbook has no sheet with rows');
  // A workbook with one sheet is simply the file's name.
  if (tables.length === 1) tables[0].name = name;
  return tables;
}

/**
 * The table name a file gets.
 * @param {string} path - the file.
 * @returns {string} its base name without the ending, as an SQL name.
 */
export const baseName = (path) => sqlName(basename(String(path), extname(String(path))), 'data');
