import {
  GENERATED_COMPS,
  GENERATED_FOOTAGE,
} from "../../../pv/generated/index.ts";
import type { CompSpec, FootageSpec, LayerSpec } from "../../../pv/model/types.ts";

export { GENERATED_COMPS, GENERATED_FOOTAGE };
export type { CompSpec, FootageSpec, LayerSpec };

// CompSpec references comps by sourceCompIndex into the GENERATED_COMPS
// array (AE allows duplicate names). Footage resolves by spec name.

export function compByIndex(index: number | undefined): CompSpec | undefined {
  if (index === undefined) return undefined;
  return GENERATED_COMPS[index];
}

export function compByName(name: string): CompSpec | undefined {
  return GENERATED_COMPS.find((c) => c.name === name);
}

export function footageByName(name: string | undefined): FootageSpec | undefined {
  if (!name) return undefined;
  return GENERATED_FOOTAGE.find((f) => f.name === name);
}

export function masterComp(): CompSpec {
  const m = compByName("master");
  if (!m) throw new Error("master comp not found in GENERATED_COMPS");
  return m;
}
