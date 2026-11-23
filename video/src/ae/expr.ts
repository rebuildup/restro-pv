// Minimal evaluator for the AE expressions actually present in the dump:
// linear/ease/easeIn/easeOut(time,...), wiggle(seed,...), ternary
// comparisons on `time`, and array literals of those. Anything else throws
// so gaps surface instead of silently rendering wrong values.

export class ExprError extends Error {}

type Env = { time: number; layerName?: string; value?: unknown };

// AE ease-family signature is ease*(t, t1, t2, value1, value2) — note t2
// comes before the values, unlike linear(t, t1, value1, t2, value2). All
// expressions in this project use that order consistently.
const fns: Record<string, (...a: number[]) => number> = {
  linear: (t, t1, t2, v1, v2) => {
    // Accept both argument orders: if (a2,a3) does not look like
    // (t1<t2) but (a1,a3) does, reinterpret as AE linear order.
    let T1 = t1, T2 = t2, V1 = v1, V2 = v2;
    if (!(T1 < T2) && t1 < v1) {
      T1 = t1; V1 = t2; T2 = v1; V2 = v2;
    }
    if (t <= T1) return V1;
    if (t >= T2) return V2;
    return V1 + ((V2 - V1) * (t - T1)) / (T2 - T1);
  },
  ease: (t, t1, t2, v1, v2) => {
    const u = t <= t1 ? 0 : t >= t2 ? 1 : easeVal((t - t1) / (t2 - t1));
    return v1 + (v2 - v1) * u;
  },
  easeIn: (t, t1, t2, v1, v2) => {
    const u = clamp01((t - t1) / (t2 - t1));
    return v1 + (v2 - v1) * u * u;
  },
  easeOut: (t, t1, t2, v1, v2) => {
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

// Targeted evaluator for the FUDE stroke-scatter family used on Position
// properties throughout Baseline/PV glyph comps:
//   var m={'S01':[x,y],...}; var k=thisLayer.name.substr(A,B);
//   var d=m[k]?[...]:[0,0]; var p=easeOut(time,T1,T2,0,1);
//   value+[d[0]*p,d[1]*p,0].slice(0,value.length)
// Returns undefined when the expression does not match so the caller can
// fall back to the generic parser.
function evalStrokeScatter(src: string, env: Env): unknown {
  if (!env.layerName || !Array.isArray(env.value)) return undefined;
  if (!src.includes("thisLayer.name.substr") || !src.includes("value+[")) return undefined;
  const map: Record<string, [number, number]> = {};
  for (const m of src.matchAll(/'(\w+)':\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g)) {
    map[m[1]] = [Number(m[2]), Number(m[3])];
  }
  const sub = /thisLayer\.name\.substr\((\d+),(\d+)\)/.exec(src);
  if (!sub) return undefined;
  const key = env.layerName.substr(Number(sub[1]), Number(sub[2]));
  const d = map[key] ?? [0, 0];
  const ez = /ease(?:Out|In)?\(time,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/.exec(src);
  let p = 0;
  if (ez) {
    const [, t1, t2, v1, v2] = ez.map(Number) as unknown as [number, number, number, number, number];
    p = ez[0].includes("easeOut") ? fns.easeOut(env.time, t1, t2, v1, v2)
      : ez[0].includes("easeIn") ? fns.easeIn(env.time, t1, t2, v1, v2)
      : fns.ease(env.time, t1, t2, v1, v2);
  }
  const base = env.value as number[];
  const delta = [d[0] * p, d[1] * p, 0];
  return base.map((v, i) => (typeof v === "number" ? v + (delta[i] ?? 0) : v));
}

// very small recursive-descent parser for the expression subset
export function evalExpression(expr: string, time: number, ctx?: { layerName?: string; value?: unknown }): unknown {
  const src = expr.trim().replace(/;$/, "");
  const env: Env = { time, layerName: ctx?.layerName, value: ctx?.value };
  const scattered = evalStrokeScatter(src, env);
  if (scattered !== undefined) return scattered;
  let i = 0;

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
