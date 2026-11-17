/**
 * Creator Plus's tools. Each does one job with code and answers in plain words; a model never runs a
 * command, installs a plugin or changes the real setup through them. The real setup changes only from
 * the Creator Plus page (index.js), by the user.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { boundaryRefusal, buildRefusal } from './bar.js';
import { checkChange, filesOf, hashFiles, lineDiff, prepareChange } from './change.js';
import { checksText, fourChecks, upkeep, upkeepText } from './checks.js';
import { questionRefusal } from './depth.js';
import { MODEL_PROMPTS, runCodeParts, scoreText } from './eight.js';
import { fitCheck } from './fit.js';
import { handoffText } from './handoff.js';
import { ALWAYS, briefText, nextQuestion, planOf, planText, slugOf } from './interview.js';
import { diffMap, mapText } from './map.js';
import { passportFiles, writePassport } from './passport.js';
import { logRefusal } from './place.js';
import { recipeText } from './recipes.js';
import { BUILD_FOLDER, real, within } from './rules.js';
import { safeDir, safeWrite } from './safewrite.js';
import { scaffoldFiles, writeScaffold } from './scaffold.js';
import { copyIn, ownFolder } from './runs.js';
import { scanAddon } from './scan.js';
import { clip, fence, oneLine } from './text.js';
import { findingCards, readLogs } from './logs.js';

/** A plain agreement or "build it", from the user's newest message (never the model's). */
const AGREE = /^(?:yes|yep|yeah|ok|okay|sure|go|go ahead|do it|build it|build|agreed|approve|approved|sounds good|looks good|fine|please do|ja|genau)\b/i;
const NEGATION = /\b(no|not|don'?t|never|stop|wait|hold on)\b/i;
/** @returns {boolean} whether the user's newest words say yes to the plan. */
export function saidYes(text) {
  const value = String(text ?? '').trim().toLowerCase().replace(/[.!]+$/, '');
  if (!value) return false;
  if (NEGATION.test(value.split(/\s+/).slice(0, 4).join(' '))) return false;
  return AGREE.test(value) || /\b(build it|go ahead|do it|yes,? build)\b/.test(value);
}

/**
 * @param {object} deps - what the tools need (index.js gives the real ones; tests give stand-ins).
 * @returns {object[]} tool definitions.
 */
export function buildTools(deps) {
  const { enabled, conversation, map, previousMap, saveMap, bar, cwdOf, recipes, strong, learning, trial, runs, backups, node, cards, userSaid, longSince, depthOf, approve, reader, sources, installedDir, modules, passportsHome, checkedHome, preparedHome, buildsHome, folderRefusal, userCount, routeOf, settingsOf, placeOf, logsDeps, now = () => Date.now() } = deps;
  const output = {
    schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
  };
  const safely = (work) => async (args, exec) => {
    if (!enabled()) return { text: 'Creator Plus is switched off in Settings → Creator Plus.' };
    try {
      return { text: await work(args ?? {}, exec) };
    } catch (error) {
      const reason = String(error?.message ?? error).slice(0, 900);
      return { text: `It did not work: ${reason}${/[.!?]$/.test(reason) ? '' : '.'}` };
    }
  };
  const common = { output, isConcurrencySafe: () => false, timeoutMs: 20 * 60_000 };
  /** The most of a change or a plugin's code the page shows in full; what is longer is not applied. */
  const SHOW_MAX = 2_000_000;
  const str = (max = 400) => ({ type: 'string', maxLength: max });
  const list = (max = 40, item = 200) => ({ type: 'array', maxItems: max, items: { type: 'string', maxLength: item } });
  const pluginOf = (name) => map().plugins.find((plugin) => plugin.name === name || plugin.id === name || plugin.folder === name || plugin.folder === `dsh-${name}`);
  const need = (exec, name, want) => {
    const plugin = pluginOf(name);
    if (!plugin) throw new Error(`There is no plugin "${oneLine(name, 60)}" on the map. creator_map lists them.`);
    const why = boundaryRefusal(bar(exec), plugin.name, plugin, want);
    if (why) throw new Error(why);
    return plugin;
  };
  /** The build folder: creator-plus-builds in the conversation's folder, when that folder is a safe place for it. */
  const buildRoot = (exec) => join(baseOf(exec), BUILD_FOLDER);
  /** The conversation's folder by its real path: where every host write in the build folder checks for links from (lib/safewrite.js). */
  const baseOf = (exec) => {
    const cwd = cwdOf(exec);
    if (!cwd) throw new Error('This conversation has no folder to build in.');
    const why = folderRefusal(exec);
    if (why) throw new Error(why);
    return real(cwd);
  };
  const buildDir = (exec, folder) => {
    const root = buildRoot(exec);
    const name = String(folder ?? '').replace(/^\.\//, '').replace(new RegExp(`^${BUILD_FOLDER}/`), '');
    const dir = resolve(root, name);
    if (!within(dir, root) || dir === root) throw new Error(`A plugin is built in a folder of its own inside ${BUILD_FOLDER}.`);
    return dir;
  };
  /** The last failed check of each plugin folder: its errors and its code, for the build record's fixes. */
  const failures = new Map();
  const CODE = /^(index\.js|client\.js|lib\/[^/]+\.m?js|test\/[^/]+\.mjs|cordis\.patch\.yml)$/;
  const codeOf = (dir) => {
    const out = {};
    let size = 0;
    for (const rel of filesOf(dir).filter((file) => CODE.test(file))) {
      try {
        const text = readFileSync(join(dir, rel), 'utf8');
        size += text.length;
        if (size > 400_000) break;
        out[rel] = text;
      } catch {
        /* unreadable: left out */
      }
    }
    return out;
  };
  const rememberFailure = (dir, copy, result) => {
    failures.set(dir, { error: result.steps.filter((step) => step.ok === false).map((step) => step.text).join('\n'), code: codeOf(copy) });
    if (failures.size > 50) failures.delete(failures.keys().next().value);
  };
  /** A finished build's record for Tuning Plus (<home>/builds/*.json): the brief, the plan, the checks, the fixes; masked. */
  const keepBuild = (exec, { dir, kept, scan, result, state, folder, key }) => {
    try {
      const passed = Object.fromEntries(result.steps.map((step) => [step.id === 'load' ? 'loads' : step.id, step.ok === true]));
      const before = failures.get(key);
      const fixes = [];
      if (before) {
        const now2 = codeOf(dir);
        const changed = Object.keys({ ...before.code, ...now2 }).filter((rel) => before.code[rel] !== now2[rel]);
        if (changed.length) fixes.push({ error: clip(before.error, 3000), cause: '', fix: clip(changed.map((rel) => `${rel}\n${lineDiff(before.code[rel] ?? '', now2[rel] ?? '', 60)}`).join('\n\n'), 6000), passed: true });
        failures.delete(key);
      }
      const route = routeOf(exec) ?? {};
      const id = `${now()}-${folder.replace(/[^\w.-]/g, '-')}`;
      const record = {
        id,
        at: now(),
        name: scan.name,
        folder,
        kind: state.kind ?? '',
        brief: clip(state.brief ?? readFileSync(join(kept, 'passport', 'brief.md'), 'utf8'), 8000),
        plan: state.plan ? clip(planText(state.plan, state.fit ?? { result: 'clear', findings: [] }), 6000) : '',
        summary: clip(`Built ${scan.name}: ${filesOf(kept).filter((file) => !file.startsWith('node_modules/')).join(', ')}.\n${checksText(result)}`, 12000),
        checks: passed,
        provider: String(route.provider ?? ''),
        model: String(route.model ?? ''),
        fixes,
      };
      mkdirSync(buildsHome(), { recursive: true, mode: 0o700 });
      writeFileSync(join(buildsHome(), `${id}.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    } catch {
      /* the record is a help for Tuning Plus, never a reason for a build to fail */
    }
  };
  /**
   * Run programs on a copy of a folder only the host writes, in a run folder of their own (lib/runs.js):
   * the copy is made before anything runs; the run folder is thrown away after.
   */
  const inRun = (dir, work, extra = {}) => runs().with((place) => {
    const at = join(place, 'work', basename(dir));
    copyIn(dir, at);
    for (const [rel, from] of Object.entries(extra)) copyIn(from, join(at, rel));
    mkdirSync(join(place, 'trial'), { mode: 0o700 });
    return { at, trialHome: join(place, 'trial') };
  }, work);
  /** Look only and report-only runs build nothing (the bar). */
  const mayBuild = (exec) => {
    const why = buildRefusal(bar(exec));
    if (why) throw new Error(why);
  };

  return [
    {
      name: 'creator_map',
      description: 'The map of the setup, read live from the running app: every plugin (who made it, on or off, version, locked or editable), every tab, every tool, and for the plugins selected on the bar what they touch (tools, commands, routes, places in the interface, services, settings, storage, instruction text). action "show" (default), "refresh" (read again now), or "diff" (what changed since the map before).',
      parameters: { type: 'object', properties: { action: { type: 'string', enum: ['show', 'refresh', 'diff'] } }, additionalProperties: false },
      ...common,
      isConcurrencySafe: () => true,
      execute: safely(async (args, exec) => {
        if (args.action === 'refresh' || args.action === 'diff') {
          const before = previousMap();
          const fresh = map(true);
          saveMap(fresh);
          if (args.action === 'diff') return upkeepText({ diff: diffMap(before ?? fresh, fresh), changed: true, results: [] });
        }
        const state = bar(exec);
        return fence(mapText(map(), state.selection), 'The map (the plugins outside the bar\'s selection as one line each)');
      }),
    },
    {
      name: 'creator_passport',
      description: 'A selected plugin\'s passport: its brief (what it is for and must do), what it touches, what it was built against, its tests and its changelog. action "show" (default) or "write" (write the passport of a built-in or third-party plugin into Creator Plus\'s own folder; a Plus plugin carries its own).',
      parameters: { type: 'object', properties: { plugin: str(80), action: { type: 'string', enum: ['show', 'write'] } }, required: ['plugin'], additionalProperties: false },
      ...common,
      execute: safely(async (args, exec) => {
        const plugin = need(exec, String(args.plugin ?? ''), 'read');
        const dir = plugin.locked ? join(passportsHome(), plugin.id.replace(/[^\w.-]/g, '-')) : join(installedDir(plugin) ?? '', 'passport');
        if (args.action === 'write') {
          if (!plugin.locked) return `${plugin.name} carries its own passport (passport/ in its folder); it is updated with the plugin.`;
          const folder = installedDir(plugin);
          if (!folder || !existsSync(join(folder, 'package.json'))) return `${plugin.name}'s folder could not be found, so its passport is written from the map only.`;
          const scan = scanAddon(folder);
          ownFolder(passportsHome());
          const written = writePassport(dir, passportFiles({ scan, origin: plugin.origin, appVersion: map().app.version, at: now() }));
          return `Wrote ${plugin.name}'s passport in Creator Plus's own folder (${written.written.join(', ')}); the plugin itself was not touched.`;
        }
        const read = (file) => {
          try {
            return readFileSync(join(dir, file), 'utf8');
          } catch {
            return '';
          }
        };
        const brief = read('brief.md');
        if (!brief) return `${plugin.name} has no passport yet${plugin.locked ? ' (write it with action "write")' : ''}.`;
        return fence([brief.slice(0, 20_000), read('touches.json').slice(0, 4000), read('built-against.json'), read('tests.md')].join('\n\n'), `${plugin.name}'s passport`);
      }),
    },
    {
      name: 'creator_recipe',
      description: 'The recipe for a kind of plugin (tool, mode, panel, theme, automation, provider): its steps marked [must] and [default], its files and its checks, and what Creator Plus has learned here (approved by the user).',
      parameters: { type: 'object', properties: { kind: { type: 'string', enum: ['tool', 'mode', 'panel', 'theme', 'automation', 'provider'] } }, required: ['kind'], additionalProperties: false },
      ...common,
      isConcurrencySafe: () => true,
      execute: safely(async (args, exec) => {
        const recipe = recipes()[args.kind];
        if (!recipe) throw new Error('There is no recipe for that kind.');
        const learned = learning.forPrompt();
        return `${recipeText(recipe, { strong: strong(exec) })}${learned ? `\n\n${learned}` : ''}`;
      }),
    },
    {
      name: 'creator_interview',
      description: 'The next question to ask the user before a build, one at a time, with its recommendation and the user\'s usual answer. Pass the answers so far (question id → the user\'s words). When nothing is left to ask, it says so; then write the plan with creator_plan.',
      parameters: { type: 'object', properties: { kind: str(20), answers: { type: 'object', additionalProperties: { type: 'string', maxLength: 600 } } }, additionalProperties: false },
      ...common,
      execute: safely(async (args, exec) => {
        const state = conversation(exec);
        state.answers = { ...(state.answers ?? {}), ...(args.answers ?? {}) };
        const question = nextQuestion({ answers: state.answers, kind: args.kind ?? state.kind ?? '', preferences: learning.preferences() });
        if (!question) return `Nothing left to ask: the four things are settled (${ALWAYS.map((item) => item.id).join(', ')}). Write the plan with creator_plan.`;
        const late = questionRefusal({ longSince: longSince(exec), now: now() });
        if (late) return `${late}\nThe question would have been: ${question.question} Recommended: ${question.recommended}${question.usual ? ` (the user's usual answer: ${question.usual})` : ''}. Assume it, and note it with creator_note (assumption).`;
        return [`Ask the user (one question, with ask_user_question): ${question.question}`, `Options: ${question.options.join(' / ')}.`, `Recommended: ${question.recommended}. Why: ${question.why}`, question.usual ? `The user's usual answer: ${question.usual} (offer it first).` : '', `Pass the answer back as answers.${question.id}.`].filter(Boolean).join('\n');
      }),
    },
    {
      name: 'creator_plan',
      description: 'Write the brief and the plan for a new plugin, and run the fit check against the map: what it creates, what it touches, what could collide (clear, needs a decision, or blocked). Show the plan to the user and build only after their yes.',
      parameters: {
        type: 'object',
        properties: {
          title: str(80), kind: { type: 'string', enum: ['tool', 'mode', 'panel', 'theme', 'automation', 'provider'] }, purpose: str(600),
          must: list(20, 300), mustNot: list(10, 300), tools: list(10, 60), commands: list(5, 40), tabs: list(10, 40),
          slots: { type: 'array', maxItems: 6, items: { type: 'object', properties: { name: str(60), id: str(40) }, required: ['name', 'id'] } },
          services: list(5, 40), storage: list(5, 40), newMode: str(40), instructionChars: { type: 'integer', minimum: 0, maximum: 20000 },
          changes: { type: 'array', maxItems: 5, items: { type: 'object', properties: { plugin: str(80), files: list(10, 120) }, required: ['plugin'] } },
          assumed: list(10, 300),
        },
        required: ['title', 'kind', 'purpose'],
        additionalProperties: false,
      },
      ...common,
      execute: safely(async (args, exec) => {
        mayBuild(exec);
        const folder = slugOf(args.title);
        if (!folder) throw new Error('Give the plugin a title made of words.');
        if (pluginOf(folder) || pluginOf(`@local/${folder}`)) throw new Error(`There is already a plugin called ${folder}. Pick another title.`);
        const state = conversation(exec);
        const plan = { ...planOf({ folder, kind: args.kind, tools: args.tools ?? [], commands: args.commands ?? [], tabs: args.tabs ?? [], slots: args.slots ?? [], services: args.services ?? [], storage: args.storage ?? [], instructionChars: args.instructionChars ?? 0, changes: args.changes ?? [], newMode: args.newMode ?? '' }) };
        const fit = fitCheck(plan, map());
        const brief = briefText({ title: args.title, kind: args.kind, purpose: args.purpose, must: args.must ?? [], mustNot: args.mustNot ?? [], answers: state.answers ?? {}, assumed: args.assumed ?? [], at: now() });
        const dir = buildDir(exec, folder);
        safeWrite(baseOf(exec), join(BUILD_FOLDER, folder, 'passport', 'brief.md'), brief);
        // The user's yes must come after this plan: a yes said before it does not count.
        Object.assign(state, { plan, fit, brief, folder, title: args.title, kind: args.kind, purpose: args.purpose, approved: false, planTurn: userCount(exec) });
        return `${planText(plan, fit)}\n\nThe brief is in ${BUILD_FOLDER}/${folder}/passport/brief.md; the plugin's files go in ${BUILD_FOLDER}/${folder}/.${fit.result === 'blocked' ? '\nThis plan is blocked: change it, or tell the user plainly why it cannot be built.' : '\nShow this plan to the user in plain words and wait for their yes; then creator_scaffold.'}`;
      }),
    },
    {
      name: 'creator_scaffold',
      description: 'Make the new plugin\'s first files from the approved plan, in its own folder inside this conversation\'s folder: a small plugin that already loads, is off until switched on, and passes its own tests (tests first). Existing files are kept. Needs the user\'s yes to the plan in their newest message (in a Long run the plan\'s assumptions are listed for the end instead).',
      parameters: { type: 'object', properties: { tool: str(60), method: str(3900) }, additionalProperties: false },
      ...common,
      execute: safely(async (args, exec) => {
        mayBuild(exec);
        const state = conversation(exec);
        if (!state.plan) throw new Error('There is no plan yet: creator_plan first.');
        if (state.fit?.result === 'blocked') throw new Error('The plan is blocked by the fit check; it cannot be built as it is.');
        const long = Boolean(longSince(exec));
        if (!state.approved && !long && !(userCount(exec) > Number(state.planTurn ?? Infinity) && saidYes(userSaid(exec)))) throw new Error('The user has not said yes to the plan in a message after it. Show the plan and ask.');
        state.approved = true;
        const tool = String(args.tool ?? state.plan.tools[0] ?? '');
        if (state.kind === 'tool' && !/^[a-z][a-z0-9]*_[a-z0-9_]+$/.test(tool)) throw new Error('A tool plugin needs a tool name like word_word.');
        const dir = buildDir(exec, state.folder);
        const files = scaffoldFiles({ folder: state.folder, title: state.title, description: state.purpose, kind: state.kind, tool, modeId: state.plan.newModes[0] ?? '', method: args.method ?? '' });
        const done = writeScaffold(dir, files, modules(), baseOf(exec));
        // Its passport: brief (kept), and the rest from its files.
        writePassport(join(dir, 'passport'), passportFiles({ scan: scanAddon(dir), origin: 'creator-plus', appVersion: map().app.version, at: now() }), baseOf(exec));
        return `Made ${BUILD_FOLDER}/${state.folder}: ${done.written.join(', ')}${done.kept.length ? `; kept as they were: ${done.kept.join(', ')}` : ''}. It loads, is off until switched on, and has its first tests. Now follow creator_recipe for "${state.kind}", then creator_check.${long ? ' (Long run: the plan was not approved by the user; its assumptions go on the list for the end.)' : ''}`;
      }),
    },
    {
      name: 'creator_check',
      description: 'The four checks on a plugin in this conversation\'s folder, in order: the harness loads it without errors, its tests pass, the fit check is clear, the trial install works (installed and loaded in the trial copy, never in the real setup). At Quick the trial install is left out; at Thorough a checker that only reads also reads the result.',
      parameters: { type: 'object', properties: { folder: str(80) }, required: ['folder'], additionalProperties: false },
      ...common,
      timeoutMs: 40 * 60_000,
      execute: safely(async (args, exec) => {
        mayBuild(exec);
        const dir = buildDir(exec, String(args.folder ?? ''));
        if (!existsSync(join(dir, 'package.json'))) throw new Error(`There is no plugin in ${args.folder}.`);
        const state = conversation(exec);
        const depth = depthOf(exec);
        // First a copy only the host can write: every check runs on it, and it is what Apply installs.
        const kept = join(ownFolder(checkedHome()), `${now()}-${Math.random().toString(36).slice(2, 8)}`, dir.split('/').pop());
        mkdirSync(dirname(kept), { mode: 0o700 });
        copyIn(dir, kept);
        const hashes = hashFiles(kept, filesOf(kept));
        const result = await fourChecks({ dir: kept, map: map(), intended: state.plan ?? {}, sandbox: inRun, trial: trial(), node: node(), skipTrial: depth === 'quick' });
        let second = '';
        if (depth === 'thorough' || longSince(exec)) {
          try {
            second = await reader(exec, `CREATOR_READER\nRead this plugin's brief and the results of its checks, and say in at most 8 lines whether it does what the brief asks, and what is missing. Answer with plain text; then one last line exactly: VERDICT: ok or VERDICT: missing.\n\n${fence(state.brief ?? readFileSync(join(dir, 'passport', 'brief.md'), 'utf8'), 'The brief')}\n\n${checksText(result)}`);
          } catch (error) {
            second = `(The second read could not run: ${String(error?.message ?? error).slice(0, 160)})`;
          }
        }
        if (result.passed) {
          // What the user installs is what was checked: the copy above, which no file tool and no sandbox can change.
          const scan = scanAddon(kept);
          const adds = [scan.tools.length ? `the tools ${scan.tools.join(', ')}` : '', scan.commands.length ? `the commands ${scan.commands.map((name) => `/${name}`).join(', ')}` : '', scan.modes.length ? `the tab ${scan.modes.join(', ')}` : '', scan.slots.length ? `places in the interface ${scan.slots.map((slot) => `${slot.name}#${slot.id}`).join(', ')}` : '', scan.routes.length ? `the page addresses ${scan.routes.join(', ')}` : ''].filter(Boolean).join('; ');
          cards.add({ kind: 'new-plugin', title: `${state.title ?? args.folder}: ready to install`, text: `All four checks passed. It adds ${adds || 'a Settings page'}.${scan.uses.length ? ` It uses the app's services ${scan.uses.join(', ')}.` : ''} Once installed, a plugin runs inside the app with the app's rights. The check of its code is a help, not a guarantee: a model can hide what code does, so read the code (Show the code) before Apply. Apply installs exactly the version that was checked (kept in Creator Plus's own folder); a way back is kept.`, conversation: conversation(exec).id, data: { folder: kept, from: dir, name: scan.name || `@local/${args.folder}`, hashes } });
          keepBuild(exec, { dir: kept, kept, scan, result, state, folder: String(args.folder ?? ''), key: dir });
        } else {
          rememberFailure(dir, kept, result);
          rmSync(dirname(kept), { recursive: true, force: true });
        }
        // The checks' output holds the plugin's own words and a test's output: material, masked.
        return `${fence(checksText(result), 'The checks\' results')}${second ? `\n\n${fence(second, 'Second read (a checker with no tools)')}` : ''}`;
      }),
    },
    {
      name: 'creator_change',
      description: 'Propose a change to an existing plugin selected on the bar: give the files and their whole new text. Creator Plus shows the change as a diff, backs the plugin up first, makes the change in a copy and runs that plugin\'s tests there. The real plugin changes only when the user presses Apply on the page. Built-in and third-party plugins are refused (build an adapter beside them).',
      parameters: { type: 'object', properties: { plugin: str(80), why: str(600), files: { type: 'object', additionalProperties: { type: 'string', maxLength: 400_000 } } }, required: ['plugin', 'why', 'files'], additionalProperties: false },
      ...common,
      execute: safely(async (args, exec) => {
        const plugin = need(exec, String(args.plugin ?? ''), 'change');
        const checked = checkChange({ plugin, files: args.files });
        if (!checked.ok) throw new Error(checked.why);
        const source = installedDir(plugin);
        if (!source) throw new Error(`${plugin.name}'s folder was not found.`);
        // The prepared copy is kept in Creator Plus's own folder, out of reach of the file tools and of the
        // sandbox; its tests run in a throwaway copy of it in the trial copy. Every changed file is hashed now.
        const prepared = prepareChange({ plugin, source, files: checked.files, backups: backups(), workDir: join(ownFolder(preparedHome()), `${now()}-${Math.random().toString(36).slice(2, 8)}`) });
        let tests = 'Its tests could not run here (an installed copy carries none; set the Plus folder on the Creator Plus page).';
        const src = sources()[plugin.name];
        if (src && existsSync(join(src, 'test'))) {
          const files = readdirSync(join(src, 'test')).filter((name) => name.endsWith('.test.mjs')).map((name) => `test/${name}`);
          const result = await inRun(prepared.copy, ({ run, at, trialHome }) => run(node(), ['--test', '--test-isolation=none', '--test-timeout=60000', ...files], { env: { DSH_HOME: trialHome }, cwd: at, timeoutMs: 600_000 }), { test: join(src, 'test') });
          tests = result.code === 0 ? `Its tests pass with the change (${/ℹ pass (\d+)/.exec(result.stdout)?.[1] ?? '?'}).` : `Its tests FAIL with the change: ${clip(String(result.stdout).trim().split('\n').slice(-4).join(' '), 300)}`;
        }
        // The whole change is kept beside the prepared copy (host-only) and shown on the card in full, unmasked
        // (it is the plugin's own code); one too long to show in full is not applied.
        const diffFile = join(dirname(prepared.copy), 'change.diff');
        writeFileSync(diffFile, prepared.diff, { flag: 'wx', mode: 0o600 });
        const cut = Buffer.byteLength(prepared.diff) > SHOW_MAX;
        cards.add({ kind: 'change', plugin: plugin.name, title: `Change ${plugin.name}: ${oneLine(args.why, 120)}`, text: `${oneLine(args.why, 400)}\n${prepared.summary}${cut ? '\nThis change is too long to show in full, so it cannot be applied from here.' : ''}\n${tests}`, conversation: conversation(exec).id, data: { copy: prepared.copy, backup: prepared.backup, files: Object.keys(checked.files), folder: plugin.folder, hashes: prepared.hashes, summary: prepared.summary, diffFile, cut } });
        return `The change to ${plugin.name}, made in a copy only (the plugin itself is untouched). ${prepared.summary}\n${fence(`${prepared.diff.slice(0, 6000)}\n\n${tests}`, 'The change and its tests')}\nBacked up first. It is a card on the Creator Plus page, with the change one click away: the user tries it in the trial copy or applies it there.`;
      }),
    },
    {
      name: 'creator_upkeep',
      description: 'Check after an update: compare the map with the one before (new, gone, updated, switched plugins, the app\'s version, tools that went away) and run every selected plugin\'s tests where they are. Reports what broke and the smallest fix first.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      ...common,
      timeoutMs: 60 * 60_000,
      execute: safely(async (_args, exec) => {
        const before = previousMap();
        const after = map(true);
        saveMap(after);
        const selected = new Set(bar(exec).selection);
        if (selected.size === 0) throw new Error('Select the plugins to check on the bar first (or pick "All" on purpose).');
        const all = sources();
        const chosen = Object.fromEntries(Object.entries(all).filter(([name]) => selected.size === 0 || selected.has(name)));
        const report = await upkeep({ before: before ?? after, after: { ...after, plugins: after.plugins.filter((plugin) => selected.size === 0 || selected.has(plugin.name)) }, sources: chosen, node: node(), sandbox: inRun });
        for (const result of report.results.filter((entry) => entry.ok === false)) cards.add({ kind: 'finding', plugin: result.plugin, title: `${result.plugin} broke after the update`, text: result.text, conversation: conversation(exec).id });
        return fence(upkeepText(report), 'Upkeep');
      }),
    },
    {
      name: 'creator_improve',
      description: 'Read the session logs of the selected plugins (since the bar\'s "Logs from") and make cards: what goes wrong, how often, the evidence. Masked; Recon only as structure (which step failed and the kind of error), never its text. Then propose fixes with creator_change and missing plugins with creator_note.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      ...common,
      timeoutMs: 30 * 60_000,
      execute: safely(async (_args, exec) => {
        const why = logRefusal(settingsOf().logReaders, placeOf(exec));
        if (why) throw new Error(why);
        const state = bar(exec);
        if (state.selection.length === 0) throw new Error('Select the plugins to improve on the bar first (or pick "All" on purpose).');
        const days = { 7: 7, 30: 30 }[state.logsFrom];
        const since = state.logsFrom === 'all' ? 0 : state.logsFrom === 'last' ? Number(conversation(exec).lastImprove ?? now() - 30 * 86_400_000) : now() - (days ?? 30) * 86_400_000;
        const found = await readLogs({ ...logsDeps(), since, wanted: state.selection });
        conversation(exec).lastImprove = now();
        const made = findingCards(found);
        for (const card of made) cards.add({ kind: 'finding', plugin: card.plugin, title: card.title, text: card.evidence.join('\n'), conversation: conversation(exec).id });
        if (made.length === 0) return `Read ${found.read} conversations; nothing went wrong for the selected plugins.${found.left.length ? ` Left out: ${found.left.length} (Recon exports and the like).` : ''}`;
        return fence(made.map((card) => `${card.title}\n${card.evidence.map((line) => `  - ${line}`).join('\n')}`).join('\n\n'), `Findings from ${found.read} conversations (cards on the Creator Plus page)`);
      }),
    },
    {
      name: 'creator_note',
      description: 'Put something on the list for the user, shown as a card on the Creator Plus page at the end: a question (with your recommendation), an assumption you made (a Long run never waits), a proposal (a change or a missing plugin), or a self-test score.',
      parameters: { type: 'object', properties: { kind: { type: 'string', enum: ['question', 'assumption', 'proposal', 'score'] }, text: str(1500), recommendation: str(600) }, required: ['kind', 'text'], additionalProperties: false },
      ...common,
      isConcurrencySafe: () => true,
      execute: safely(async (args, exec) => {
        cards.add({ kind: args.kind, title: `${args.kind === 'question' ? 'Question' : args.kind === 'assumption' ? 'Assumed' : args.kind === 'proposal' ? 'Proposal' : 'Self-test'}: ${oneLine(args.text, 140)}`, text: `${oneLine(args.text, 1500)}${args.recommendation ? `\nRecommended: ${oneLine(args.recommendation, 600)}` : ''}`, conversation: conversation(exec).id });
        return 'Noted on the list for the user.';
      }),
    },
    {
      name: 'creator_handoff',
      description: 'When a build is beyond Creator Plus: write a brief for an outside coding agent (the plan, the part of the map that matters, what was tried and failed, the rules) into this conversation\'s folder.',
      parameters: { type: 'object', properties: { title: str(80), goal: str(600), failed: list(20, 400) }, required: ['title', 'goal'], additionalProperties: false },
      ...common,
      execute: safely(async (args, exec) => {
        const state = conversation(exec);
        const base = baseOf(exec);
        const dir = safeDir(base, BUILD_FOLDER);
        const text = handoffText({ title: args.title, goal: args.goal, brief: state.brief ?? '', planText: state.plan ? planText(state.plan, state.fit ?? { result: 'clear', findings: [] }) : '', mapPart: mapText(map(), bar(exec).selection), failed: args.failed ?? [], folder: state.folder ? join(dir, state.folder) : dir });
        // Never over an earlier hand-off: a new file next to it.
        const file = existsSync(join(dir, 'HANDOFF.md')) ? `HANDOFF-${new Date(now()).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}.md` : 'HANDOFF.md';
        safeWrite(base, join(BUILD_FOLDER, file), text, { fresh: true });
        cards.add({ kind: 'proposal', title: `Hand-off written: ${oneLine(args.title, 100)}`, text: `For an outside coding agent: ${BUILD_FOLDER}/${file} in this conversation's folder.`, conversation: state.id });
        return `Wrote ${BUILD_FOLDER}/${file} in this conversation's folder. Tell the user where it is and why the build needs an outside agent.`;
      }),
    },
    {
      name: 'creator_learn',
      description: 'Propose something for Creator Plus to keep: a preference (the user\'s usual answer to an interview question; key = the question id), a pattern (how things are built here) or a lesson (a mistake not to repeat). It is kept only when the user presses Keep on the Creator Plus page.',
      parameters: { type: 'object', properties: { kind: { type: 'string', enum: ['preference', 'pattern', 'lesson'] }, key: str(60), text: str(600), reason: str(400), fromThirdParty: { type: 'boolean' } }, required: ['kind', 'text', 'reason'], additionalProperties: false },
      ...common,
      execute: safely(async (args) => {
        const entry = learning.propose({ kind: args.kind, key: args.key ?? '', text: args.text, reason: args.reason, from: 'conversation', thirdParty: args.fromThirdParty === true });
        return `Proposed (${entry.kind}): "${entry.text}". It is kept only when the user presses Keep on the Creator Plus page.`;
      }),
    },
    {
      name: 'creator_selftest',
      description: 'Run the code parts of Creator Plus\'s eight self-tests (Collision, Change, Update, Long run, Scope, and the code part of Improve) in a throwaway folder, and give the prompts of the parts only a model can do (Rebuild, Look, Improve).',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      ...common,
      execute: safely(async () => {
        const results = await runCodeParts();
        return [`Self-test, code parts: ${scoreText(results)}`, ...results.map((result) => `- ${result.label}: ${result.ok === true ? 'passed' : result.ok === false ? 'FAILED' : 'needs a model'}. ${result.text}`), '', 'Model parts (run each on the model being scored, then note the result with creator_note kind score):', ...Object.entries(MODEL_PROMPTS).map(([id, prompt]) => `- ${id}: ${prompt}`)].join('\n');
      }),
    },
  ];
}
