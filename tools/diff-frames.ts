// Pixel-diff two beat-frame directories produced by render-pv-beats.ts.
// Uses ffmpeg SSIM and PSNR per frame pair; writes a JSON report and prints a
// summary. Frames present on only one side are reported as missing.
//
//   bun tools/diff-frames.ts <dirA> <dirB> [--out report.json]
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const [dirA, dirB] = positional.map((d) => resolve(d));
const outIdx = args.indexOf("--out");
const outPath = outIdx >= 0 ? resolve(args[outIdx + 1]) : join(ROOT, ".tmp", "frame-diff.json");
if (!dirA || !dirB || !existsSync(dirA) || !existsSync(dirB)) {
  console.error("usage: bun tools/diff-frames.ts <dirA> <dirB> [--out report.json]");
  process.exit(1);
}

// ffmpeg prints SSIM/PSNR stats to stderr and exits 0; spawnSync captures
// stderr regardless of exit status.
function ffmpegStats(filter: string, pa: string, pb: string): string {
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-i", pa, "-i", pb, "-filter_complex", filter, "-f", "null", "-"],
    { encoding: "utf8" },
  );
  return String(r.stderr ?? "");
}

const pngs = (d: string) =>
  readdirSync(d)
    .filter((f) => f.endsWith(".png"))
    .sort();
const aFiles = pngs(dirA),
  bFiles = pngs(dirB);
const common = aFiles.filter((f) => bFiles.includes(f));
const onlyA = aFiles.filter((f) => !bFiles.includes(f));
const onlyB = bFiles.filter((f) => !aFiles.includes(f));

interface FrameResult {
  file: string;
  ssim?: number;
  psnr?: number;
  error?: string;
}
const results: FrameResult[] = [];
for (const f of common) {
  const pa = join(dirA, f),
    pb = join(dirB, f);
  const r: FrameResult = { file: f };
  const se = ffmpegStats("ssim", pa, pb);
  const sm = se.match(/All:([\d.]+)/);
  if (sm) r.ssim = Number(sm[1]);
  const pe = ffmpegStats("psnr", pa, pb);
  const pm = pe.match(/average:([\d.]+)/);
  if (pm) r.psnr = Number(pm[1]);
  if (r.ssim === undefined && r.psnr === undefined) r.error = (se || pe).slice(-200);
  results.push(r);
}

const scored = results.filter((r) => r.ssim !== undefined);
const mean = scored.length ? scored.reduce((s, r) => s + (r.ssim ?? 0), 0) / scored.length : null;
const worst = [...scored].sort((x, y) => (x.ssim ?? 1) - (y.ssim ?? 1)).slice(0, 10);

const report = {
  schema: "restro-pv.frame-diff/v1",
  dirA,
  dirB,
  framesA: aFiles.length,
  framesB: bFiles.length,
  compared: common.length,
  onlyA,
  onlyB,
  meanSsim: mean,
  worst,
  results,
};
writeFileSync(outPath, JSON.stringify(report, null, 1));
console.log(
  `compared=${common.length} onlyA=${onlyA.length} onlyB=${onlyB.length} meanSSIM=${mean?.toFixed(4) ?? "n/a"}`,
);
console.log("worst frames:");
for (const w of worst) console.log(`  ${w.ssim?.toFixed(4)}  ${w.file}`);
console.log("wrote " + outPath);
