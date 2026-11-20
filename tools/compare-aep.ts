#!/usr/bin/env bun
// Deep structural comparison between two per-comp dump directories
// (tools/dump-aep-tree.ts output). Compares everything that can affect the
// rendered result: comp settings, layer timing/flags/parenting/source refs,
// and full property trees — values, keyframe times/values/interpolation
// types/temporal+spatial ease, expressions, shape vertices/tangents.
//
//   bun tools/compare-aep.ts <dumpDirA> <dumpDirB>
//
// Intentional absorptions (each documented at the site):
//   - comp pairing is by name + structural signature, not dump order, because
//     AE's project.items order is not stable across projects;
//   - position keyframes are compared as a per-axis effective track because
//     AE stores them on different nodes depending on separated-dimension
//     state and authoring history (verified on AE 2027).
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ALWAYS_DORMANT,
  isAudioOnlyLayer,
  isDormantTextNode,
  THREE_D_GROUPS,
  THREE_D_ONLY,
} from "./lib/dormant-props.ts";

const [dirA, dirB] = process.argv.slice(2).map((d) => resolve(d ?? ""));
if (!dirA || !dirB || !existsSync(dirA) || !existsSync(dirB)) {
  console.error("usage: bun tools/compare-aep.ts <dumpDirA> <dumpDirB>");
  process.exit(1);
}

type Key = {
  t?: number;
  v?: unknown;
  inT?: number;
  outT?: number;
  inEase?: unknown;
  outEase?: unknown;
  spIn?: unknown;
  spOut?: unknown;
};
type Prop = {
  name?: string;
  matchName?: string;
  type?: number;
  numKeys?: number;
  numProperties?: number;
  properties?: Prop[];
  keys?: Key[];
  value?: unknown;
  expression?: string;
  active?: boolean;
  enabled?: boolean;
  propertyIndex?: number;
};
type Src = { type?: string; name?: string; id?: number; fullpath?: string };
type Layer = {
  index: number;
  name: string;
  matchName?: string;
  enabled?: boolean;
  shy?: boolean;
  guideLayer?: boolean;
  nullLayer?: boolean;
  inPoint?: number;
  outPoint?: number;
  startTime?: number;
  stretch?: number;
  timeRemapEnabled?: boolean;
  canTimeRemap?: boolean;
  trackMatteType?: number;
  isTrackMatte?: boolean;
  motionBlur?: boolean;
  collapseTransformations?: boolean;
  adjustmentLayer?: boolean;
  threeDLayer?: boolean;
  audioEnabled?: boolean;
  hasVideo?: boolean;
  hasAudio?: boolean;
  src?: Src | null;
  parent?: string;
  parentIndex?: number;
  transform?: Prop;
  masks?: Prop;
  effects?: Prop;
  shapes?: Prop;
  text?: Prop;
  timeRemap?: Prop;
};
type Comp = {
  name: string;
  id?: number;
  width: number;
  height: number;
  duration: number;
  frameRate: number;
  pixelAspect?: number;
  bgColor?: unknown;
  layers: Layer[];
};

// ---------------------------------------------------------------------------
// value equality with AE float tolerance
// ---------------------------------------------------------------------------
const EPS = 1e-3;
const TIME_EPS = 1e-4;

function isNum(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

// Deep equality: numbers within EPS, everything else strict. Object key sets
// must match; array lengths must match.
function deepEq(a: unknown, b: unknown): boolean {
  if (isNum(a) && isNum(b)) return Math.abs(a - b) <= EPS;
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEq(a[i], b[i])) return false;
    return true;
  }
  if (typeof a === "object" && typeof b === "object") {
    const ao = a as Record<string, unknown>,
      bo = b as Record<string, unknown>;
    const ak = Object.keys(ao),
      bk = Object.keys(bo);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
      if (!Object.hasOwn(bo, k)) return false;
      if (!deepEq(ao[k], bo[k])) return false;
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// loading + comp pairing (name + structural signature; see header)
// ---------------------------------------------------------------------------
function load(dir: string): Comp[] {
  const files = readdirSync(dir)
    .filter((x) => /^\d\d-.*\.json$/.test(x))
    .sort();
  return files.map((f) => {
    const raw = JSON.parse(readFileSync(join(dir, f), "utf8"));
    return raw.comp as Comp;
  });
}

const POSITION_MATCHNAMES = new Set([
  "ADBE Position",
  "ADBE Position_0",
  "ADBE Position_1",
  "ADBE Position_2",
]);

function isPositionNode(p: Prop | undefined): boolean {
  return !!p && POSITION_MATCHNAMES.has(p.matchName ?? "");
}

// Cheap structural signature used ONLY to pair duplicate comp names
// deterministically. It intentionally ignores position storage details.
function countProps(
  node: Prop | undefined,
  acc = { leaves: 0, keys: 0 },
  skipPosition = false,
): typeof acc {
  if (!node) return acc;
  if (skipPosition && isPositionNode(node)) return acc;
  const isLeaf = !node.properties || node.properties.length === 0;
  if (isLeaf) {
    acc.leaves++;
    acc.keys += node.numKeys ?? 0;
  } else {
    for (const p of node.properties!) countProps(p, acc, skipPosition);
  }
  return acc;
}

function signature(c: Comp): string {
  const parts = [
    `${c.width}x${c.height}`,
    `d${c.duration}`,
    `f${c.frameRate}`,
    `n${c.layers.length}`,
  ];
  for (const l of c.layers) {
    const t = countProps(l.transform, undefined, true);
    const m = countProps(l.masks);
    const e = countProps(l.effects);
    const s = countProps(l.shapes);
    const x = countProps(l.text);
    const r = countProps(l.timeRemap);
    parts.push(
      `${l.name}=${t.leaves}/${t.keys},${m.leaves}/${m.keys},${e.leaves}/${e.keys},${s.leaves}/${s.keys},${x.leaves}/${x.keys},${r.leaves}/${r.keys}`,
    );
  }
  return parts.join("|");
}

function pairComps(A: Comp[], B: Comp[]): Array<{ a?: Comp; b?: Comp }> {
  const group = (xs: Comp[]) => {
    const m = new Map<string, Comp[]>();
    for (const c of xs) {
      const g = m.get(c.name) ?? [];
      g.push(c);
      m.set(c.name, g);
    }
    for (const g of m.values())
      g.sort((x, y) => (signature(x) < signature(y) ? -1 : signature(x) > signature(y) ? 1 : 0));
    return m;
  };
  const ga = group(A),
    gb = group(B);
  const names = new Set<string>([...ga.keys(), ...gb.keys()]);
  const pairs: Array<{ a?: Comp; b?: Comp }> = [];
  for (const n of [...names].sort()) {
    const xa = ga.get(n) ?? [],
      xb = gb.get(n) ?? [];
    const k = Math.max(xa.length, xb.length);
    for (let i = 0; i < k; i++) pairs.push({ a: xa[i], b: xb[i] });
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// position: semantic per-axis effective track
// ---------------------------------------------------------------------------
// Position keyframes are stored on different nodes depending on AE's
// separated-dimensions state and authoring history: a source layer can report
// keys on "ADBE Position" AND "ADBE Position_1" simultaneously, while a
// generated separated layer reports them only on the dim followers
// (verified on AE 2027: separating migrates Position keys to X/Y Position and
// setValueAtTime on separated "ADBE Position" throws). The evaluated animation
// is identical either way, so position is compared as the per-axis union of
// key (time,value) entries plus static values. An axis whose keyed values are
// all identical collapses to the same token as an unkeyed static value —
// constant keyframes and a plain value evaluate identically.
function positionSignature(transform: Prop | undefined): string {
  if (!transform) return "";
  const axes: Array<Map<number, number>> = [new Map(), new Map(), new Map()];
  const staticVals: Array<number | undefined> = [undefined, undefined, undefined];
  const exprCount = [0, 0, 0];
  const put = (axis: number, t: number, v: number) => {
    const m = axes[axis];
    const key = Math.round(t * 1e4) / 1e4;
    if (!m.has(key)) m.set(key, v);
  };
  const walk = (n: Prop | undefined) => {
    if (!n) return;
    if (isPositionNode(n)) {
      const mn = n.matchName ?? "";
      const idx = mn === "ADBE Position" ? -1 : Number(mn.slice(-1));
      const targets = idx === -1 ? [0, 1, 2] : [idx];
      const val = n.value;
      for (const a of targets) {
        const comp = idx === -1 && Array.isArray(val) ? Number(val[a]) : Number(val);
        if (Number.isFinite(comp)) staticVals[a] = comp;
      }
      for (const k of n.keys ?? []) {
        if (typeof k.t !== "number") continue;
        const kv = k.v;
        for (const a of targets) {
          const comp = idx === -1 && Array.isArray(kv) ? Number(kv[a]) : Number(kv);
          if (Number.isFinite(comp)) put(a, k.t, comp);
        }
      }
      if (n.expression) for (const a of targets) exprCount[a]++;
      return; // position nodes are leaves; do not descend
    }
    for (const c of n.properties ?? []) walk(c);
  };
  walk(transform);
  const rv = (v: number) => Math.round(v * 1000) / 1000;
  return axes
    .map((m, a) => {
      const suffix = exprCount[a] ? "+e" + exprCount[a] : "";
      if (m.size === 0)
        return "s" + (staticVals[a] === undefined ? "?" : rv(staticVals[a]!)) + suffix;
      const vals = new Set<number>();
      for (const v of m.values()) vals.add(rv(v));
      if (vals.size === 1) return "s" + [...vals][0] + suffix;
      return (
        [...m.entries()]
          .sort((x, y) => x[0] - y[0])
          .map(([t, v]) => rv(t) + ":" + rv(v))
          .join(",") + suffix
      );
    })
    .join("|");
}

// ---------------------------------------------------------------------------
// property tree diff
// ---------------------------------------------------------------------------
type Diff = { path: string; msg: string };

function fmtV(v: unknown): string {
  const s = JSON.stringify(v);
  return s === undefined ? String(v) : s.length > 80 ? s.slice(0, 77) + "..." : s;
}

function diffKeys(a: Key[] | undefined, b: Key[] | undefined, path: string, out: Diff[]): void {
  const na = a ?? [],
    nb = b ?? [];
  if (na.length !== nb.length) {
    out.push({ path, msg: `key count ${na.length} vs ${nb.length}` });
    return; // per-key detail is meaningless when counts differ
  }
  for (let i = 0; i < na.length; i++) {
    const ka = na[i],
      kb = nb[i];
    const kp = `${path}.key[${i}]`;
    if (typeof ka.t === "number" && typeof kb.t === "number" && Math.abs(ka.t - kb.t) > TIME_EPS) {
      out.push({ path: kp, msg: `time ${ka.t} vs ${kb.t}` });
    }
    if (!deepEq(ka.v, kb.v)) out.push({ path: kp + ".v", msg: `${fmtV(ka.v)} vs ${fmtV(kb.v)}` });
    if (!deepEq(ka.inT, kb.inT) || !deepEq(ka.outT, kb.outT)) {
      out.push({ path: kp, msg: `interp ${ka.inT}/${ka.outT} vs ${kb.inT}/${kb.outT}` });
    }
    if (!deepEq(ka.inEase, kb.inEase))
      out.push({ path: kp + ".inEase", msg: `${fmtV(ka.inEase)} vs ${fmtV(kb.inEase)}` });
    if (!deepEq(ka.outEase, kb.outEase))
      out.push({ path: kp + ".outEase", msg: `${fmtV(ka.outEase)} vs ${fmtV(kb.outEase)}` });
    if (!deepEq(ka.spIn, kb.spIn))
      out.push({ path: kp + ".spIn", msg: `${fmtV(ka.spIn)} vs ${fmtV(kb.spIn)}` });
    if (!deepEq(ka.spOut, kb.spOut))
      out.push({ path: kp + ".spOut", msg: `${fmtV(ka.spOut)} vs ${fmtV(kb.spOut)}` });
  }
}

// A node is absorbed (never reported) when AE makes it unwritable, so it can
// never exist in a generated project — identical rules to convert-dump via
// tools/lib/dormant-props.ts. Applied both to matched pairs and to unmatched
// children.
function isAbsorbed(p: Prop, threeD: boolean): boolean {
  if (isPositionNode(p)) return true; // handled by positionSignature
  const mn = p.matchName ?? "";
  if (ALWAYS_DORMANT.has(mn)) return true;
  if (!threeD && (THREE_D_ONLY.has(mn) || THREE_D_GROUPS.has(mn))) return true;
  if (isDormantTextNode(p)) return true;
  return false;
}

function propKey(p: Prop): string {
  return p.matchName ?? p.name ?? "";
}

// Group children are paired by matchName (falling back to name) with
// occurrence order as tiebreak — NOT by raw index. convert-dump legitimately
// drops absorbed nodes, which shifts indices; index pairing would cascade
// false diffs onto every following sibling.
function diffChildren(
  aProps: Prop[],
  bProps: Prop[],
  path: string,
  out: Diff[],
  threeD: boolean,
): void {
  const pool = new Map<string, Prop[]>();
  for (const b of bProps) {
    const k = propKey(b);
    const g = pool.get(k) ?? [];
    g.push(b);
    pool.set(k, g);
  }
  const used = new Set<Prop>();
  for (const a of aProps) {
    const g = pool.get(propKey(a)) ?? [];
    const cand = g.find((x) => !used.has(x));
    if (cand) used.add(cand);
    diffProp(a, cand, path, out, threeD);
  }
  for (const b of bProps) if (!used.has(b)) diffProp(undefined, b, path, out, threeD);
}

function diffProp(
  a: Prop | undefined,
  b: Prop | undefined,
  path: string,
  out: Diff[],
  threeD: boolean,
): void {
  if (!a && !b) return;
  if (!a || !b) {
    const p = a ?? b;
    if (p && isAbsorbed(p, threeD)) return;
    out.push({
      path: `${path}/${p?.name ?? p?.matchName ?? "?"}`,
      msg: a ? "only in A" : "only in B",
    });
    return;
  }
  const mn = a.matchName ?? b.matchName ?? "";
  if (isPositionNode(a) || isPositionNode(b)) return; // handled by positionSignature
  if (ALWAYS_DORMANT.has(mn)) return;
  if (!threeD && (THREE_D_ONLY.has(mn) || THREE_D_GROUPS.has(mn))) return;
  const da = isDormantTextNode(a),
    db = isDormantTextNode(b);
  if (da && db) return;
  if (da !== db) {
    out.push({
      path: `${path}/${a.name ?? mn}`,
      msg: "dormant text prop state differs (one side non-default)",
    });
    return;
  }
  const label = a.name ?? a.matchName ?? "?";
  const p = `${path}/${label}`;
  if ((a.matchName ?? "") !== (b.matchName ?? ""))
    out.push({ path: p, msg: `matchName ${a.matchName} vs ${b.matchName}` });
  if ((a.enabled ?? true) !== (b.enabled ?? true))
    out.push({ path: p + ".enabled", msg: `${a.enabled} vs ${b.enabled}` });
  if ((a.active ?? true) !== (b.active ?? true))
    out.push({ path: p + ".active", msg: `${a.active} vs ${b.active}` });
  // A disabled property is hidden in AE: the runtime cannot write its value,
  // keys, or expression, so generated children hold AE defaults. Comparing
  // them is meaningless — the enabled flag itself was already compared above.
  if (a.enabled === false || b.enabled === false) return;
  const ca = a.properties ?? [],
    cb = b.properties ?? [];
  if (ca.length === 0 && cb.length === 0) {
    // leaf
    const hasMotion =
      (a.numKeys ?? 0) > 0 ||
      (b.numKeys ?? 0) > 0 ||
      !!(a.expression ?? "") ||
      !!(b.expression ?? "");
    // For keyed/expression-driven properties `value` is AE's evaluation at
    // whatever time the dump happened to run — it is sampled state, not
    // authored data. Keys and the expression itself are compared below.
    if (!hasMotion && !deepEq(a.value, b.value))
      out.push({ path: p + ".value", msg: `${fmtV(a.value)} vs ${fmtV(b.value)}` });
    if ((a.numKeys ?? 0) !== (b.numKeys ?? 0))
      out.push({ path: p, msg: `numKeys ${a.numKeys ?? 0} vs ${b.numKeys ?? 0}` });
    diffKeys(a.keys, b.keys, p, out);
    if ((a.expression ?? "") !== (b.expression ?? "")) {
      out.push({ path: p + ".expression", msg: `${fmtV(a.expression)} vs ${fmtV(b.expression)}` });
    }
    return;
  }
  // group: children paired by matchName, not index (absorbed nodes shift indices)
  diffChildren(ca, cb, p, out, threeD);
}

function diffPropGroup(
  a: Prop | undefined,
  b: Prop | undefined,
  path: string,
  out: Diff[],
  threeD: boolean,
): void {
  diffProp(a, b, path, out, threeD);
}

// ---------------------------------------------------------------------------
// layer diff
// ---------------------------------------------------------------------------
const LAYER_SCALARS: Array<keyof Layer> = [
  "enabled",
  "shy",
  "guideLayer",
  "nullLayer",
  "inPoint",
  "outPoint",
  "startTime",
  "stretch",
  "timeRemapEnabled",
  "canTimeRemap",
  "trackMatteType",
  "isTrackMatte",
  "motionBlur",
  "collapseTransformations",
  "adjustmentLayer",
  "threeDLayer",
  "audioEnabled",
  "hasVideo",
  "hasAudio",
];

function layerKind(l: Layer): string {
  if (l.nullLayer) return "null";
  if (l.src?.type === "comp") return "comp";
  if (l.src?.type === "footage") return "footage";
  if (l.shapes) return "shape";
  if (l.text) return "text";
  return "unknown";
}

function diffSrc(
  a: Layer,
  b: Layer,
  compNameA: Map<number, string>,
  compNameB: Map<number, string>,
  out: Diff[],
): void {
  const sa = a.src ?? null,
    sb = b.src ?? null;
  if (!sa && !sb) return;
  if (!sa || !sb) {
    out.push({ path: "src", msg: "presence differs" });
    return;
  }
  if (sa.type !== sb.type) {
    out.push({ path: "src.type", msg: `${sa.type} vs ${sb.type}` });
    return;
  }
  if (sa.type === "comp") {
    const na = sa.id !== undefined ? compNameA.get(sa.id) : undefined;
    const nb = sb.id !== undefined ? compNameB.get(sb.id) : undefined;
    if (na !== undefined && nb !== undefined) {
      if (na !== nb) out.push({ path: "src.comp", msg: `references '${na}' vs '${nb}'` });
    } else if (sa.name !== sb.name) {
      out.push({ path: "src.comp", msg: `name '${sa.name}' vs '${sb.name}' (id unresolved)` });
    }
  } else {
    // footage / solid: names may carry a " #n" dedup suffix from the converter;
    // compare the item name, then fall back to the file basename.
    if (sa.name !== sb.name) {
      // AE null-object footage items are auto-named "Null N" with a
      // project-global counter, so the number can never match across
      // projects. All null footage items are interchangeable; the layer
      // name (compared separately) is what expressions reference.
      const isNullFootage = (s: { name?: string; fullpath?: string }) =>
        /^Null \d+$/.test(s.name ?? "") && !(s.fullpath ?? "");
      if (isNullFootage(sa) && isNullFootage(sb)) return;
      const ba = (sa.fullpath ?? "").split(/[\\/]/).pop();
      const bb = (sb.fullpath ?? "").split(/[\\/]/).pop();
      if (ba && ba === bb)
        out.push({ path: "src.name", msg: `renamed '${sa.name}' vs '${sb.name}' (same file)` });
      else out.push({ path: "src", msg: `name '${sa.name}' vs '${sb.name}'` });
    }
  }
}

function diffLayer(
  a: Layer,
  b: Layer,
  pa: string,
  compNameA: Map<number, string>,
  compNameB: Map<number, string>,
  out: Diff[],
): void {
  if (a.name !== b.name) out.push({ path: pa + ".name", msg: `'${a.name}' vs '${b.name}'` });
  const ka = layerKind(a),
    kb = layerKind(b);
  if (ka !== kb) out.push({ path: pa + ".kind", msg: `${ka} vs ${kb}` });
  for (const f of LAYER_SCALARS) {
    const va = a[f],
      vb = b[f];
    if (va === undefined && vb === undefined) continue;
    if (isNum(va) && isNum(vb)) {
      if (
        Math.abs(va - vb) >
        (f === "inPoint" || f === "outPoint" || f === "startTime" || f === "stretch"
          ? TIME_EPS
          : EPS)
      ) {
        out.push({ path: `${pa}.${f}`, msg: `${va} vs ${vb}` });
      }
    } else if (va !== vb) {
      out.push({ path: `${pa}.${f}`, msg: `${fmtV(va)} vs ${fmtV(vb)}` });
    }
  }
  // parent: compare resolved parent layer name; parentIndex as tiebreak detail
  const pna = a.parent,
    pnb = b.parent;
  if ((pna ?? "") !== (pnb ?? "")) out.push({ path: pa + ".parent", msg: `'${pna}' vs '${pnb}'` });
  if ((a.parentIndex ?? 0) !== (b.parentIndex ?? 0) && (pna ?? "") === (pnb ?? "")) {
    out.push({ path: pa + ".parentIndex", msg: `${a.parentIndex} vs ${b.parentIndex}` });
  }
  diffSrc(a, b, compNameA, compNameB, out);
  const threeD = !!a.threeDLayer;
  const audioOnly = isAudioOnlyLayer(a);
  for (const g of ["masks", "effects", "shapes", "text", "timeRemap"] as const) {
    // Audio-only layers carry no visual property groups in the generated
    // project (they cannot be created); presence is asserted via hasVideo.
    if (audioOnly && (g === "masks" || g === "effects" || g === "shapes" || g === "text")) {
      // Empty parade groups exist on every layer in both projects; only a
      // group with actual children is meaningful for an audio-only layer.
      const hasKids = (p: Prop | undefined) => (p?.properties?.length ?? 0) > 0;
      if (hasKids(a[g]) || hasKids(b[g])) {
        out.push({ path: `${pa}.${g}`, msg: `audio-only layer unexpectedly has ${g} children` });
      }
      continue;
    }
    diffPropGroup(a[g], b[g], `${pa}.${g}`, out, threeD);
  }
  diffPropGroup(a.transform, b.transform, `${pa}.transform`, out, threeD);
  const ta = positionSignature(a.transform),
    tb = positionSignature(b.transform);
  if (ta !== tb)
    out.push({ path: pa + ".transform.position", msg: "effective position track differs" });
}

// ---------------------------------------------------------------------------
// comp diff
// ---------------------------------------------------------------------------
function compIdMap(comps: Comp[]): Map<number, string> {
  const m = new Map<number, string>();
  for (const c of comps) if (c.id !== undefined) m.set(c.id, c.name);
  return m;
}

function diffComp(
  a: Comp,
  b: Comp,
  compNameA: Map<number, string>,
  compNameB: Map<number, string>,
  out: Diff[],
): void {
  if (a.width !== b.width || a.height !== b.height)
    out.push({ path: "comp", msg: `size ${a.width}x${a.height} vs ${b.width}x${b.height}` });
  if (Math.abs(a.duration - b.duration) > TIME_EPS)
    out.push({ path: "comp.duration", msg: `${a.duration} vs ${b.duration}` });
  if (a.frameRate !== b.frameRate)
    out.push({ path: "comp.frameRate", msg: `${a.frameRate} vs ${b.frameRate}` });
  if (!deepEq(a.pixelAspect ?? 1, b.pixelAspect ?? 1))
    out.push({ path: "comp.pixelAspect", msg: `${a.pixelAspect} vs ${b.pixelAspect}` });
  if (!deepEq(a.bgColor ?? null, b.bgColor ?? null))
    out.push({ path: "comp.bgColor", msg: `${fmtV(a.bgColor)} vs ${fmtV(b.bgColor)}` });
  if (a.layers.length !== b.layers.length) {
    out.push({ path: "layers", msg: `count ${a.layers.length} vs ${b.layers.length}` });
  }
  const n = Math.min(a.layers.length, b.layers.length);
  for (let i = 0; i < n; i++) {
    // layer names are the stable pairing key inside a comp; the dump's layer
    // order is the AE stack order which the generator reproduces, but a name
    // mismatch at the same index is itself a diff.
    diffLayer(a.layers[i], b.layers[i], `layer[${i}]`, compNameA, compNameB, out);
  }
  for (let i = n; i < a.layers.length; i++)
    out.push({ path: `layer[${i}]`, msg: `only in A: '${a.layers[i].name}'` });
  for (let i = n; i < b.layers.length; i++)
    out.push({ path: `layer[${i}]`, msg: `only in B: '${b.layers[i].name}'` });
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------
const outIdx = process.argv.indexOf("--out");
const reportPath = outIdx >= 0 ? resolve(process.argv[outIdx + 1]) : null;

const A = load(dirA),
  B = load(dirB);
const pairs = pairComps(A, B);
const compNameA = compIdMap(A),
  compNameB = compIdMap(B);
console.log(`A: ${A.length} comps, B: ${B.length} comps (${pairs.length} matched pairs)`);

let diffs = 0;
let totalFindings = 0;
const report: { comp: string; findings: Diff[] }[] = [];
for (const { a, b } of pairs) {
  if (!a || !b) {
    console.log(`${!a ? "-" : "+"} comp '${a?.name ?? b?.name ?? "?"}'`);
    diffs++;
    report.push({
      comp: a?.name ?? b?.name ?? "?",
      findings: [{ path: "comp", msg: !a ? "only in A" : "only in B" }],
    });
    continue;
  }
  const out: Diff[] = [];
  diffComp(a, b, compNameA, compNameB, out);
  if (out.length) {
    diffs++;
    totalFindings += out.length;
    report.push({ comp: a.name, findings: out });
    console.log(`comp '${a.name}': ${out.length} diffs`);
    const showAll = process.argv.includes("--all");
    for (const d of out.slice(0, showAll ? out.length : 15)) console.log(`   ${d.path}: ${d.msg}`);
    if (!showAll && out.length > 15) console.log(`   ... +${out.length - 15}`);
  }
}
if (reportPath) {
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        schema: "restro-pv.compare/v1",
        dirA,
        dirB,
        compsA: A.length,
        compsB: B.length,
        pairs: pairs.length,
        differingComps: diffs,
        totalFindings,
        report,
      },
      null,
      1,
    ),
  );
  console.log("wrote " + reportPath);
}
console.log(diffs === 0 ? "STRUCTURE MATCH" : `${diffs} comps differ (${totalFindings} findings)`);
process.exit(diffs === 0 ? 0 : 1);
