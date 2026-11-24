import { compByName } from "../../video/src/ae/project.ts";
import { compStrokes } from "../../video/src/scenes/glyph.tsx";

// all named strokes in bunkai (any runs)
const b = compStrokes("bunkai", { pattern: /^(STROKE_\d+_runs\d+|Ae_Restro.*)$/, poseT: 0.5 });
const bnames = new Set(b.strokes.map(s=>s.name));
console.log("bunkai strokes:", [...bnames].sort().join(", "));

// FUDE layers in PV glyph A2 and their referenced stroke names
const a2 = compByName("PV glyph A2")!;
for (const l of a2.layers) {
  const m = l.name.match(/STROKE_\d+_runs\d+/);
  console.log("FUDE", l.index, l.name, "->", m?.[0] ?? "-", m && bnames.has(m[0]) ? "MATCH" : "");
}
