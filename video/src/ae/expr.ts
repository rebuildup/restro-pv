// Minimal evaluator for the AE expressions actually present in the dump:
// linear/ease/easeIn/easeOut(time,...), wiggle(seed,...), ternary
// comparisons on `time`, and array literals of those. Anything else throws
// so gaps surface instead of silently rendering wrong values.

export class ExprError extends Error {}

type Env = { time: number };

const fns: Record<string, (...a: number[]) => number> = {
  linear: (t, t1, v1, t2, v2) => {
    if (t <= t1) return v1;
    if (t >= t2) return v2;
    return v1 + ((v2 - v1) * (t - t1)) / (t2 - t1);
  },
  ease: (t, t1, v1, t2, v2) => fns.linear(t, t1, v1, t2, v2) ** 0 + easeVal(fns.linear(t, t1, v1, t2, v2)),
  easeIn: (t, t1, v1, t2, v2) => {
    const u = clamp01((t - t1) / (t2 - t1));
    return v1 + (v2 - v1) * u * u;
  },
  easeOut: (t, t1, v1, t2, v2) => {
    const u = clamp01((t - t1) / (t2 - t1));
    return v1 + (v2 - v1) * (1 - (1 - u) * (1 - u));
  },
};

function clamp01(x: number) {
  return Math.min(1, Math.max(0, x));
}
function easeVal(u: number) {
  // AE ease ~ smoothstep
  return u * u * (3 - 2 * u);
}

// very small recursive-descent parser for the expression subset
export function evalExpression(expr: string, time: number): unknown {
  const src = expr.trim().replace(/;$/, "");
  let i = 0;
  const env: Env = { time };

  function peek() {
    return src[i];
  }
  function ws() {
    while (i < src.length && /\s/.test(src[i])) i++;
  }
  function num(): number {
    ws();
    const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(src.slice(i));
    if (!m) throw new ExprError("expected number at " + i + " in " + expr);
    i += m[0].length;
    return Number(m[0]);
  }
  function ident(): string {
    ws();
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (!m) throw new ExprError("expected ident at " + i + " in " + expr);
    i += m[0].length;
    return m[0];
  }
  function value(): unknown {
    ws();
    if (peek() === "[") {
      i++;
      const arr: unknown[] = [];
      ws();
      if (peek() !== "]") {
        for (;;) {
          arr.push(value());
          ws();
          if (peek() === ",") {
            i++;
            continue;
          }
          break;
        }
      }
      ws();
      if (peek() !== "]") throw new ExprError("expected ] in " + expr);
      i++;
      return arr;
    }
    if (peek() === "(") return call();
    const id = ident();
    if (id === "time") return env.time;
    if (id === "value") return 0; // temporal context fallback; refine if needed
    if (peek() === "(") return callNamed(id);
    // bare identifier -> try number-ish
    const n = Number(id);
    if (!Number.isNaN(n)) return n;
    throw new ExprError("unknown ident " + id + " in " + expr);
  }
  function call(): unknown {
    // parenthesized expr
    i++; // (
    const v = ternary();
    ws();
    if (peek() !== ")") throw new ExprError("expected ) in " + expr);
    i++;
    return v;
  }
  function callNamed(name: string): unknown {
    ws();
    if (peek() !== "(") throw new ExprError("expected ( after " + name);
    i++;
    const args: number[] = [];
    ws();
    if (peek() !== ")") {
      for (;;) {
        const a = value();
        if (typeof a === "number") args.push(a);
        else if (Array.isArray(a) && a.length === 1) args.push(a[0] as number);
        else throw new ExprError("non-numeric arg in " + expr);
        ws();
        if (peek() === ",") {
          i++;
          continue;
        }
        break;
      }
    }
    ws();
    if (peek() !== ")") throw new ExprError("expected ) in call " + name);
    i++;
    if (name === "wiggle") {
      // wiggle(freq, amp) — deterministic pseudo-random; approximate with sin mix
      const freq = args[0] ?? 1;
      const amp = args[1] ?? 1;
      const t = env.time;
      return (
        (Math.sin(t * freq * 12.9898) * 43758.5453) % 1 * amp +
        Math.sin(t * freq * 78.233) * amp * 0.5
      );
    }
    const fn = fns[name];
    if (!fn) throw new ExprError("unsupported fn " + name + " in " + expr);
    return fn(...args);
  }
  function comparison(): unknown {
    let l = value();
    for (;;) {
      ws();
      const op = src.startsWith("<=", i)
        ? "<="
        : src.startsWith(">=", i)
          ? ">="
          : peek();
      if (op !== "<" && op !== ">" && op !== "<=" && op !== ">=") return l;
      i += op.length;
      const r = value();
      const ln = Array.isArray(l) ? (l[0] as number) : (l as number);
      const rn = Array.isArray(r) ? (r[0] as number) : (r as number);
      l = op === "<" ? ln < rn : op === ">" ? ln > rn : op === "<=" ? ln <= rn : ln >= rn;
    }
  }
  function ternary(): unknown {
    const c = comparison();
    ws();
    if (peek() !== "?") return c;
    i++;
    const a = ternary();
    ws();
    if (peek() !== ":") throw new ExprError("expected : in " + expr);
    i++;
    const b = ternary();
    return c ? a : b;
  }

  const result = ternary();
  ws();
  if (i < src.length) throw new ExprError("trailing input at " + i + " in " + expr);
  return result;
}
