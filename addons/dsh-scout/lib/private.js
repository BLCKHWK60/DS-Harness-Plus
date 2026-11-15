/**
 * The user's private material: the Scout folder (resume, LinkedIn export, notes) and the profile.
 *
 * Scout works with any model, local or cloud, so both are open to the conversation's model. The
 * profile is a short summary: titles, skills, seniority, pay level and what the user wants.
 */
import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const TEXT = ['.txt', '.md', '.markdown', '.csv', '.json'];
const DOCS = ['.docx', '.doc', '.rtf', '.odt', '.html', '.htm'];
const READABLE = [...TEXT, ...DOCS, '.pdf'];
const FILE_MAX = 25 * 1024 * 1024;
const UPLOAD_MAX = 15 * 1024 * 1024;
export const PROFILE_MAX = 6000;
const READ_MAX = 60_000;

/** A file name the user gave or the model asked for: one plain name inside the folder. */
export function fileName(raw) {
  const name = String(raw ?? '').trim();
  if (!name || name.length > 160 || /[/\\\0]/.test(name) || name.startsWith('.') || name === '..') return undefined;
  return name;
}

/**
 * @param {string} root - the Scout folder.
 * @param {object} [deps] - `pdf(path, folder)` (reads a PDF's text, from the PDF reader add-on) and `convert(path)` (other documents).
 */
export function openFolder(root, deps = {}) {
  const ensure = () => {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    return root;
  };
  const convert = deps.convert ?? ((path) => new Promise((done, fail) => {
    // macOS's own converter: Word, RTF, OpenDocument and HTML to plain text. Nothing else runs.
    execFile('/usr/bin/textutil', ['-convert', 'txt', '-stdout', path], { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => (error ? fail(new Error('the document could not be turned into text')) : done(String(stdout))));
  }));
  return {
    root,
    ensure,
    /** @returns {{name: string, size: number, modified: string, readable: boolean}[]} the files, newest first. */
    list() {
      if (!existsSync(root)) return [];
      return readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
        .map((entry) => {
          const stats = statSync(join(root, entry.name));
          return { name: entry.name, size: stats.size, modified: new Date(stats.mtimeMs).toISOString().slice(0, 10), readable: READABLE.includes(extname(entry.name).toLowerCase()), at: stats.mtimeMs };
        })
        .sort((a, b) => b.at - a.at)
        .slice(0, 200)
        .map(({ at: _at, ...rest }) => rest);
    },
    /** The text of one file. */
    async read(raw) {
      const name = fileName(raw);
      if (!name) throw new Error('give the name of one file in the Scout folder');
      const path = join(root, name);
      if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`there is no file called ${name} in the Scout folder`);
      if (statSync(path).size > FILE_MAX) throw new Error('that file is larger than 25 MB');
      const kind = extname(name).toLowerCase();
      let text;
      if (TEXT.includes(kind)) text = readFileSync(path, 'utf8');
      else if (kind === '.pdf') {
        if (typeof deps.pdf !== 'function') throw new Error('reading PDFs needs the PDF reader add-on: switch it on in Settings → PDF reader');
        text = await deps.pdf(path, root);
      } else if (DOCS.includes(kind)) text = await convert(path);
      else throw new Error(`${name} is not a kind of file Scout reads (text, Markdown, PDF, Word, RTF, OpenDocument or HTML)`);
      text = String(text ?? '').replace(/\r\n/g, '\n').trim();
      return text.length > READ_MAX ? `${text.slice(0, READ_MAX)}\n[The file is longer; only its first ${READ_MAX} characters are shown.]` : text;
    },
    /** Save a file the user dropped on the start page. */
    save(raw, base64) {
      const name = fileName(raw);
      if (!name) throw new Error('That file name cannot be used.');
      if (!READABLE.includes(extname(name).toLowerCase())) throw new Error('Scout reads text, Markdown, PDF, Word, RTF, OpenDocument and HTML files.');
      const data = Buffer.from(String(base64 ?? ''), 'base64');
      if (data.length === 0) throw new Error('The file is empty.');
      if (data.length > UPLOAD_MAX) throw new Error('The file is larger than 15 MB.');
      ensure();
      writeFileSync(join(root, name), data, { mode: 0o600 });
      return name;
    },
  };
}

/** Why a profile cannot be saved, if it cannot. */
export function profileProblem(text) {
  if (String(text ?? '').length > PROFILE_MAX) return `The profile is longer than ${PROFILE_MAX} characters. Keep it to a short summary.`;
  return undefined;
}

/** The profile file. Saving keeps the one before as `<file>.bak`, so a replaced profile can be got back. */
export function openProfile(file) {
  return {
    read() {
      try {
        return file && existsSync(file) ? readFileSync(file, 'utf8').slice(0, PROFILE_MAX) : '';
      } catch {
        return '';
      }
    },
    save(text) {
      const value = String(text ?? '').replace(/\r\n/g, '\n').trim();
      const problem = profileProblem(value);
      if (problem) throw new Error(problem);
      if (!file) throw new Error('There is nowhere to keep the profile.');
      mkdirSync(join(file, '..'), { recursive: true, mode: 0o700 });
      if (existsSync(file)) copyFileSync(file, `${file}.bak`);
      writeFileSync(file, `${value}\n`, { mode: 0o600 });
      return value;
    },
  };
}
