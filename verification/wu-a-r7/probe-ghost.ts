import { compByName } from "../../video/src/ae/project.ts";
import { worldMatrix } from "../../video/src/ae/transform.ts";
const a2 = compByName("PV A2")!;
const rec = a2.layers[0];
const w = worldMatrix(rec, a2.layers, 0.8, new Map());
console.log("reconstruction matrix:", w.matrix.map(v=>v.toFixed(4)).join(","));
