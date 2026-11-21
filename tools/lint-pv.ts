// PV project lint — static checks over the compiled production spec
// (issue #15). Run: `bun run lint:pv` (add --strict to fail on findings).
//
// Checks:
//  1. expression audit — leftover {{ref:}} markers, out-of-range
//     thisComp.layer(N), out-of-range parentIndex / Layer Control values
//  2. unused nulls — null layers not referenced by any parent, expression,
//     or Layer Control-style index value
//  3. section overlap — geometric AABB intersection between sections,
//     computed from compiled transforms + source comp dims
//  4. FoldLayers divider integrity — FD-0/FD-1/FD-H:* vector groups, naming,
//     shy propagation for folded groups

import { GENERATED_COMPS } from "../pv/generated/index.ts";
import { INTENDED_OVERLAPS } from "../pv/production/theme.ts";
import { compileProduction } from "../pv/production/compile.ts";
import {
  materialCompsByName,
  pvProductionProject,
  pvProductionSpec,
} from "../pv/scenes/production.ts";
import type { CompSpec, FootageSpec, LayerSpec, ProjectSpec, PropNode } from "../pv/spec/types.ts";

const STRICT = process.argv.includes("--strict");

interface Finding {
  check: string;
  severity: "error" | "warn" | "info";
  where: string;
  message: string;
}
const findings: Finding[] = [];
const add = (check: string, severity: Finding["severity"], where: string, message: string) =>
  findings.push({ check, severity, where, message });

// ---- helpers -----------------------------------------------------------------

function* walkNodes(node: PropNode | undefined): Generator<PropNode> {
  if (!node) return;
  yield node;
  for (const ch of node.properties ?? []) yield* walkNodes(ch);
}

function propByMatch(node: PropNode | undefined, match: string): PropNode | undefined {
  if (!node) return undefined;
  if (node.matchName === match) return node;
  for (const ch of node.properties ?? []) {
    const r = propByMatch(ch, match);
    if (r) return r;
  }
  return undefined;
}

function vec3(v: unknown): [number, number, number] | null {
  if (Array.isArray(v) && v.length >= 2 && typeof v[0] === "number") {
    return [v[0], v[1], typeof v[2] === "number" ? v[2] : 0];
  }
  return null;
}

// ---- 1. expression / reference audit ------------------------------------------

function auditComp(comp: CompSpec) {
  const n = comp.layers.length;
  const where = `comp "${comp.name}"`;
  const referenced = new Set<number>();
  comp.layers.forEach((l, i) => {
    const lw = `${where} layer ${i + 1} "${l.name}"`;
    if (l.index !== i + 1) add("refs", "error", lw, `index field ${l.index} != position ${i + 1}`);
    if (l.parentIndex !== undefined) {
      if (l.parentIndex < 1 || l.parentIndex > n) {
        add("refs", "error", lw, `parentIndex ${l.parentIndex} out of range 1..${n}`);
      } else {
        referenced.add(l.parentIndex);
        if (l.parentIndex === i + 1) add("refs", "error", lw, "parents to itself");
      }
    }
    for (const tree of [l.transform, l.masks, l.effects, l.shapes, l.text, l.timeRemap]) {
      for (const node of walkNodes(tree)) {
        const expr = node.expression;
        if (expr) {
          if (expr.includes("{{ref:")) {
            add("expr", "error", lw, `unresolved ref marker: ${expr.slice(0, 80)}`);
          }
          for (const m of expr.matchAll(/thisComp\.layer\((\d+)\)/g)) {
            const idx = Number(m[1]);
            if (idx < 1 || idx > n) {
              add("expr", "error", lw, `thisComp.layer(${idx}) out of range 1..${n}`);
            } else {
              referenced.add(idx);
            }
          }
        }
        // Layer Control "Layer" params and similar index-valued effect
        // children arrive as plain integers. Over-approximate: any integer
        // leaf inside an effects tree that lands in range marks a reference
        // (keeps the unused-null check conservative, never over-reports).
        if (tree === l.effects && typeof node.value === "number" && Number.isInteger(node.value)) {
          const v = node.value;
          if (v >= 1 && v <= n) referenced.add(v);
        }
      }
    }
  });
  // unused nulls
  comp.layers.forEach((l, i) => {
    if (l.kind !== "null") return;
    if (!referenced.has(i + 1)) {
      add(
        "nulls",
        "warn",
        `${where} layer ${i + 1} "${l.name}"`,
        "null layer is not referenced by any parent, expression, or effect index",
      );
    }
  });
}

// ---- 2. section overlap --------------------------------------------------------

interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface LayerBox {
  bounds: Bounds;
  t0: number;
  t1: number;
}

const materialDims = new Map<string, { w: number; h: number }>();
for (const c of GENERATED_COMPS) materialDims.set(c.name, { w: c.width, h: c.height });

// Position key values -> conservative motion envelope. Keyframe extremes
// bound the trajectory for the eased moves used here; scale/rotation are
// not modeled (documented limitation — flagged UNVERIFIED where relevant).
function positionSamples(node: PropNode | undefined): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  const walk = (n: PropNode | undefined): void => {
    if (!n) return;
    if (n.matchName === "ADBE Position") {
      const push = (v: unknown) => {
        const p = vec3(v);
        if (p) out.push(p);
      };
      push(n.value);
      for (const k of n.keys ?? []) push(k.v);
    }
    for (const c of n.properties ?? []) walk(c);
  };
  walk(node);
  return out;
}

function layerBounds(comp: CompSpec, layer: LayerSpec): LayerBox | null {
  // Source dimensions: project comps by index, material comps by name.
  let w = 0;
  let h = 0;
  if (layer.kind === "comp") {
    if (layer.sourceCompIndex !== undefined && layer.sourceCompIndex !== null) {
      const sc = compIndexToSpec.get(layer.sourceCompIndex);
      if (!sc) return null;
      w = sc.width;
      h = sc.height;
    } else {
      const d = materialDims.get(layer.source ?? "");
      if (!d) return null;
      w = d.w;
      h = d.h;
    }
  } else if (layer.kind === "footage") {
    const f = footageByName.get(layer.source ?? "");
    if (!f || f.kind !== "solid") return null; // file dims unknown statically
    w = f.width;
    h = f.height;
  } else {
    return null; // shape/text/null carry no reliable static bounds
  }
  if (w <= 0 || h <= 0) return null;
  const samples = positionSamples(layer.transform);
  if (!samples.length) return null;
  const anchorNode = propByMatch(layer.transform, "ADBE Anchor Point");
  const anchor = anchorNode
    ? vec3(anchorNode.value ?? anchorNode.keys?.[0]?.v)
    : null;
  // AE default anchor for comp/footage layers is the source center.
  const ax = anchor ? anchor[0] : w / 2;
  const ay = anchor ? anchor[1] : h / 2;
  let b: Bounds | null = null;
  for (const [px, py] of samples) {
    const cand = { x0: px - ax, y0: py - ay, x1: px - ax + w, y1: py - ay + h };
    b = b
      ? {
          x0: Math.min(b.x0, cand.x0),
          y0: Math.min(b.y0, cand.y0),
          x1: Math.max(b.x1, cand.x1),
          y1: Math.max(b.y1, cand.y1),
        }
      : cand;
  }
  if (!b) return null;
  return {
    bounds: b,
    t0: layer.inPoint ?? 0,
    t1: layer.outPoint ?? comp.duration,
  };
}

let compIndexToSpec = new Map<number, CompSpec>();
let footageByName = new Map<string, FootageSpec>();
// compName -> sectionId -> AE layer indices, via the compiler's hook
const sectionLayers = new Map<string, Map<string, number[]>>();

interface SectionBox {
  bounds: Bounds;
  t0: number;
  t1: number;
  unbounded: number; // visible-kind members with no static bounds
}

function auditOverlap(spec: ProjectSpec) {
  compIndexToSpec = new Map(spec.comps.map((c, i) => [i, c]));
  footageByName = new Map(spec.footage.map((f) => [f.name, f]));
  const intendedUsed = new Set<string>();
  for (const comp of spec.comps) {
    const bySection = sectionLayers.get(comp.name);
    if (!bySection) continue;
    const compArea = comp.width * comp.height;
    const sectionBoxes = new Map<string, SectionBox>();
    for (const [sid, indices] of bySection) {
      let u: Bounds | null = null;
      let t0 = Infinity;
      let t1 = -Infinity;
      let unbounded = 0;
      for (const idx of indices) {
        const layer = comp.layers[idx - 1]!;
        const box = layerBounds(comp, layer);
        if (!box) {
          const audioOnly = /\.(mp3|wav|aiff?|aac|m4a)$/i.test(layer.source ?? layer.name ?? "");
          if (
            !audioOnly &&
            ["comp", "footage", "text", "shape"].includes(layer.kind) &&
            layer.enabled !== false
          ) {
            unbounded++;
          }
          continue;
        }
        const b = box.bounds;
        u = u
          ? {
              x0: Math.min(u.x0, b.x0),
              y0: Math.min(u.y0, b.y0),
              x1: Math.max(u.x1, b.x1),
              y1: Math.max(u.y1, b.y1),
            }
          : b;
        t0 = Math.min(t0, box.t0);
        t1 = Math.max(t1, box.t1);
      }
      if (unbounded > 0) {
        add(
          "overlap",
          "info",
          `comp "${comp.name}" section "${sid}"`,
          `${unbounded} visible member(s) have no static bounds (file footage/shape/text) — overlap unverifiable, needs render check`,
        );
      }
      if (u && Number.isFinite(t0)) sectionBoxes.set(sid, { bounds: u, t0, t1, unbounded });
    }
    const ids = [...sectionBoxes.keys()];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = sectionBoxes.get(ids[i]!)!;
        const b = sectionBoxes.get(ids[j]!)!;
        // Time gate: sections that never coexist cannot visually overlap.
        if (a.t1 <= b.t0 || b.t1 <= a.t0) continue;
        const key = [comp.name, ids[i], ids[j]].sort().join("");
        const intended = INTENDED_OVERLAPS.find(
          (o) => o.comp === comp.name && ((o.a === ids[i] && o.b === ids[j]) || (o.a === ids[j] && o.b === ids[i])),
        );
        if (intended) {
          intendedUsed.add(key);
          continue; // documented intentional overlap — not a finding
        }
        const A = a.bounds;
        const B = b.bounds;
        const ix = Math.max(0, Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0));
        const iy = Math.max(0, Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0));
        const area = ix * iy;
        if (area <= 0) continue;
        const smaller = Math.min((A.x1 - A.x0) * (A.y1 - A.y0), (B.x1 - B.x0) * (B.y1 - B.y0));
        const pct = smaller > 0 ? (area / smaller) * 100 : 0;
        const tOverlap = Math.min(a.t1, b.t1) - Math.max(a.t0, b.t0);
        const fullA = (A.x1 - A.x0) * (A.y1 - A.y0) >= compArea * 0.9;
        const fullB = (B.x1 - B.x0) * (B.y1 - B.y0) >= compArea * 0.9;
        // Overlap against a full-frame section is the intended design
        // (overlay on scene); two partial sections colliding is suspect.
        const severity: Finding["severity"] = fullA || fullB ? "info" : "warn";
        add(
          "overlap",
          severity,
          `comp "${comp.name}" sections "${ids[i]}" x "${ids[j]}"`,
          `intersection ${Math.round(ix)}x${Math.round(iy)}px (${pct.toFixed(1)}% of smaller) during ${tOverlap.toFixed(2)}s${
            fullA || fullB ? " [vs full-frame section]" : ""
          }`,
        );
      }
    }
  }
  // Stale allowlist entries are lint failures: an intended overlap that no
  // longer occurs means the exception outlived its reason.
  for (const o of INTENDED_OVERLAPS) {
    const key = [o.comp, o.a, o.b].sort().join("");
    if (!intendedUsed.has(key)) {
      add("overlap", "warn", `comp "${o.comp}"`, `stale intended-overlap entry "${o.a}" x "${o.b}": ${o.reason}`);
    }
  }
}

// ---- 3. FoldLayers divider integrity -------------------------------------------

function auditDividers(spec: ProjectSpec) {
  for (const comp of spec.comps) {
    const where = `comp "${comp.name}"`;
    comp.layers.forEach((l, i) => {
      const lw = `${where} layer ${i + 1}`;
      const isDividerName = /^[▾▸]\s/.test(l.name ?? "");
      const groups =
        l.shapes?.properties?.map((p) => p.name).filter((n) => n?.startsWith("FD-")) ?? [];
      const hasState = groups.some((g) => g === "FD-0" || g === "FD-1");
      const hasBoth = groups.includes("FD-0") && groups.includes("FD-1");
      if (hasBoth) add("divider", "error", lw, "divider carries both FD-0 and FD-1");
      if (isDividerName && !hasState) {
        add("divider", "error", `${lw} "${l.name}"`, "divider-named layer lacks FD-0/FD-1 group");
      }
      if (l.kind === "shape" && hasState && !isDividerName) {
        add("divider", "warn", lw, "shape layer carries FD-* groups but name lacks ▾/▸ prefix");
      }
      if (hasState && l.kind !== "shape") {
        add(
          "divider",
          "error",
          lw,
          "FD-* groups on non-shape layer — FoldLayers requires a vector layer",
        );
      }
      // folded members: contiguous layers below until next divider should be shy
      const folded = groups.includes("FD-1") || l.name?.startsWith("▸");
      if (folded) {
        let shyCount = 0;
        let memberCount = 0;
        for (let k = i + 1; k < comp.layers.length; k++) {
          const m = comp.layers[k]!;
          const mGroups =
            m.shapes?.properties?.map((p) => p.name).filter((n) => n?.startsWith("FD-")) ?? [];
          const mIsDivider = mGroups.some((g) => g === "FD-0" || g === "FD-1");
          if (mIsDivider) break;
          memberCount++;
          if (m.shy) shyCount++;
        }
        if (memberCount > 0 && shyCount === 0) {
          add("divider", "warn", lw, `folded divider has ${memberCount} members but none are shy`);
        }
        if (!comp.hideShyLayers) {
          add("divider", "error", where, "folded group present but comp.hideShyLayers is not set");
        }
      }
    });
  }
}

// ---- run ------------------------------------------------------------------------

const spec = compileProduction(pvProductionProject(), {
  materialComps: materialCompsByName(),
  onSectionLayer: (compName, layerIndex, sectionId) => {
    let m = sectionLayers.get(compName);
    if (!m) {
      m = new Map();
      sectionLayers.set(compName, m);
    }
    const arr = m.get(sectionId) ?? [];
    arr.push(layerIndex);
    m.set(sectionId, arr);
  },
});
// itemLabels are attached by pvProductionSpec, not the bare compiler — mirror
// that here so the audited spec matches what AE receives.
const fullSpec = pvProductionSpec();
spec.itemLabels = fullSpec.itemLabels;

for (const comp of spec.comps) auditComp(comp);
auditOverlap(spec);
auditDividers(spec);

// ---- report ---------------------------------------------------------------------

const order = { error: 0, warn: 1, info: 2 };
findings.sort((a, b) => order[a.severity] - order[b.severity]);
const counts = { error: 0, warn: 0, info: 0 };
for (const f of findings) counts[f.severity]++;
for (const f of findings) {
  console.log(
    `[${f.severity.toUpperCase().padEnd(5)}] ${f.check.padEnd(8)} ${f.where} — ${f.message}`,
  );
}
console.log(
  `\nlint:pv — ${counts.error} errors, ${counts.warn} warnings, ${counts.info} info ` +
    `(${spec.comps.length} comps, ${spec.comps.reduce((a, c) => a + c.layers.length, 0)} layers)`,
);
if (STRICT && counts.error + counts.warn > 0) process.exit(1);
