import { compByName } from "../video/src/ae/project.ts";
const comp = compByName("STEP3 infer [checkpoint before wipe removal]");
for (const l of comp!.layers) {
  if (!/FUDE (inferred|extend|points|outline)/.test(l.name)) continue;
  const names = (l.shapes?.properties ?? []).map((p: any) => `${p.matchName}:${p.name ?? ""}`);
  console.log("LAYER", l.name, "->", names.slice(0, 14).join(" | "));
}
