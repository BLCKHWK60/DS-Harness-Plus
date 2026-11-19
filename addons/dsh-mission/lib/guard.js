/**
 * The three permission modes, as one decision per tool call. Kept apart from the plugin so the
 * rules can be tested without the app.
 *
 * In every mode the assistant works inside the conversation's folder.
 *   restricted  nothing outside the folder is seen or changed, and it is never asked for. Inside,
 *               new files are free; changing or deleting an existing file is asked once per file.
 *   ask         the same inside the folder. Outside, reading is asked for once per place, and a
 *               change goes through the app's own sandbox question.
 *   auto        free inside the folder. Outside, as in ask.
 */
import { OWN_FOLDER, exists, isInside, outsideInCommand, pathsOf, real, shown } from './paths.js';
import { join } from 'node:path';

export const MODES = ['restricted', 'ask', 'auto'];
export const MODE_LABELS = { restricted: 'Restricted', ask: 'Ask-Auto', auto: 'Full Auto' };

/** Tools that create or change a file named in their arguments. */
export const WRITE_TOOLS = new Set(['write', 'edit', 'multi_edit', 'apply_patch', 'notebook_edit', 'move', 'delete', 'remove']);
/** Tools that run commands. */
export const COMMAND_TOOLS = new Set(['bash', 'terminal', 'shell', 'pwsh']);

/**
 * @param {unknown} text - what the user typed after /mission.
 * @returns {string | undefined} the mode's id.
 */
export function modeOf(text) {
  const word = String(text ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (['restricted', '1', 'restrict', 'strict'].includes(word)) return 'restricted';
  if (['ask', '2', 'ask-auto', 'askauto'].includes(word)) return 'ask';
  if (['auto', '3', 'full', 'full-auto', 'fullauto'].includes(word)) return 'auto';
  return undefined;
}

/**
 * Decide one tool call.
 * @param {object} call - the call.
 * @param {string} call.mode - restricted, ask or auto.
 * @param {string} call.tool - the tool's name.
 * @param {unknown} call.args - its arguments.
 * @param {string} call.root - the conversation's folder, in its real spelling.
 * @param {(path: string) => boolean} call.approved - whether the user already said yes to changing this file inside the folder.
 * @param {(path: string) => boolean} call.outsideOk - whether the user already said yes to this place outside the folder.
 * @param {(path: string) => boolean} [call.exists] - whether a file is there; for tests.
 * @returns {{kind: 'allow'} | {kind: 'deny', reason: string} | {kind: 'ask', question: string, files?: string[], outside?: string[]}} the decision.
 */
export function decide({ mode, tool, args, root, approved, outsideOk, exists: there = exists }) {
  if (!MODES.includes(mode) || !root) return { kind: 'allow' };
  const label = MODE_LABELS[mode];
  const own = join(root, OWN_FOLDER);
  const never = `${label} mode: this conversation works only inside ${root}. Nothing outside it may be read or changed, and the user is not to be asked for it. Find another way inside the folder, or tell the user what you could not do.`;

  if (COMMAND_TOOLS.has(tool)) {
    const command = args?.command ?? args?.cmd ?? args?.script ?? '';
    if (new RegExp(`(^|[\\s/"'])${OWN_FOLDER.replace('.', '\\.')}(/|\\s|$|["'])`).test(String(command))) {
      return { kind: 'deny', reason: `The ${OWN_FOLDER} folder holds this conversation's checkpoints. Commands may not name it.` };
    }
    // A wider sandbox for one command is the app's own request to leave the folder.
    if (args?.sandbox_permissions !== undefined && mode === 'restricted') return { kind: 'deny', reason: never };
    const outside = outsideInCommand(command, root).filter((path) => !outsideOk(path));
    if (outside.length === 0) return { kind: 'allow' };
    if (mode === 'restricted') return { kind: 'deny', reason: `${never} The command names: ${outside.join(', ')}.` };
    return { kind: 'ask', question: `${label} mode: this command reaches outside the conversation's folder: ${outside.join(', ')}. Allow it?`, outside };
  }

  const paths = pathsOf(args, root);
  if (paths.length === 0) return { kind: 'allow' };
  const writes = WRITE_TOOLS.has(tool);
  if (paths.some((path) => isInside(own, path))) {
    return writes ? { kind: 'deny', reason: `The ${OWN_FOLDER} folder holds this conversation's checkpoints. It may not be changed.` } : { kind: 'allow' };
  }

  const outside = paths.filter((path) => !isInside(root, path) && !outsideOk(path));
  if (outside.length > 0) {
    if (mode === 'restricted') return { kind: 'deny', reason: `${never} The call names: ${outside.join(', ')}.` };
    // A change outside is the app's sandbox's to ask about: it refuses the call, the assistant
    // retries with a wider sandbox, and the app puts that to the user. Asking here as well would
    // ask twice. Reading is not fenced by the sandbox, so that question is asked here.
    if (writes) return { kind: 'allow' };
    return { kind: 'ask', question: `${label} mode: read outside the conversation's folder: ${outside.join(', ')}. Allow it?`, outside };
  }

  if (!writes || mode === 'auto') return { kind: 'allow' };
  // Inside the folder: a new file is free, an existing one is asked for once.
  const files = paths.filter((path) => isInside(root, path) && there(path) && !approved(path));
  if (files.length === 0) return { kind: 'allow' };
  return { kind: 'ask', question: `${label} mode: change ${files.map((path) => shown(root, path)).join(', ')}? You are asked once per file; after a yes it may be changed again without asking.`, files };
}

/** Programs that only read (with the checks in `mayChangeFiles`). */
const READERS = new Set(['ls', 'cat', 'head', 'tail', 'wc', 'grep', 'egrep', 'fgrep', 'rg', 'pwd', 'echo', 'printf', 'which', 'whoami', 'date', 'stat', 'file', 'diff', 'cmp', 'sort', 'uniq', 'cut', 'tr', 'tree', 'du', 'df', 'basename', 'dirname', 'realpath', 'true', 'false', 'test', '[', 'uname', 'id', 'hostname', 'env', 'printenv', 'less', 'more', 'column', 'nl', 'od', 'md5', 'shasum', 'sha256sum', 'jq']);
const GIT_READERS = new Set(['status', 'log', 'diff', 'show', 'rev-parse', 'ls-files', 'blame', 'describe', 'shortlog', 'grep', 'ls-tree', 'cat-file', 'remote', 'branch', 'tag', 'config']);

/**
 * Whether a shell command could change a file (anything not plainly a reader). Used where no checkpoint can undo a change.
 * It errs towards yes: an unknown program, a redirect, a substitution or a program's own write option all count.
 * @param {unknown} command - the command text.
 * @returns {boolean} true when the user should be asked first.
 */
export function mayChangeFiles(command) {
  const text = String(command ?? '').trim();
  if (!text) return false;
  // Redirects into a file, substitutions and here-documents can write; only >/dev/null and 2>&1 style ones are harmless.
  const bare = text.replace(/\d*>\s*\/dev\/null/g, '').replace(/\d*>&\d+/g, '').replace(/&>\s*\/dev\/null/g, '');
  if (/>/.test(bare) || /<<|`|\$\(|<\(|>\(/.test(bare)) return true;
  for (const part of bare.split(/\n|;|&&|\|\||\||&/)) {
    const words = part.trim().split(/\s+/).filter(Boolean);
    while (words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) words.shift();
    if (words.length === 0) continue;
    const program = words[0].replace(/^.*\//, '');
    const rest = words.slice(1);
    if (program === 'git') {
      const sub = rest.find((word) => !word.startsWith('-')) ?? '';
      if (!GIT_READERS.has(sub) || rest.some((word) => /^(-d|-D|-m|-M|--delete|--set|--unset|--add|-f|--force|add|remove|rename|set-url|prune|-c)$/.test(word)) || (sub === 'config' && !rest.some((word) => word === '--get' || word === '--list' || word === '-l'))) return true;
    } else if (program === 'find') {
      if (rest.some((word) => /^-(exec|execdir|ok|okdir|delete|fprint|fprint0|fprintf|fls)$/.test(word))) return true;
    } else if (program === 'sed') {
      if (rest.some((word) => /^-[A-Za-z]*i/.test(word) || word === '--in-place' || /^--in-place=/.test(word))) return true;
    } else if (program === 'rg') {
      if (rest.some((word) => /^--pre/.test(word))) return true;
    } else if (program === 'sort') {
      if (rest.some((word) => /^(-o|--output)/.test(word))) return true;
    } else if (program === 'env') {
      if (rest.some((word) => !word.startsWith('-') && !/=/.test(word))) return true;
    } else if (!READERS.has(program)) return true;
  }
  return false;
}

/**
 * What the assistant is told about the mode it works under.
 * @param {string} mode - restricted, ask or auto.
 * @param {string} root - the conversation's folder.
 * @returns {string} the note; '' for an unknown mode.
 */
export function rulesNote(mode, root, noUndo = '') {
  if (!MODES.includes(mode)) return '';
  const told = 'In your next reply tell the user once, in plain words, that this folder has no undo.';
  const inside = mode === 'auto'
    ? 'Inside it you may create, change and delete files and run commands without asking.'
    : noUndo
      ? `Inside it you may create new files. Changing an existing file goes through the write or edit tool: the user is asked once per file, and after a yes you may change that file again without asking. IMPORTANT: no undo is available in this folder (${noUndo}), so nothing a command changes or deletes can be put back. ${mode === 'restricted' ? 'The user is asked before every command that could change a file; commands that only read run freely. Prefer the edit tool for existing files, and keep commands to what the task needs.' : 'Commands are not stopped from changing existing files: be careful, prefer the edit tool for existing files (it asks the user), and run a command that changes or deletes files only when the task needs it.'} ${told} Files you created yourself in this conversation are yours to change.`
      : 'Inside it you may create new files and run commands freely. Changing an existing file goes through the write or edit tool: the user is asked once per file, and after a yes you may change that file again without asking. A command that changes or deletes an existing file the user has not approved is undone at once: the file is put back. To change such a file, edit it with the edit tool first (that asks the user), or ask for several files at once with mission_request_files, then run the command again. Files you created yourself in this conversation are yours to change.';
  const outside = mode === 'restricted'
    ? 'Nothing outside the folder may be read, listed, run or changed. Do not ask the user for it and do not look for a way round it. If the task cannot be done inside the folder, say exactly what is missing.'
    : 'Reading or changing anything outside the folder needs the user\'s yes. A read outside is put to them, once per place. A change outside is refused by the sandbox first: retry that exact call once with sandbox_permissions and a one-line justification, and the user is asked. Go outside only when the task really needs it, and say why in one line first.';
  return [
    `Permission mode: ${MODE_LABELS[mode]}. Your workspace is ${real(root)}. Work inside it.`,
    inside,
    outside,
    noUndo
      ? `No checkpoints are taken of this folder, so there is nothing the user can go back to${mode === 'auto' ? ', and Full Auto changes here cannot be undone' : ''}. ${mode === 'auto' ? told : ''}`.trim()
      : `A checkpoint of the folder is taken at the start of every turn and before every command, so the user can go back. The ${OWN_FOLDER} folder holds them: leave it alone.`,
  ].join('\n');
}
