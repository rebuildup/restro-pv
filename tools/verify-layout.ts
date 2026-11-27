#!/usr/bin/env bun
// Issue #30 layout-contract pixel verification.
//
// Renders representative frames of PV-Master (full comp: base + stage +
// left guard + chrome overlay) and PV-Chrome (chrome only, no stage) and
// asserts that the confirmed left column is pixel-identical between them.
// Any scene content that reaches x < 455 must be invisible in the final
// composite — the guard/overlay planes repaint it.
//
//   bun tools/verify-layout.ts [--frames 12,60,...] [--out .tmp/layout-verify]
//
// Exit code 0 = contract holds (left-region SSIM >= 0.999 on every frame).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VIDEO = join(ROOT, "video");
const args = process.argv.slice(2);
const opt = (flag: string, dflt: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : dflt;
};

// Contract frames at 24fps covering every stage window plus the head.
// t = 0.0 / 0.5 / 2.5 / 4.5 / 6.5 / 9.5 / 13.5 / 17.5 / 19.5
const DEFAULT_FRAMES = [0, 12, 60, 108, 156, 228, 324, 420, 468];
const frames = opt("--frames", DEFAULT_FRAMES.join(","))
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n));
const outDir = resolve(opt("--out", join(ROOT, ".tmp", "layout-verify")));
const COMPS = ["PV-Master", "PV-Chrome"] as const;
const SSIM_THRESHOLD = 0.999;
// Left-column crop: ends inside the 460-480 safety gap so intentional
// bleed near the boundary is not flagged.
const CROP = "crop=455:1080:0:0";

mkdirSync(outDir, { recursive: true });

function still(comp: string, frame: number): string {
  const png = join(outDir, `${comp}-f${String(frame).padStart(4, "0")}.png`);
  if (existsSync(png)) return png;
  const r = spawnSync(
    "bunx",
    ["remotion", "still", "src/index.ts", comp, png, `--frame=${frame}`],
    { cwd: VIDEO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (r.status !== 0 || !existsSync(png)) {
    throw new Error(`remotion still failed for ${comp} frame ${frame}:\n${r.stderr ?? r.stdout}`);
  }
  return png;
}

function leftSsim(pa: string, pb: string): number {
  const filter = `[0:v]${CROP}[a];[1:v]${CROP}[b];[a][b]ssim`;
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-i", pa, "-i", pb, "-filter_complex", filter, "-f", "null", "-"],
    { encoding: "utf8" },
  );
  const m = /All:([\d.]+)/.exec(String(r.stderr ?? ""));
  if (!m) throw new Error(`ffmpeg ssim produced no score for ${pa}`);
  return Number(m[1]);
}

const report: { frame: number; ssim: number; pass: boolean }[] = [];
let failures = 0;
for (const frame of frames) {
  const a = still("PV-Master", frame);
  const b = still("PV-Chrome", frame);
  const ssim = leftSsim(a, b);
  const pass = ssim >= SSIM_THRESHOLD;
  if (!pass) failures++;
  report.push({ frame, ssim, pass });
  console.log(
    `frame ${String(frame).padStart(4)}  left-column SSIM ${ssim.toFixed(6)}  ${pass ? "PASS" : "FAIL"}`,
  );
}

const outJson = join(outDir, "report.json");
writeFileSync(outJson, JSON.stringify({ threshold: SSIM_THRESHOLD, crop: CROP, report }, null, 2));
console.log(
  `\n${report.length - failures}/${report.length} frames pass (threshold ${SSIM_THRESHOLD})`,
);
console.log(`report: ${outJson}`);
process.exit(failures === 0 ? 0 : 1);
