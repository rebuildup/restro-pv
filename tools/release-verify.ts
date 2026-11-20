#!/usr/bin/env bun
// Release-candidate verification: full-length render of the generated AEP.
// ONLY for frozen candidates — this renders every frame and is slow.
//
//   bun tools/release-verify.ts [--aep dist/pv-generated.aep] [--comp master]
//                                [--out dist/pv-release.mp4]
//
// Steps: open generated AEP -> render every frame of the target comp to PNG
// -> mux with the BGM track via ffmpeg -> 43-beat stills -> machine-readable
// report. Structural verification is a prerequisite (run verify first); this
// command checks the report's status and refuses stale outputs.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AfterEffects } from "@ido-bata/ae-a8n";
import { resolveAe } from "./lib/host.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (flag: string, dflt: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : dflt;
};

const aep = resolve(opt("--aep", join(ROOT, "dist", "pv-generated.aep")));
const compName = opt("--comp", "master");
const outMp4 = resolve(opt("--out", join(ROOT, "dist", "pv-release.mp4")));
const framesDir = join(ROOT, ".tmp", "release-frames");
const beatsDir = join(ROOT, "verification", "release-beats");
const reportPath = join(ROOT, ".tmp", "release-report.json");
const bgm = join(ROOT, "assets", "audio", "drums-and-somps-background-music-458414.mp3");

const sha256 = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const report: Record<string, unknown> = {
  schema: "restro-pv.release-verify/v1",
  startedAt: new Date().toISOString(),
  aep,
  comp: compName,
  out: outMp4,
  steps: [] as { id: string; ok: boolean; detail: string }[],
};
const steps = report.steps as { id: string; ok: boolean; detail: string }[];
const step = (id: string, ok: boolean, detail: string) => {
  steps.push({ id, ok, detail });
  console.log(`[${ok ? " OK " : "FAIL"}] ${id}: ${detail}`);
};
function finish(status: string) {
  report.status = status;
  report.finishedAt = new Date().toISOString();
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`release-verify: ${status} (report: ${reportPath})`);
  process.exit(status === "ok" ? 0 : 1);
}

if (!existsSync(aep)) {
  console.error("generated AEP missing: " + aep);
  process.exit(1);
}
const verifyReport = join(ROOT, ".tmp", "verify-report.json");
if (existsSync(verifyReport)) {
  const v = JSON.parse(readFileSync(verifyReport, "utf8"));
  step("verify.prereq", v.status === "ok", `verify-report status=${v.status}`);
  if (v.status !== "ok") finish("fail-verify-prereq");
} else {
  step("verify.prereq", false, "no verify-report.json — run bun run verify first");
  finish("fail-verify-prereq");
}
step("aep.identity", true, `sha256 ${sha256(aep).slice(0, 16)}…`);

const aeHost = await resolveAe();
const ae = await AfterEffects.launch({ installDir: aeHost.installDir, timeoutMs: 300_000 });
try {
  const project = await ae.openProject(aep, { unsavedChanges: "discard" });
  const comp = await project.comp(compName);
  const info = await comp.info();
  const totalFrames = Math.round(info.duration * info.frameRate);
  step(
    "comp.info",
    true,
    `${info.name} ${info.width}x${info.height} ${info.duration.toFixed(3)}s @${info.frameRate}fps = ${totalFrames} frames`,
  );

  mkdirSync(framesDir, { recursive: true });
  rmSync(outMp4, { force: true });
  const rendered: string[] = [];
  for (let f = 0; f < totalFrames; f++) {
    const r = await comp.renderFrame(f, { subdirectory: "release-frames", prefix: "f" });
    rendered.push(r.path);
    if (f % 48 === 0 || f === totalFrames - 1) console.log(`  frame ${f + 1}/${totalFrames}`);
  }
  step(
    "frames.render",
    rendered.length === totalFrames,
    `${rendered.length}/${totalFrames} frames rendered`,
  );
  if (rendered.length !== totalFrames) finish("fail-frames");

  // Normalise to a sequential image2 sequence for ffmpeg.
  const { copyFileSync } = await import("node:fs");
  const seqDir = join(framesDir, "seq");
  mkdirSync(seqDir, { recursive: true });
  rendered.forEach((p, i) => {
    copyFileSync(p, join(seqDir, "f" + String(i).padStart(5, "0") + ".png"));
  });
  const ffArgs = [
    "-y",
    "-framerate",
    String(info.frameRate),
    "-i",
    join(seqDir, "f%05d.png"),
    "-i",
    bgm,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    outMp4,
  ];
  const ff = spawnSync("ffmpeg", ffArgs, { encoding: "utf8" });
  const ffOk = ff.status === 0 && existsSync(outMp4) && readFileSync(outMp4).length > 0;
  step("video.mux", ffOk, ffOk ? outMp4 : (ff.stderr ?? "").slice(-500));
  if (!ffOk) finish("fail-mux");

  // 43-beat stills of the same comp for visual review
  const beat = spawnSync(
    process.execPath,
    [
      "tools/render-pv-beats.ts",
      "--aep",
      aep,
      "--comp",
      compName,
      "--out",
      beatsDir,
      "--bpm",
      "128",
    ],
    { cwd: ROOT, encoding: "utf8" },
  );
  step(
    "beats.render",
    beat.status === 0,
    beat.status === 0 ? `${beatsDir}` : (beat.stderr ?? "").slice(-300),
  );
} finally {
  await ae.close({ unsavedChanges: "discard" }).catch(() => {});
}

finish(steps.every((s) => s.ok) ? "ok" : "fail-steps");
