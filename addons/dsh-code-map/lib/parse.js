/**
 * Light, dependency-free outlines of source files.
 *
 * Each parser reads a file line by line with regular expressions and returns its
 * symbols (name, kind, first and last line, a one-line signature) and its imports.
 * This is not a compiler: it is right for ordinary, conventionally formatted code
 * and may miss unusual constructs. It never executes anything.
 */

/** Language by file extension. */
const EXT_LANG = {
  js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', jsx: 'JavaScript',
  ts: 'TypeScript', tsx: 'TypeScript', mts: 'TypeScript', cts: 'TypeScript',
  py: 'Python', pyi: 'Python', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin', kts: 'Kotlin',
  c: 'C', h: 'C', cc: 'C++', cpp: 'C++', cxx: 'C++', hpp: 'C++', hh: 'C++', hxx: 'C++', m: 'Objective-C', mm: 'Objective-C',
  swift: 'Swift', rb: 'Ruby', rake: 'Ruby', php: 'PHP', cs: 'C#',
  sh: 'Shell', bash: 'Shell', zsh: 'Shell', command: 'Shell',
  md: 'Markdown', markdown: 'Markdown', mdx: 'Markdown',
  json: 'JSON', yml: 'YAML', yaml: 'YAML', toml: 'TOML', xml: 'XML', html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'CSS',
  sql: 'SQL', vue: 'Vue', svelte: 'Svelte', lua: 'Lua', dart: 'Dart', scala: 'Scala', ex: 'Elixir', exs: 'Elixir',
  r: 'R', pl: 'Perl', tf: 'Terraform', proto: 'Protobuf', graphql: 'GraphQL', gradle: 'Gradle', txt: 'Text',
};

/** Languages whose files are source code (used for "is this a code project" and for statistics). */
export const CODE_LANGS = new Set([
  'JavaScript', 'TypeScript', 'Python', 'Go', 'Rust', 'Java', 'Kotlin', 'C', 'C++', 'Objective-C', 'Swift', 'Ruby',
  'PHP', 'C#', 'Shell', 'Vue', 'Svelte', 'Lua', 'Dart', 'Scala', 'Elixir', 'SQL',
]);

const MAX_SYMBOLS = 400;
const SIG_LIMIT = 140;

/**
 * The language of a file, from its name.
 * @param {string} rel - path of the file.
 * @param {string} [firstLine] - first line of the file, for scripts with no extension.
 * @returns {string} language name, or 'Other'.
 */
export function languageOf(rel, firstLine = '') {
  const name = rel.slice(rel.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (EXT_LANG[ext]) return EXT_LANG[ext];
  if (name === 'Makefile' || name === 'makefile' || name === 'GNUmakefile') return 'Makefile';
  if (name === 'Dockerfile' || name.startsWith('Dockerfile.')) return 'Dockerfile';
  if (name === 'Rakefile' || name === 'Gemfile') return 'Ruby';
  if (/^#!.*\b(ba|z|k)?sh\b/.test(firstLine)) return 'Shell';
  if (/^#!.*\bpython/.test(firstLine)) return 'Python';
  if (/^#!.*\bnode\b/.test(firstLine)) return 'JavaScript';
  if (/^#!.*\bruby\b/.test(firstLine)) return 'Ruby';
  return 'Other';
}

/** @param {string} line @returns {number} width of the leading white space (a tab counts as 4). */
function indentOf(line) {
  let width = 0;
  for (const char of line) {
    if (char === ' ') width += 1;
    else if (char === '\t') width += 4;
    else break;
  }
  return width;
}

/** @param {string} line @returns {string} a tidy one-line signature. */
function signature(line) {
  const text = line.trim().replace(/\s+/g, ' ').replace(/\s*[{:]\s*$/, '');
  return text.length > SIG_LIMIT ? `${text.slice(0, SIG_LIMIT - 1)}…` : text;
}

/**
 * Remove string and comment content from one line, so braces inside them are not counted.
 * @param {string} line - source line.
 * @returns {string} the line with strings emptied and a trailing line comment removed.
 */
function bare(line) {
  return line
    .replace(/\\./g, '')
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""')
    .replace(/\/\/.*$/, '')
    .replace(/\/\*.*?\*\//g, '');
}

/**
 * The last line of a block that opens with `{` on or after a given line.
 * @param {string[]} lines - file lines.
 * @param {number} start - index of the line the symbol starts on.
 * @returns {number} index of the line with the matching `}`, or `start` when no block opens within a few lines.
 */
function braceEnd(lines, start) {
  let depth = 0;
  let opened = false;
  let parens = 0;
  const last = Math.min(lines.length, start + 4000);
  for (let i = start; i < last; i += 1) {
    const text = bare(lines[i]);
    for (let c = 0; c < text.length; c += 1) {
      const char = text[c];
      if (!opened) {
        if (char === '(') parens += 1;
        else if (char === ')') parens = Math.max(0, parens - 1);
        else if (char === '{' && parens > 0) {
          // A brace pair that opens and closes inside the parameter list on one line
          // (a default value such as `options = {}`) is not the body.
          let inner = 1;
          let close = -1;
          for (let d = c + 1; d < text.length; d += 1) {
            if (text[d] === '{') inner += 1;
            else if (text[d] === '}') {
              inner -= 1;
              if (inner === 0) {
                close = d;
                break;
              }
            }
          }
          if (close >= 0) {
            c = close;
            continue;
          }
        }
      }
      if (char === '{') {
        depth += 1;
        opened = true;
      } else if (char === '}' && opened) {
        depth -= 1;
        if (depth <= 0) return i;
      }
    }
    // A declaration that ends before any block opens (`type X = …;`, a prototype) is one statement.
    if (!opened && parens === 0 && /;\s*$/.test(text)) return i;
    // A declaration with no body at all (`data class User(val id: Int)`): the line is complete
    // and the next line does not carry it on.
    if (!opened && parens === 0 && !/[,(\[=:+\-*|&<.\\]\s*$/.test(text)) {
      const next = (lines[i + 1] ?? '').trim();
      if (!/^(\{|throws\b|where\b|:|->|=>|\.|extends\b|implements\b|noexcept\b|const\b|override\b)/.test(next)) return i;
    }
    if (!opened && i - start > 8) return start;
  }
  return opened ? last - 1 : start;
}

/**
 * The last line of an indented block (Python style).
 * @param {string[]} lines - file lines.
 * @param {number} start - index of the line the block starts on.
 * @returns {number} index of the block's last non-empty line.
 */
function indentEnd(lines, start) {
  const base = indentOf(lines[start]);
  let end = start;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '') continue;
    if (indentOf(lines[i]) <= base) break;
    end = i;
  }
  return end;
}

/**
 * The last line of a Ruby-style block closed by `end` at the same indentation.
 * @param {string[]} lines - file lines.
 * @param {number} start - index of the opening line.
 * @returns {number} index of the closing line.
 */
function endKeywordEnd(lines, start) {
  const base = indentOf(lines[start]);
  for (let i = start + 1; i < lines.length; i += 1) {
    if (indentOf(lines[i]) === base && /^\s*end\b/.test(lines[i])) return i;
  }
  return start;
}

/** A collector with the per-file symbol cap. */
function collector() {
  const symbols = [];
  return {
    symbols,
    /**
     * @param {string} name - symbol name.
     * @param {string} kind - function, method, class, type, const, heading…
     * @param {number} line - zero-based first line.
     * @param {number} end - zero-based last line.
     * @param {string} sig - one-line signature.
     * @param {string} [parent] - enclosing class or type.
     */
    add(name, kind, line, end, sig, parent) {
      if (symbols.length >= MAX_SYMBOLS || !name) return;
      symbols.push({ name, kind, line: line + 1, end: Math.max(line, end) + 1, sig, ...(parent ? { parent } : {}) });
    },
  };
}

const JS_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'else', 'do', 'try', 'new', 'await', 'typeof', 'super', 'constructor_']);

/** JavaScript and TypeScript (ESM and CommonJS, JSX and TSX). */
function parseJs(lines, text) {
  const out = collector();
  const imports = new Set();
  for (const regex of [
    /(?:^|\n)\s*(?:import|export)\b[^;'"`]*?\bfrom\s*['"]([^'"\n]+)['"]/g,
    /(?:^|\n)\s*import\s*['"]([^'"\n]+)['"]/g,
    /\brequire\(\s*['"]([^'"\n]+)['"]\s*\)/g,
    /\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  ]) {
    for (const match of text.matchAll(regex)) imports.add(match[1]);
  }
  /** Open classes: `{ name, end }`, innermost last. */
  const classes = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.length > 600) continue;
    while (classes.length > 0 && i > classes[classes.length - 1].end) classes.pop();
    let match;
    if ((match = /^\s*(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*[(<]/.exec(line))) {
      out.add(match[1], 'function', i, braceEnd(lines, i), signature(line));
    } else if ((match = /^\s*(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(line))) {
      const end = braceEnd(lines, i);
      out.add(match[1], 'class', i, end, signature(line));
      classes.push({ name: match[1], end });
    } else if ((match = /^\s*(?:export\s+)?(?:declare\s+)?(?:const\s+)?(interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/.exec(line))) {
      out.add(match[2], 'type', i, braceEnd(lines, i), signature(line));
    } else if ((match = /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*(?::[^=]+)?=>|[A-Za-z_$][\w$]*\s*=>)/.exec(line))) {
      out.add(match[1], 'function', i, braceEnd(lines, i), signature(line));
    } else if ((match = /^(?:export\s+)(?:const|let|var)\s+([A-Za-z_$][\w$]*)/.exec(line))) {
      out.add(match[1], 'const', i, braceEnd(lines, i), signature(line));
    } else if ((match = /^(?:const|let|var)\s+([A-Z][A-Z0-9_]{2,})\s*=/.exec(line))) {
      out.add(match[1], 'const', i, braceEnd(lines, i), signature(line));
    } else if ((match = /^\s*(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/.exec(line))) {
      out.add(match[1], 'export', i, braceEnd(lines, i), signature(line));
    } else if (
      classes.length > 0 &&
      (match = /^\s+(?:(?:public|private|protected|static|async|override|readonly|abstract|get|set)\s+)*(?:\*\s*)?(#?[A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\([^)]*\)?[^;=]*\{?\s*$/.exec(line)) &&
      !JS_KEYWORDS.has(match[1]) &&
      /[{(,]\s*$|\)\s*(?::[^;]+)?\s*$/.test(line)
    ) {
      out.add(match[1], 'method', i, braceEnd(lines, i), signature(line), classes[classes.length - 1].name);
    }
  }
  return { symbols: out.symbols, imports: [...imports] };
}

/** Python. */
function parsePython(lines) {
  const out = collector();
  const imports = new Set();
  const classes = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '' || line.length > 600) continue;
    const indent = indentOf(line);
    while (classes.length > 0 && (i > classes[classes.length - 1].end)) classes.pop();
    let match;
    if ((match = /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/.exec(line)) && indent <= 12) {
      const parent = classes.length > 0 && indent > classes[classes.length - 1].indent ? classes[classes.length - 1].name : undefined;
      out.add(match[1], parent ? 'method' : 'function', i, indentEnd(lines, i), signature(line), parent);
    } else if ((match = /^\s*class\s+([A-Za-z_]\w*)/.exec(line)) && indent <= 8) {
      const end = indentEnd(lines, i);
      out.add(match[1], 'class', i, end, signature(line));
      classes.push({ name: match[1], end, indent });
    } else if ((match = /^([A-Z][A-Z0-9_]{2,})\s*(?::[^=]+)?=/.exec(line))) {
      out.add(match[1], 'const', i, i, signature(line));
    } else if ((match = /^\s*from\s+(\.*[\w.]*)\s+import\b/.exec(line))) {
      imports.add(match[1]);
    } else if ((match = /^\s*import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/.exec(line))) {
      for (const name of match[1].split(',')) imports.add(name.trim());
    }
  }
  return { symbols: out.symbols, imports: [...imports] };
}

/** Go. */
function parseGo(lines) {
  const out = collector();
  const imports = new Set();
  let inImport = false;
  let pkg;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    let match;
    if (inImport) {
      if (/^\s*\)/.test(line)) inImport = false;
      else if ((match = /"([^"]+)"/.exec(line))) imports.add(match[1]);
      continue;
    }
    if ((match = /^package\s+(\w+)/.exec(line))) pkg = match[1];
    else if (/^import\s*\(/.test(line)) inImport = true;
    else if ((match = /^import\s+(?:\w+\s+)?"([^"]+)"/.exec(line))) imports.add(match[1]);
    else if ((match = /^func\s+\(\s*\w*\s*\*?\s*([\w.]+)[^)]*\)\s*(\w+)\s*[(\[]/.exec(line))) {
      out.add(match[2], 'method', i, braceEnd(lines, i), signature(line), match[1]);
    } else if ((match = /^func\s+(\w+)\s*[(\[]/.exec(line))) {
      out.add(match[1], 'function', i, braceEnd(lines, i), signature(line));
    } else if ((match = /^type\s+(\w+)\s+(\w+)?/.exec(line))) {
      out.add(match[1], 'type', i, braceEnd(lines, i), signature(line));
    } else if ((match = /^(?:var|const)\s+(\w+)\b/.exec(line))) {
      out.add(match[1], 'const', i, i, signature(line));
    }
  }
  return { symbols: out.symbols, imports: [...imports], pkg };
}

/** Rust. */
function parseRust(lines) {
  const out = collector();
  const imports = new Set();
  const impls = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.length > 600) continue;
    while (impls.length > 0 && i > impls[impls.length - 1].end) impls.pop();
    let match;
    if ((match = /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:default\s+)?(?:const\s+)?(?:async\s+)?(?:unsafe\s+)?(?:extern\s+"[^"]*"\s+)?fn\s+(\w+)/.exec(line))) {
      const parent = impls.length > 0 ? impls[impls.length - 1].name : undefined;
      out.add(match[1], parent ? 'method' : 'function', i, braceEnd(lines, i), signature(line), parent);
    } else if ((match = /^\s*(?:pub(?:\([^)]*\))?\s+)?(struct|enum|trait|union|type)\s+(\w+)/.exec(line))) {
      const end = braceEnd(lines, i);
      out.add(match[2], match[1] === 'trait' ? 'class' : 'type', i, end, signature(line));
      if (match[1] === 'trait') impls.push({ name: match[2], end });
    } else if ((match = /^\s*impl(?:\s*<[^>]*>)?\s+(?:[\w:<>,' ]+?\s+for\s+)?([A-Za-z_]\w*)/.exec(line))) {
      impls.push({ name: match[1], end: braceEnd(lines, i) });
    } else if ((match = /^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;/.exec(line))) {
      imports.add(`mod:${match[1]}`);
    } else if ((match = /^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+([^;{]+)/.exec(line))) {
      imports.add(match[1].trim().replace(/::\*$/, '').replace(/::$/, ''));
    } else if ((match = /^(?:pub(?:\([^)]*\))?\s+)?(?:const|static)\s+(\w+)\s*:/.exec(line))) {
      out.add(match[1], 'const', i, i, signature(line));
    } else if ((match = /^\s*macro_rules!\s+(\w+)/.exec(line))) {
      out.add(match[1], 'macro', i, braceEnd(lines, i), signature(line));
    }
  }
  return { symbols: out.symbols, imports: [...imports] };
}

const JVM_NOT_METHOD = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'new', 'else', 'try', 'throw', 'synchronized', 'do', 'using', 'lock', 'foreach', 'when']);

/** Java, Kotlin and C# share most of their shape. */
function parseJvmLike(lines, lang) {
  const out = collector();
  const imports = new Set();
  const types = [];
  let pkg;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.length > 600) continue;
    while (types.length > 0 && i > types[types.length - 1].end) types.pop();
    let match;
    if ((match = /^\s*package\s+([\w.]+)/.exec(line))) pkg = match[1];
    else if ((match = /^\s*namespace\s+([\w.]+)/.exec(line))) pkg = match[1];
    else if ((match = /^\s*import\s+(?:static\s+)?([\w.]+)/.exec(line))) imports.add(match[1]);
    else if (lang === 'C#' && (match = /^\s*using\s+(?:static\s+)?([\w.]+)\s*;/.exec(line))) imports.add(match[1]);
    else if ((match = /^\s*(?:(?:public|private|protected|internal|static|final|abstract|sealed|open|data|inner|partial|value|annotation|enum|companion)\s+)*(class|interface|enum|record|object|struct)\s+([A-Za-z_]\w*)/.exec(line))) {
      const end = braceEnd(lines, i);
      out.add(match[2], 'class', i, end, signature(line), types.length > 0 ? types[types.length - 1].name : undefined);
      types.push({ name: match[2], end });
    } else if (lang === 'Kotlin' && (match = /^\s*(?:(?:public|private|protected|internal|override|open|abstract|suspend|inline|operator|infix|tailrec|external)\s+)*fun\s+(?:<[^>]+>\s*)?(?:[\w.<>?, ]+\.)?([A-Za-z_]\w*)\s*\(/.exec(line))) {
      const parent = types.length > 0 ? types[types.length - 1].name : undefined;
      out.add(match[1], parent ? 'method' : 'function', i, braceEnd(lines, i), signature(line), parent);
    } else if (
      lang !== 'Kotlin' &&
      types.length > 0 &&
      (match = /^\s+(?:(?:public|private|protected|internal|static|final|abstract|synchronized|native|default|virtual|override|async|sealed|extern|unsafe|new|partial)\s+)+[\w<>\[\],.? ]+?\s+([A-Za-z_]\w*)\s*\([^;]*$/.exec(line)) &&
      !JVM_NOT_METHOD.has(match[1])
    ) {
      out.add(match[1], 'method', i, braceEnd(lines, i), signature(line), types[types.length - 1].name);
    } else if (
      lang !== 'Kotlin' &&
      types.length > 0 &&
      (match = /^\s+(?:public|private|protected|internal)\s+([A-Z]\w*)\s*\([^;]*$/.exec(line)) &&
      match[1] === types[types.length - 1].name
    ) {
      out.add(match[1], 'method', i, braceEnd(lines, i), signature(line), match[1]);
    }
  }
  return { symbols: out.symbols, imports: [...imports], pkg };
}

const C_NOT_FUNCTION = new Set(['if', 'for', 'while', 'switch', 'return', 'else', 'do', 'sizeof', 'defined', 'case', 'catch', 'typedef', 'using', 'namespace', 'template', 'operator', 'static_assert', 'alignas']);

/** C, C++ and Objective-C, sources and headers. */
function parseC(lines, rel) {
  const out = collector();
  const imports = new Set();
  const header = /\.(h|hh|hpp|hxx)$/i.test(rel);
  let objc;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.length > 600) continue;
    let match;
    if ((match = /^\s*#\s*(?:include|import)\s*"([^"]+)"/.exec(line))) imports.add(match[1]);
    else if ((match = /^\s*#\s*(?:include|import)\s*<([^>]+)>/.exec(line))) imports.add(`<${match[1]}>`);
    else if ((match = /^\s*#\s*define\s+([A-Za-z_]\w*)/.exec(line))) {
      if (!/_H(PP)?_*$/.test(match[1])) out.add(match[1], 'macro', i, i, signature(line));
    } else if ((match = /^@(interface|implementation|protocol)\s+(\w+)/.exec(line))) {
      objc = match[2];
      if (match[1] !== 'implementation') out.add(match[2], 'class', i, i, signature(line));
    } else if (/^@end\b/.test(line)) objc = undefined;
    else if (objc && (match = /^[-+]\s*\([^)]*\)\s*([A-Za-z_]\w*)/.exec(line))) {
      out.add(match[1], 'method', i, braceEnd(lines, i), signature(line), objc);
    } else if ((match = /^\s*(?:typedef\s+)?(?:template\s*<[^>]*>\s*)?(class|struct|enum(?:\s+class)?|union|namespace)\s+([A-Za-z_]\w*)\s*(?:final\s*)?(?::[^;{]*)?\{?\s*$/.exec(line))) {
      out.add(match[2], match[1] === 'namespace' ? 'namespace' : 'type', i, braceEnd(lines, i), signature(line));
    } else if ((match = /^typedef\b.*?\b([A-Za-z_]\w*)\s*;\s*$/.exec(line))) {
      out.add(match[1], 'type', i, i, signature(line));
    } else if (
      /^[A-Za-z_~]/.test(line) &&
      (match = /^(?:[\w:*&<>,~\s]+?[\s*&])??((?:[A-Za-z_]\w*::)*~?[A-Za-z_]\w*)\s*\([^;{}]*\)?\s*(?:const\s*)?(?:noexcept\s*)?(?:override\s*)?(\{|;)?\s*$/.exec(line)) &&
      !C_NOT_FUNCTION.has(match[1]) &&
      !/^(return|else|typedef|using|#)/.test(line) &&
      /\(/.test(line)
    ) {
      const declared = match[2] === ';';
      // In a source file only definitions count; a header also lists declarations.
      if (declared && !header) continue;
      if (!declared && !match[2] && !/\{\s*$/.test(lines[i + 1] ?? '') && !/[,(]\s*$/.test(line)) continue;
      const name = match[1];
      const split = name.lastIndexOf('::');
      out.add(split > 0 ? name.slice(split + 2) : name, split > 0 ? 'method' : 'function', i, declared ? i : braceEnd(lines, i), signature(line), split > 0 ? name.slice(0, split) : undefined);
    }
  }
  return { symbols: out.symbols, imports: [...imports] };
}

/** Swift. */
function parseSwift(lines) {
  const out = collector();
  const imports = new Set();
  const types = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.length > 600) continue;
    while (types.length > 0 && i > types[types.length - 1].end) types.pop();
    let match;
    if ((match = /^\s*import\s+(?:\w+\s+)?([\w.]+)/.exec(line))) imports.add(match[1]);
    else if ((match = /^\s*(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:public|private|fileprivate|internal|open|final|indirect)\s+)*(class|struct|enum|protocol|extension|actor)\s+([A-Za-z_][\w.]*)/.exec(line))) {
      const end = braceEnd(lines, i);
      if (match[1] !== 'extension') out.add(match[2], 'class', i, end, signature(line));
      types.push({ name: match[2], end });
    } else if ((match = /^\s*(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:public|private|fileprivate|internal|open|final|static|class|override|mutating|nonisolated|convenience|required)\s+)*(?:func\s+([A-Za-z_]\w*|[+\-*/=<>!]+)|(init)\??)\s*[(<]/.exec(line))) {
      const parent = types.length > 0 ? types[types.length - 1].name : undefined;
      out.add(match[1] ?? match[2], parent ? 'method' : 'function', i, braceEnd(lines, i), signature(line), parent);
    }
  }
  return { symbols: out.symbols, imports: [...imports] };
}

/** Ruby. */
function parseRuby(lines) {
  const out = collector();
  const imports = new Set();
  const types = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    while (types.length > 0 && i > types[types.length - 1].end) types.pop();
    let match;
    if ((match = /^\s*require_relative\s+['"]([^'"]+)['"]/.exec(line))) imports.add(`./${match[1]}`);
    else if ((match = /^\s*(?:require|load)\s+['"]([^'"]+)['"]/.exec(line))) imports.add(match[1]);
    else if ((match = /^\s*(class|module)\s+([A-Z][\w:]*)/.exec(line))) {
      const end = endKeywordEnd(lines, i);
      out.add(match[2], 'class', i, end, signature(line));
      types.push({ name: match[2], end });
    } else if ((match = /^\s*def\s+(?:self\.)?([A-Za-z_]\w*[?!=]?|[+\-*/<=>\[\]!]+)/.exec(line))) {
      const parent = types.length > 0 ? types[types.length - 1].name : undefined;
      out.add(match[1], parent ? 'method' : 'function', i, endKeywordEnd(lines, i), signature(line), parent);
    }
  }
  return { symbols: out.symbols, imports: [...imports] };
}

/** PHP. */
function parsePhp(lines) {
  const out = collector();
  const imports = new Set();
  const types = [];
  let pkg;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.length > 600) continue;
    while (types.length > 0 && i > types[types.length - 1].end) types.pop();
    let match;
    if ((match = /^\s*namespace\s+([\w\\]+)/.exec(line))) pkg = match[1].replace(/\\/g, '.');
    else if ((match = /^\s*use\s+(?:function\s+|const\s+)?([\w\\]+)/.exec(line)) && types.length === 0) imports.add(match[1].replace(/\\/g, '.'));
    else if ((match = /^\s*(?:require|include)(?:_once)?\s*\(?\s*(?:__DIR__\s*\.\s*)?['"]([^'"]+)['"]/.exec(line))) imports.add(match[1].startsWith('/') ? `.${match[1]}` : match[1]);
    else if ((match = /^\s*(?:(?:abstract|final|readonly)\s+)*(class|interface|trait|enum)\s+([A-Za-z_]\w*)/.exec(line))) {
      const end = braceEnd(lines, i);
      out.add(match[2], 'class', i, end, signature(line));
      types.push({ name: match[2], end });
    } else if ((match = /^\s*(?:(?:public|private|protected|static|abstract|final)\s+)*function\s+&?\s*([A-Za-z_]\w*)\s*\(/.exec(line))) {
      const parent = types.length > 0 ? types[types.length - 1].name : undefined;
      out.add(match[1], parent ? 'method' : 'function', i, braceEnd(lines, i), signature(line), parent);
    }
  }
  return { symbols: out.symbols, imports: [...imports], pkg };
}

/** Shell scripts. */
function parseShell(lines) {
  const out = collector();
  const imports = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    let match;
    if ((match = /^\s*(?:function\s+([A-Za-z_][\w:-]*)\s*(?:\(\s*\))?|([A-Za-z_][\w:-]*)\s*\(\s*\))\s*\{?\s*(?:#.*)?$/.exec(line))) {
      out.add(match[1] ?? match[2], 'function', i, braceEnd(lines, i), signature(line));
    } else if ((match = /^\s*(?:source|\.)\s+["']?([^\s"';|&]+)/.exec(line))) {
      imports.add(match[1]);
    }
  }
  return { symbols: out.symbols, imports: [...imports] };
}

/** Markdown headings, levels one to three, outside code fences. */
function parseMarkdown(lines) {
  const out = collector();
  let fenced = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*(```|~~~)/.test(lines[i])) fenced = !fenced;
    if (fenced) continue;
    const match = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(lines[i]);
    if (match) out.add(match[2].slice(0, 100), `h${match[1].length}`, i, i, signature(lines[i]));
  }
  // A heading runs until the next heading of the same or a higher level.
  const symbols = out.symbols;
  for (let n = 0; n < symbols.length; n += 1) {
    const level = Number(symbols[n].kind.slice(1));
    let end = lines.length;
    for (let m = n + 1; m < symbols.length; m += 1) {
      if (Number(symbols[m].kind.slice(1)) <= level) {
        end = symbols[m].line - 1;
        break;
      }
    }
    symbols[n].end = Math.max(symbols[n].line, end);
  }
  return { symbols, imports: [] };
}

/**
 * The first comment or heading of a file, as a one-line note.
 * @param {string[]} lines - file lines.
 * @returns {string} the note, or an empty string.
 */
function firstNote(lines) {
  for (let i = 0; i < Math.min(lines.length, 40); i += 1) {
    const text = lines[i].trim();
    if (text === '' || text.startsWith('#!') || /^(\/\*+|\*\/|"""|'''|<!--|-->|---)$/.test(text)) continue;
    const match = /^(?:\/\/+|#+|\*+|\/\*+|--|;+|"""|'''|<!--)\s*(.+?)\s*(?:\*\/|-->|"""|''')?$/.exec(text);
    if (match && /[A-Za-z]{3}/.test(match[1]) && !/^(eslint|@ts-|prettier|pylint|noqa|coding[:=]|-\*-|SPDX|Copyright|\(c\)|@flow|vim:)/i.test(match[1])) {
      return match[1].replace(/\s+/g, ' ').slice(0, 160);
    }
    if (!match) break;
  }
  return '';
}

/**
 * Whether file content looks minified or generated (very long lines).
 * @param {string} text - file content.
 * @returns {boolean} true when it should not be outlined.
 */
export function looksMinified(text) {
  if (text.length < 4000) return false;
  let lines = 1;
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) lines += 1;
  return text.length / lines > 400;
}

/**
 * Outline one file.
 * @param {string} rel - path of the file relative to the project root, with forward slashes.
 * @param {string} text - file content.
 * @returns {{lang: string, lines: number, symbols: object[], imports: string[], note: string, pkg?: string}} the outline.
 */
export function parseFile(rel, text) {
  const lines = text.split('\n');
  const lang = languageOf(rel, lines[0] ?? '');
  let result = { symbols: [], imports: [] };
  try {
    if (looksMinified(text)) result = { symbols: [], imports: [] };
    else if (lang === 'JavaScript' || lang === 'TypeScript' || lang === 'Vue' || lang === 'Svelte') result = parseJs(lines, text);
    else if (lang === 'Python') result = parsePython(lines);
    else if (lang === 'Go') result = parseGo(lines);
    else if (lang === 'Rust') result = parseRust(lines);
    else if (lang === 'Java' || lang === 'Kotlin' || lang === 'C#' || lang === 'Scala' || lang === 'Dart') result = parseJvmLike(lines, lang);
    else if (lang === 'C' || lang === 'C++' || lang === 'Objective-C') result = parseC(lines, rel);
    else if (lang === 'Swift') result = parseSwift(lines);
    else if (lang === 'Ruby') result = parseRuby(lines);
    else if (lang === 'PHP') result = parsePhp(lines);
    else if (lang === 'Shell') result = parseShell(lines);
    else if (lang === 'Markdown') result = parseMarkdown(lines);
  } catch {
    // A file a parser cannot handle is still listed, without an outline.
    result = { symbols: [], imports: [] };
  }
  return {
    lang,
    lines: lines.length,
    symbols: result.symbols,
    imports: result.imports.slice(0, 200),
    note: firstNote(lines),
    ...(result.pkg ? { pkg: result.pkg } : {}),
  };
}
