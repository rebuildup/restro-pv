import { compByName } from "../../video/src/ae/project.ts";
for (const name of ["PV glyph A2","bunkai","PV A2"]) {
  const c = compByName(name);
  if (!c) { console.log(name, "MISSING"); continue; }
  console.log("=== comp", name, c.width, "x", c.height, "layers", c.layers.length);
  for (const l of c.layers) {
    console.log(`  idx=${l.index} kind=${l.kind} name=${JSON.stringify(l.name)} parent=${l.parent??"-"}`);
  }
}
