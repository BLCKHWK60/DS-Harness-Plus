/**
 * Artifacts: what kind of file an artifact is (for its card and how the viewer shows it), and what changed
 * between two versions of a text file.
 */

const EXT = {
  markdown: ['md', 'markdown', 'mdx'],
  html: ['html', 'htm'],
  pdf: ['pdf'],
  word: ['doc', 'docx', 'odt', 'rtf'],
  sheet: ['xls', 'xlsx', 'ods', 'numbers'],
  slides: ['ppt', 'pptx', 'odp', 'key'],
  csv: ['csv', 'tsv'],
  json: ['json', 'jsonl', 'geojson'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif'],
  audio: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'],
  video: ['mp4', 'mov', 'webm', 'm4v'],
  code: ['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'sh', 'zsh', 'bash', 'css', 'scss', 'sql', 'yml', 'yaml', 'toml', 'xml', 'ini', 'lua', 'r', 'pl', 'dart', 'vue', 'svelte'],
  text: ['txt', 'log', 'text', 'env.example', 'conf'],
};
const BY_EXT = new Map(Object.entries(EXT).flatMap(([kind, list]) => list.map((ext) => [ext, kind])));

/** The words the card shows for each kind. */
export const KIND_LABEL = {
  markdown: 'Markdown', html: 'Web page', pdf: 'PDF', word: 'Word document', sheet: 'Spreadsheet', slides: 'Slides',
  csv: 'Table (CSV)', json: 'JSON', image: 'Picture', audio: 'Audio', video: 'Video', code: 'Code', text: 'Text', other: 'File',
};

/**
 * @param {string} path - the file.
 * @returns {string} its kind (see KIND_LABEL).
 */
export function kindOf(path) {
  const name = String(path ?? '').split('/').pop().toLowerCase();
  if (!name.includes('.')) return name === 'makefile' || name === 'dockerfile' ? 'code' : 'other';
  const ext = name.slice(name.lastIndexOf('.') + 1);
  return BY_EXT.get(ext) ?? 'other';
}

/** Kinds whose versions are compared line by line. */
export const TEXT_KINDS = new Set(['markdown', 'html', 'csv', 'json', 'code', 'text']);

/**
 * What changed between two texts, line by line: kept, removed and added lines, in order. For long texts
 * (over 4,000 lines on either side) only a summary is given.
 * @param {string} before - the older version.
 * @param {string} after - the newer version.
 * @returns {{lines: {op: ' '|'-'|'+', text: string}[], added: number, removed: number, summary?: string}}
 */
export function diffLines(before, after) {
  const a = String(before ?? '').split('\n');
  const b = String(after ?? '').split('\n');
  if (a.length > 4000 || b.length > 4000) {
    return { lines: [], added: b.length, removed: a.length, summary: `Too long to compare line by line (${a.length} lines before, ${b.length} after).` };
  }
  // Longest common subsequence, from the end (small enough for the limit above).
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] = a[i] === b[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const lines = [];
  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push({ op: ' ', text: a[i] });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      lines.push({ op: '-', text: a[i] });
      removed += 1;
      i += 1;
    } else {
      lines.push({ op: '+', text: b[j] });
      added += 1;
      j += 1;
    }
  }
  for (; i < n; i += 1) { lines.push({ op: '-', text: a[i] }); removed += 1; }
  for (; j < m; j += 1) { lines.push({ op: '+', text: b[j] }); added += 1; }
  return { lines, added, removed };
}
