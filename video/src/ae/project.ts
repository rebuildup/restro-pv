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

// Selectable track-matte pairings (matted layer.index -> matte layer.index,
// both AE indices within the comp). The CompSpec dump records
// trackMatteType/isTrackMatte but not trackMatteLayer, so pairs are inferred
// from isTrackMatte flags plus name/time-window agreement:
//   - "STEP N card"  -> "STEP N draft/outline"   (name + identical in/out)
//   - "lens matte"   -> "Lens magnifier"         (name)
//   - "PV matte C"   -> "PV showreel"            (adjacent, zero-duration)
//   - "Shape Layer 1"-> lower "kai-zoom"         (adjacent stack position)
//   - "Shape Layer 2"-> "description"            (nearest unmatched pair)
//   - upper "kai-zoom" -> lower "kai-zoom"       (adjacent; comp-as-matte)
// PV ops needs no entries: its W* matte layers are already the adjacent
// i-1 rule. Confirm against tools/analysis/dump-mattes.jsx output when an AE
// session is available.
export function mattePairs(): Map<CompSpec, Map<number, number>> {
  const out = new Map<CompSpec, Map<number, number>>();
  const m = compByName("master");
  if (!m) return out;
  const pairs: Array<[number, number]> = [
    [3, 2],
    [10, 8],
    [23, 263],
    [172, 267],
    [174, 266],
    [176, 265],
    [178, 264],
    [235, 233],
    [236, 235],
  ];
  out.set(m, new Map(pairs));
  return out;
}
