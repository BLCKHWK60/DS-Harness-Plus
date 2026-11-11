/**
 * A small, safe calculator for formulas in `x`, used to plot functions.
 * It never runs code: the formula is read into a tree and worked out from that.
 *
 * Understood: numbers, x, + - * / ^, brackets, pi, e, and the functions
 * sin cos tan asin acos atan sinh cosh tanh sqrt cbrt abs exp ln log (base 10)
 * log2 floor ceil round sign. `2x`, `3(x+1)` and `2sin(x)` mean multiplication.
 */

const FUNCTIONS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
  exp: Math.exp, ln: Math.log, log: Math.log10, log2: Math.log2, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
};
const CONSTANTS = { pi: Math.PI, e: Math.E };

function tokens(source) {
  const out = [];
  const text = String(source).replace(/\s+/g, '').replace(/\*\*/g, '^').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi');
  for (let i = 0; i < text.length;) {
    const rest = text.slice(i);
    const number = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(rest);
    // "2e" followed by a letter is 2 times e, not a number in scientific form.
    if (number && !(number[2] === undefined && /^(\d+\.?\d*|\.\d+)e[+-]?$/i.test(number[0]))) {
      out.push({ type: 'num', value: Number(number[0]) });
      i += number[0].length;
      continue;
    }
    const name = /^[a-z][a-z0-9]*/i.exec(rest);
    if (name) {
      out.push({ type: 'name', value: name[0].toLowerCase() });
      i += name[0].length;
      continue;
    }
    if ('+-*/^(),'.includes(text[i])) {
      out.push({ type: text[i] });
      i += 1;
      continue;
    }
    throw new Error(`"${text[i]}" is not understood in the formula.`);
  }
  return out;
}

/**
 * Read a formula.
 * @param {string} source - for example `x^2 - 3` or `2sin(x)/x`.
 * @returns {(x: number) => number} the function; gives NaN where it has no value.
 */
export function compile(source) {
  if (typeof source !== 'string' || source.trim() === '' || source.length > 200) throw new Error('Give a formula in x, at most 200 characters.');
  const list = tokens(source.replace(/^\s*(y|f\(x\))\s*=/i, ''));
  let at = 0;
  const peek = () => list[at];
  const take = (type) => {
    if (peek()?.type !== type) throw new Error(`The formula "${source}" is not complete or has a bracket missing.`);
    return list[at++];
  };
  const startsValue = (token) => token && (token.type === 'num' || token.type === 'name' || token.type === '(');

  function sum() {
    let left = product();
    while (peek()?.type === '+' || peek()?.type === '-') {
      const op = list[at++].type;
      const right = product();
      const a = left;
      left = op === '+' ? (x) => a(x) + right(x) : (x) => a(x) - right(x);
    }
    return left;
  }
  function product() {
    let left = unary();
    for (;;) {
      const token = peek();
      if (token?.type === '*' || token?.type === '/') {
        at += 1;
        const right = unary();
        const a = left;
        left = token.type === '*' ? (x) => a(x) * right(x) : (x) => a(x) / right(x);
      } else if (startsValue(token)) {
        // Two values side by side multiply: 2x, 3(x+1).
        const right = power();
        const a = left;
        left = (x) => a(x) * right(x);
      } else return left;
    }
  }
  function unary() {
    if (peek()?.type === '-') {
      at += 1;
      const inner = unary();
      return (x) => -inner(x);
    }
    if (peek()?.type === '+') {
      at += 1;
      return unary();
    }
    return power();
  }
  function power() {
    const base = atom();
    if (peek()?.type === '^') {
      at += 1;
      const exponent = unary();
      return (x) => base(x) ** exponent(x);
    }
    return base;
  }
  function atom() {
    const token = peek();
    if (!token) throw new Error(`The formula "${source}" ends too early.`);
    if (token.type === 'num') {
      at += 1;
      return () => token.value;
    }
    if (token.type === '(') {
      at += 1;
      const inner = sum();
      take(')');
      return inner;
    }
    if (token.type === 'name') {
      at += 1;
      if (token.value === 'x') return (x) => x;
      if (Object.hasOwn(CONSTANTS, token.value)) return () => CONSTANTS[token.value];
      const fn = Object.hasOwn(FUNCTIONS, token.value) ? FUNCTIONS[token.value] : undefined;
      if (!fn) throw new Error(`"${token.value}" is not a known function or name. Use x, pi, e, and functions such as sin, sqrt, ln.`);
      take('(');
      const inner = sum();
      take(')');
      return (x) => fn(inner(x));
    }
    throw new Error(`"${token.type}" is in the wrong place in the formula "${source}".`);
  }

  const result = sum();
  if (at < list.length) throw new Error(`The formula "${source}" has something extra after it ends.`);
  return (x) => {
    const value = result(x);
    return Number.isFinite(value) ? value : NaN;
  };
}
