// Scene E evaluation: diff PV-Master stills against PV-Chrome stills to
// isolate stage (scene) content from the confirmed chrome/background,
// then measure ink bbox/coverage per region and frame-to-frame motion.
// Usage: bun tools/sc-e-diff.ts <frame...>   (expects .tmp/sc-e-<f>.png and .tmp/chrome-<f>.png)
import { PNG } from "pngjs";
import { readFileSync, existsSync } from "node:fs";

const load = (f: string) => PNG.sync.read(readFileSync(f));

interface Region {
  name: string;
  x0: number;
  x1: number;
}
const REGIONS: Region[] = [
  { name: "left-col", x0: 0, x1: 460 },
  { name: "gap", x0: 460, x1: 480 },
  { name: "stage", x0: 480, x1: 1080 },
];

function diffBox(a: PNG, b: PNG, x0: number, x1: number, thresh = 24) {
  const box = { minX: 1e9, minY: 1e9, maxX: -1, maxY: -1, n: 0 };
  for (let y = 0; y < a.height; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * a.width + x) * 4;
      const d =
        Math.abs(a.data[i] - b.data[i]) +
        Math.abs(a.data[i + 1] - b.data[i + 1]) +
        Math.abs(a.data[i + 2] - b.data[i + 2]);
      if (d > thresh) {
        box.n++;
        if (x < box.minX) box.minX = x;
        if (x > box.maxX) box.maxX = x;
        if (y < box.minY) box.minY = y;
        if (y > box.maxY) box.maxY = y;
      }
    }
  }
  return box;
}

const fmt = (b: { n: number; minX: number; minY: number; maxX: number; maxY: number }) =>
  b.n === 0
    ? "clean"
    : `n=${b.n} bbox=[${b.minX},${b.minY}]-[${b.maxX},${b.maxY}]`;

const frames = process.argv.slice(2).map(Number);
const imgs = new Map<number, { m: PNG; c: PNG }>();
for (const f of frames) {
  const mp = `.tmp/sc-e-${f}.png`;
  const cp = `.tmp/chrome-${f}.png`;
  if (!existsSync(mp) || !existsSync(cp)) {
    console.log(`skip f${f}: missing ${!existsSync(mp) ? mp : cp}`);
    continue;
  }
  imgs.set(f, { m: load(mp), c: load(cp) });
}

// 1) master-vs-chrome per region: scene content footprint
console.log("== scene-content footprint (PV-Master minus PV-Chrome) ==");
for (const f of [...imgs.keys()].sort((a, b) => a - b)) {
  const { m, c } = imgs.get(f)!;
  const parts = REGIONS.map((r) => `${r.name}: ${fmt(diffBox(m, c, r.x0, r.x1))}`);
  console.log(`f${f}  ${parts.join("  |  ")}`);
}

// 2) consecutive master-vs-master diff inside stage: motion magnitude
console.log("\n== frame-to-frame change inside stage x[480,1080] (master vs master) ==");
const sorted = [...imgs.keys()].sort((a, b) => a - b);
for (let i = 1; i < sorted.length; i++) {
  const f0 = sorted[i - 1], f1 = sorted[i];
  const b = diffBox(imgs.get(f0)!.m, imgs.get(f1)!.m, 480, 1080, 30);
  // also left col for chrome stability
  const bl = diffBox(imgs.get(f0)!.m, imgs.get(f1)!.m, 0, 460, 30);
  console.log(`f${f0}->f${f1}: stage ${fmt(b)}   leftcol ${fmt(bl)}`);
}

// 3) left-col stability during CTA window: master vs chrome should be ~0
//    and master-vs-master diff in left col should be ~0 after f427.
console.log("\n== left column diff vs chrome (should be ~clean) ==");
for (const f of sorted) {
  const { m, c } = imgs.get(f)!;
  console.log(`f${f}: ${fmt(diffBox(m, c, 0, 460, 12))}`);
}
