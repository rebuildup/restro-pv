// Compile-time integrity gate for the generated AE model. This cannot
// replace AE's real expressionError or rendered-frame verification.
import { parse } from "acorn";
import type { LayerSpec, ProjectSpec, PropNode } from "../model/types.ts";

export interface ProductionIssue {
  comp: string;
  layer?: string;
  code: string;
  message: string;
}

function propertyNodes(node: PropNode | undefined, visit: (node: PropNode) => void): void {
  if (!node) return;
  visit(node);
  for (const child of node.properties ?? []) propertyNodes(child, visit);
}

function nodes(layer: LayerSpec, visit: (node: PropNode) => void): void {
  for (const node of [
    layer.transform, layer.masks, layer.effects,
    layer.shapes, layer.text, layer.timeRemap, layer.markers,
  ]) propertyNodes(node, visit);
}

export function lintProductionProject(project: ProjectSpec): ProductionIssue[] {
  const issues: ProductionIssue[] = [];
  const error = (comp: string, code: string, message: string, layer?: string): void => {
    issues.push({ comp, code, message, layer });
  };
  const names = new Set<string>();
  for (const comp of project.comps) {
    if (names.has(comp.name)) error(comp.name, "DUPLICATE_COMP", "generated comp name is ambiguous");
    names.add(comp.name);
    if (comp.width <= 0 || comp.height <= 0 || comp.duration <= 0 || comp.frameRate <= 0) {
      error(comp.name, "COMP_BOUNDS", "invalid comp dimensions/duration");
    }
    const layerByName = new Map<string, LayerSpec>();
    for (const [i, layer] of comp.layers.entries()) {
      if (layer.index !== i + 1) error(comp.name, "LAYER_ORDER", "noncanonical stack index", layer.name);
      if (layerByName.has(layer.name)) error(comp.name, "DUPLICATE_LAYER", "ambiguous layer name", layer.name);
      layerByName.set(layer.name, layer);
      if (project.organizeProject && (!layer.label || layer.label < 1 || layer.label > 16)) {
        error(comp.name, "UNLABELED", "AE layer must have a valid label color slot", layer.name);
      }
      if (layer.foldDivider && (layer.kind !== "shape" || layer.enabled !== false)) {
        error(comp.name, "FOLD_IDENTITY", "FoldLayers divider must be non-rendering ShapeLayer", layer.name);
      }
      if (
        layer.inPoint === undefined || layer.outPoint === undefined ||
        layer.inPoint < 0 || layer.outPoint > comp.duration + 1e-6 ||
        layer.inPoint >= layer.outPoint
      ) error(comp.name, "TRIM", "invalid or absent explicit layer trim", layer.name);
      if (layer.parentIndex !== undefined && layer.parentIndex !== null) {
        if (!Number.isInteger(layer.parentIndex) || layer.parentIndex < 1 ||
            layer.parentIndex > comp.layers.length || layer.parentIndex === layer.index) {
          error(comp.name, "PARENT", "invalid parent layer index", layer.name);
        }
      }
      if (layer.kind === "comp" && layer.sourceCompIndex !== undefined) {
        const src = project.comps[layer.sourceCompIndex];
        if (!src || src.name !== layer.source) error(comp.name, "SOURCE", "invalid generated comp reference", layer.name);
      }
      nodes(layer, (node) => {
        if (node.matchName === "ADBE Layer Control-0001") {
          const check = (index: unknown): void => {
            if (typeof index !== "number" || index === 0) return;
            if (!Number.isInteger(index) || index < 1 || index > comp.layers.length) {
              error(comp.name, "LAYER_CONTROL", "unresolved AE layer index " + index, layer.name);
            }
          };
          check(node.value);
          for (const key of node.keys ?? []) check(key.v);
        }
        if (node.expression) {
          try {
            parse(node.expression, { ecmaVersion: 2022, allowReturnOutsideFunction: true });
          } catch (e) {
            error(comp.name, "EXPRESSION_SYNTAX", String(e), layer.name);
          }
          // Names in these literal links can be proven at compile time.
          for (const match of node.expression.matchAll(/thisComp\.layer\(\s*["']([^"']+)["']\s*\)/g)) {
            if (!layerByName.has(match[1]) && !comp.layers.some((x) => x.name === match[1])) {
              error(comp.name, "EXPRESSION_REFERENCE", "missing thisComp.layer " + match[1], layer.name);
            }
          }
          if (/thisComp\.layer\(\s*\d+\s*\)/.test(node.expression)) {
            error(comp.name, "UNSTABLE_EXPRESSION", "literal AE index is not a stable reference", layer.name);
          }
        }
      });
    }
    // A null is kept only when it is actually referenced. For dynamic
    // expressions a correct static proof is impossible: AE must inspect them.
    for (const layer of comp.layers) {
      if (layer.kind !== "null") continue;
      let referenced = comp.layers.some((other) => other.parentIndex === layer.index);
      for (const other of comp.layers) {
        nodes(other, (node) => {
          if (node.matchName === "ADBE Layer Control-0001") {
            if (node.value === layer.index || node.keys?.some((k) => k.v === layer.index)) referenced = true;
          }
          if (node.expression?.includes('layer("' + layer.name + '")') ||
              node.expression?.includes("layer('" + layer.name + "')")) referenced = true;
          if (node.expression && /thisComp\.layer\(\s*[^"'\d]/.test(node.expression)) {
            // Cannot classify a dynamic reference as unused.
            referenced = true;
            error(comp.name, "DYNAMIC_REFERENCE", "null use cannot be proven; migrate expression to stable ID", other.name);
          }
        });
      }
      if (!referenced) error(comp.name, "UNUSED_NULL", "orphan null must be removed", layer.name);
    }
  }
  return issues;
}

export function assertProductionProject(project: ProjectSpec): void {
  const failures = lintProductionProject(project);
  if (failures.length) {
    throw new Error(failures.map((x) => [x.comp, x.layer, x.code, x.message].filter(Boolean).join(" / ")).join("\n"));
  }
}
