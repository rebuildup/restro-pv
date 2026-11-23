// Legacy master dump access + spec-layer cloning (issue #19 migration aid).
//
// The legacy master comp dump (pv/generated/05-master.ts) is the only
// remaining source of truth for scene content that has not been re-authored
// yet: vector chrome (step bands/cards/tabs), tracker null rigs, and the
// material-comp wiring values. This module lifts individual layers into
// `spec` section layers and rewrites legacy stack-index references
// (parents, Layer Control "Layer" params, thisComp.layer() expressions)
// into stable ref ids / {{ref:}} markers the compiler resolves against the
// NEW comp's own layer table.
//
// Both pv/scenes/production.ts (whole-master wiring) and pv/scenes/scene-b.ts
// (single-scene verification) build their clone sets through
// legacyCloneContext(); the emitted ref ids are the legacy layer names,
// which are already unique inside the material comp.

import { comp_05 } from "../generated/05-master.ts";
import { layerRef } from "../production/compile.ts";
import type { SectionLayerSpec } from "../production/model.ts";
import type { CompSpec, LayerSpec, PropNode } from "../spec/types.ts";

export const LEGACY_MASTER: CompSpec = comp_05;

const legacyByIdx = new Map<number, LayerSpec>();
const legacyByName = new Map<string, LayerSpec>();
for (const l of LEGACY_MASTER.layers) {
  legacyByIdx.set(l.index, l);
  if (!legacyByName.has(l.name)) legacyByName.set(l.name, l);
}

export function legacyLayer(name: string): LayerSpec {
  const l = legacyByName.get(name);
  if (!l) throw new Error('legacy master dump is missing layer "' + name + '"');
  return l;
}

function legacyIndexName(idx: number): string | undefined {
  return legacyByIdx.get(idx)?.name;
}

// ---- reference rewriting ------------------------------------------------------

const PROP_TREE_KEYS = [
  "transform",
  "masks",
  "effects",
  "shapes",
  "text",
  "timeRemap",
  "markers",
] as const;

/** Legacy stack indices referenced by a layer's Layer Control params and
 *  thisComp.layer(N) expressions. */
function indexRefsOf(layer: LayerSpec, out: Set<number>): void {
  const walk = (node: PropNode | undefined): void => {
    if (!node) return;
    if (node.matchName === "ADBE Layer Control-0001") {
      if (typeof node.value === "number") out.add(node.value);
      for (const k of node.keys ?? []) {
        if (typeof k.v === "number") out.add(k.v);
      }
    }
    if (typeof node.expression === "string") {
      const re = /thisComp\.layer\((\d+)\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(node.expression)) !== null) out.add(Number(m[1]));
    }
    for (const p of node.properties ?? []) walk(p);
  };
  for (const k of PROP_TREE_KEYS) walk(layer[k] as PropNode | undefined);
}

/** Layer names referenced by thisComp.layer("name") expressions. These
 *  resolve by display name at runtime, so the referenced layer must be
 *  emitted under the same name — the index-based closure cannot see them. */
function nameRefsOf(layer: LayerSpec, out: Set<string>): void {
  const walk = (node: PropNode | undefined): void => {
    if (!node) return;
    if (typeof node.expression === "string") {
      const re = /thisComp\.layer\(\s*["']([^"']+)["']\s*\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(node.expression)) !== null) out.add(m[1]);
    }
    for (const p of node.properties ?? []) walk(p);
  };
  for (const k of PROP_TREE_KEYS) walk(layer[k] as PropNode | undefined);
}

export interface LegacyCloneContext {
  /** Every ref id usable in `parent` / layerRef / {{ref:}} within the comp. */
  allRefIds: ReadonlySet<string>;
  /** Rig nulls auto-emitted for Layer Control / parent closure (shy-folded
   *  by the caller when appropriate — they still evaluate). */
  neededNulls: string[];
  /** Clone a legacy master layer; internal refs rewritten to ref ids. */
  layer(name: string): LayerSpec;
  /** Clone + wrap as a SectionLayerSpec (optional timing fn + parent ref). */
  sectionLayer(
    name: string,
    opts?: { time?: (c: LayerSpec) => void; parent?: string },
  ): SectionLayerSpec;
}

/**
 * Build a clone context for a set of explicitly emitted legacy layer names.
 * The emitted set is the seeds plus the transitive closure of:
 *   - Layer Control "Layer" params and thisComp.layer(N) expressions
 *   - parentIndex chains
 * Because rig nulls can themselves reference further nulls, the closure is
 * computed to a fixpoint. `sceneRefIds` names extra non-layer ref ids the
 * clones may target (e.g. material-comp section ids).
 */
export function legacyCloneContext(
  seedNames: string[],
  opts: { sceneRefIds?: readonly string[]; strict?: boolean } = {},
): LegacyCloneContext {
  const strict = opts.strict !== false;

  // Fixpoint closure over seeds: refs + parents of every emitted layer.
  const emitted = new Set<string>(seedNames);
  const queue = [...seedNames];
  while (queue.length) {
    const name = queue.pop() as string;
    const src = legacyByName.get(name);
    if (!src) throw new Error('legacyCloneContext: unknown seed layer "' + name + '"');
    const refs = new Set<number>();
    indexRefsOf(src, refs);
    if (src.parentIndex) refs.add(src.parentIndex);
    for (const idx of refs) {
      const depName = legacyIndexName(idx);
      if (depName === undefined) {
        if (strict) {
          throw new Error(
            `legacyCloneContext: "${name}" references stack index ${idx} outside the dump`,
          );
        }
        continue;
      }
      if (!emitted.has(depName)) {
        emitted.add(depName);
        queue.push(depName);
      }
    }
  }

  // Name-based expression refs (thisComp.layer("name")) bypass the index
  // closure; every referenced layer must be explicitly seeded into a
  // section or the expression breaks at runtime. Validate after the
  // fixpoint so transitively emitted layers are covered too.
  const sceneRefIds = new Set(opts.sceneRefIds ?? []);
  for (const name of emitted) {
    const src = legacyByName.get(name);
    if (!src) continue;
    const refs = new Set<string>();
    nameRefsOf(src, refs);
    for (const ref of refs) {
      if (emitted.has(ref) || sceneRefIds.has(ref)) continue;
      if (strict) {
        throw new Error(
          `legacyCloneContext: "${name}" expression references un-emitted layer "${ref}"`,
        );
      }
    }
  }

  const seedSet = new Set(seedNames);
  const neededNulls = [...emitted]
    .filter((n) => !seedSet.has(n))
    .sort();
  const allRefIds = new Set([...emitted, ...sceneRefIds]);

  function legacyIndexToRef(idx: number): number | ReturnType<typeof layerRef> {
    const name = legacyIndexName(idx);
    if (name !== undefined && allRefIds.has(name)) return layerRef(name);
    if (strict) {
      throw new Error(
        `legacyCloneContext: stack index ${idx} (${name ?? "?"}) is not emitted`,
      );
    }
    return idx;
  }

  function rewriteNodeRefs(node: PropNode): void {
    if (node.matchName === "ADBE Layer Control-0001") {
      if (typeof node.value === "number") node.value = legacyIndexToRef(node.value);
      for (const k of node.keys ?? []) {
        if (typeof k.v === "number") k.v = legacyIndexToRef(k.v);
      }
    }
    if (typeof node.expression === "string") {
      node.expression = node.expression.replace(
        /thisComp\.layer\((\d+)\)/g,
        (_m, idx: string) => {
          const name = legacyIndexName(Number(idx));
          // {{ref:}} resolves to `thisComp.layer(<new index>)` at compile time.
          if (name !== undefined && allRefIds.has(name)) return "{{ref:" + name + "}}";
          if (strict) {
            throw new Error(
              `legacyCloneContext: expression references un-emitted index ${idx} (${name ?? "?"})`,
            );
          }
          return _m;
        },
      );
    }
    for (const p of node.properties ?? []) rewriteNodeRefs(p);
  }

  function cloneLayer(name: string): LayerSpec {
    const src = legacyLayer(name);
    const c = JSON.parse(JSON.stringify(src)) as LayerSpec;
    c.index = 0;
    delete c.parentIndex;
    delete c.sourceCompIndex;
    for (const k of PROP_TREE_KEYS) {
      const tree = c[k] as PropNode | undefined;
      if (tree) rewriteNodeRefs(tree);
    }
    return c;
  }

  function parentRefOf(name: string): string | undefined {
    const src = legacyLayer(name);
    if (src.parentIndex === undefined || src.parentIndex === null) return undefined;
    const parentName = legacyIndexName(src.parentIndex);
    if (parentName === undefined) {
      throw new Error(`legacy layer "${name}" has parentIndex ${src.parentIndex} outside the dump`);
    }
    if (!allRefIds.has(parentName)) {
      throw new Error(`legacy layer "${name}" parents to "${parentName}", which is not emitted`);
    }
    return parentName;
  }

  return {
    allRefIds,
    neededNulls,
    layer: cloneLayer,
    sectionLayer(name, o) {
      const layer = cloneLayer(name);
      o?.time?.(layer);
      const parent = o?.parent ?? parentRefOf(name);
      return {
        id: name,
        content: { kind: "spec", layer },
        ...(parent ? { parent } : {}),
      };
    },
  };
}
