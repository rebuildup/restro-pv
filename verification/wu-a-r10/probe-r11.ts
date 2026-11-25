import { applyMasterPatches } from "../../video/src/ae/masterPatch.ts";
applyMasterPatches();
const { compStrokes } = await import("../../video/src/scenes/glyph.tsx");
const { strokes } = compStrokes("master", { indices: [239, 254], poseT: 1.46 });
const named = strokes.filter((s) => /^STROKE_\d+_runs[456]$/.test(s.name));
console.log("count:", named.length);
let u = [1e9, 1e9, -1e9, -1e9];
let cx = 0, cy = 0;
for (const s of named) {
  u = [Math.min(u[0], s.bbox[0]), Math.min(u[1], s.bbox[1]), Math.max(u[2], s.bbox[2]), Math.max(u[3], s.bbox[3])];
  cx += s.center[0]; cy += s.center[1];
  if (["STROKE_015_runs4", "STROKE_016_runs4", "STROKE_017_runs4"].includes(s.name))
    console.log(s.name, "bbox=", s.bbox.map((v) => Math.round(v)), "center=", s.center.map((v) => Math.round(v)));
}
console.log("union=", u.map((v) => Math.round(v)), "centroid=", (cx / named.length).toFixed(1), (cy / named.length).toFixed(1));
// x-rank sorted centers for wave sanity
const sorted = [...named].sort((a, b) => a.center[0] - b.center[0]);
console.log("x-rank:", sorted.map((s) => `${s.name}@${Math.round(s.center[0])}`).join(" "));
