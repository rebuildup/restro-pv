// Scene C render evidence: measures ink coverage / dominant colors in
// the strip viewport (WIN_X..WIN_X+WIN_W, WIN_Y..WIN_Y+WIN_H from
// video/src/scenes/SceneC.tsx) of PV-Master stills, one per work slot.
// Proves the three works render as visually distinct artworks.
// Run: bun tools/design/check-scene-c-stills.ts
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { PNG } from "pngjs";

const OUT = "docs/design/verification";
const PROTO = "docs/design/prototypes/scene-c";
mkdirSync(OUT, { recursive: true });
mkdirSync(PROTO, { recursive: true });

// Must match SceneC.tsx WIN_* constants.
const WIN_X = 490;
const WIN_Y = 60;
const WIN_W = 570;
const WIN_H = 960;
// Footer (index + title) starts ~y880 inside each cell; exclude the
// strip's bottom 90px so captions don't dominate the color stats.
const ART_BOTTOM = WIN_Y + WIN_H - 90;

const STILLS = [
  { work: 1, title: "筆墨", frame: 212, file: ".tmp/sc-c-w1.png", proto: "w1-f212-orbit.png" },
  { work: 2, title: "解彩", frame: 242, file: ".tmp/sc-c-w2.png", proto: "w2-f242-wave.png" },
  { work: 3, title: "筆構", frame: 270, file: ".tmp/sc-c-w3.png", proto: "w3-f270-fold.png" },
];

interface Stats {
  work: number;
  title: string;
  frame: number;
  file: string;
  inkPixelCount: number;
  inkFraction: number;
  meanInkRGB: [number, number, number];
  colorfulPixelCount: number;
  colorfulFraction: number;
  inkBBox: { x0: number; y0: number; x1: number; y1: number } | null;
}

const results: Stats[] = [];
for (const s of STILLS) {
  const png = PNG.sync.read(readFileSync(s.file));
  let ink = 0,
    colorful = 0,
    rSum = 0,
    gSum = 0,
    bSum = 0;
  let x0 = 1e9,
    y0 = 1e9,
    x1 = -1,
    y1 = -1;
  for (let y = WIN_Y; y < ART_BOTTOM; y++) {
    for (let x = WIN_X; x < WIN_X + WIN_W; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i],
        g = png.data[i + 1],
        b = png.data[i + 2];
      // ink = clearly non-white (any channel < 235)
      if (r < 235 || g < 235 || b < 235) {
        ink++;
        rSum += r;
        gSum += g;
        bSum += b;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        // colorful = saturated non-gray (proof palette / gradient)
        const mx = Math.max(r, g, b),
          mn = Math.min(r, g, b);
        if (mx - mn > 40 && mx < 250) colorful++;
      }
    }
  }
  const regionPx = WIN_W * (ART_BOTTOM - WIN_Y);
  results.push({
    work: s.work,
    title: s.title,
    frame: s.frame,
    file: s.file,
    inkPixelCount: ink,
    inkFraction: +(ink / regionPx).toFixed(4),
    meanInkRGB: ink
      ? [
          +(rSum / ink).toFixed(1),
          +(gSum / ink).toFixed(1),
          +(bSum / ink).toFixed(1),
        ]
      : [0, 0, 0],
    colorfulPixelCount: colorful,
    colorfulFraction: +(colorful / regionPx).toFixed(4),
    inkBBox: x1 < 0 ? null : { x0, y0, x1, y1 },
  });
  copyFileSync(s.file, `${PROTO}/${s.proto}`);
}

const report = {
  verifiedAt: new Date().toISOString(),
  viewport: { x: WIN_X, y: WIN_Y, w: WIN_W, h: ART_BOTTOM - WIN_Y },
  note: "ink = any channel <235; colorful = channel spread >40 (proof palette/gradient). Frames: W1 orbit beat, W2 wave beat, W3 fold beat — all works docked in the strip.",
  stills: results,
};
writeFileSync(`${OUT}/scene-c-stills.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
