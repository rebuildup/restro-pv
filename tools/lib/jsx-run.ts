// Per-run JSX execution contract.
//
// build-jsx.ts bakes artifact paths (__SAVE_PATH_BAKED, __REPORT_PATH_BAKED,
// __PROGRESS_PATH_BAKED, __WARNINGS_PATH_BAKED) into each generated JSX. A
// runner cannot assume where a given JSX writes its completion marker, and
// fixed shared paths let stale .done files impersonate a new run.
//
// prepareRun() solves both: it reads the baked paths out of the JSX, then
// materializes a per-run copy under .tmp/run/<runId>/ whose report,
// progress and warnings paths are unique to that execution. The save path
// is kept (it is the deliverable). executeRun() waits only on that run's
// report.done marker, verifies freshness, parses the report and checks the
// saved AEP — so every execution maps 1:1 to {runId, jsx sha256, script,
// report, progress, warnings, save, result}.
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

export interface RunPaths {
  runId: string;
  jsxPath: string;
  jsxSha256: string;
  runDir: string;
  scriptPath: string;
  reportPath: string;
  donePath: string;
  progressPath: string;
  warningsPath: string;
  savePath: string;
}

export type RunStatus =
  | "ok"
  | "failed-report-errors"
  | "failed-no-output"
  | "failed-unreadable-report"
  | "unknown-timeout";

export interface RunResult {
  status: RunStatus;
  reason?: string;
  waitedMs: number;
  report?: { warnings?: number; errors?: number; errList?: string[]; warnList?: string[] };
  output?: { path: string; bytes: number; sha256: string } | null;
}

const BAKED = {
  save: /var __SAVE_PATH_BAKED = ("(?:[^"\\]|\\.)*")/,
  report: /var __REPORT_PATH_BAKED = ("(?:[^"\\]|\\.)*")/,
  progress: /var __PROGRESS_PATH_BAKED = ("(?:[^"\\]|\\.)*")/,
  warnings: /var __WARNINGS_PATH_BAKED = ("(?:[^"\\]|\\.)*")/,
} as const;

function bakedPath(jsx: string, key: keyof typeof BAKED, jsxPath: string): string {
  const m = jsx.match(BAKED[key]);
  if (!m) {
    throw new Error(
      `${jsxPath}: missing baked __${key.toUpperCase()}_PATH_BAKED — ` +
        "only JSX built by tools/build-jsx.ts carries the run contract",
    );
  }
  return JSON.parse(m[1]) as string;
}

function sha256File(p: string): string {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

const fwd = (p: string) => p.replace(/\\/g, "/");

/**
 * Materialize a per-run executable copy of the JSX. Returns the run
 * manifest paths; the rewritten script is what the host should execute.
 */
export function prepareRun(jsxPath: string, rootDir: string): RunPaths {
  const abs = resolve(jsxPath);
  const jsx = readFileSync(abs, "utf8");
  const savePath = bakedPath(jsx, "save", abs);
  const jsxSha256 = createHash("sha256").update(jsx).digest("hex");
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${jsxSha256.slice(0, 12)}`;
  const runDir = resolve(rootDir, ".tmp", "run", runId);
  mkdirSync(runDir, { recursive: true });

  const reportPath = resolve(runDir, "report.json");
  const progressPath = resolve(runDir, "progress.log");
  const warningsPath = resolve(runDir, "warnings.jsonl");
  const scriptPath = resolve(runDir, "script.jsx");

  // Redirect only the per-run artifacts; the save path stays baked so the
  // JSX still writes its declared AEP output.
  let script = jsx;
  script = script.replace(
    BAKED.report,
    `var __REPORT_PATH_BAKED = ${JSON.stringify(fwd(reportPath))}`,
  );
  script = script.replace(
    BAKED.progress,
    `var __PROGRESS_PATH_BAKED = ${JSON.stringify(fwd(progressPath))}`,
  );
  script = script.replace(
    BAKED.warnings,
    `var __WARNINGS_PATH_BAKED = ${JSON.stringify(fwd(warningsPath))}`,
  );
  writeFileSync(scriptPath, script);

  const paths: RunPaths = {
    runId,
    jsxPath: abs,
    jsxSha256,
    runDir,
    scriptPath,
    reportPath,
    donePath: reportPath + ".done",
    progressPath,
    warningsPath,
    savePath,
  };
  writeFileSync(
    resolve(runDir, "manifest.json"),
    JSON.stringify(
      {
        schema: "restro-pv.jsx-run/v1",
        runId,
        jsx: { path: abs, sha256: jsxSha256 },
        script: scriptPath,
        report: reportPath,
        done: paths.donePath,
        progress: progressPath,
        warnings: warningsPath,
        save: savePath || null,
      },
      null,
      2,
    ),
  );
  return paths;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait for this run's report.done, then classify the outcome. The caller
 * supplies the launch (e.g. spawning AfterFX.exe -r scriptPath); this
 * function only observes the filesystem contract.
 */
export async function executeRun(
  paths: RunPaths,
  launch: () => void,
  opts: { timeoutMs: number; pollMs?: number; log?: (msg: string) => void } = {
    timeoutMs: 3_600_000,
  },
): Promise<RunResult> {
  const pollMs = opts.pollMs ?? 3000;
  const log = opts.log ?? (() => {});
  const started = Date.now();

  // Fresh markers: this run's directory is new, but clear anyway so a
  // retried prepare into the same second can never see a stale .done.
  for (const p of [paths.donePath, paths.reportPath, paths.progressPath, paths.warningsPath]) {
    rmSync(p, { force: true });
  }

  launch();
  log(`run ${paths.runId}: jsx=${paths.jsxSha256.slice(0, 12)} report=${paths.reportPath}`);

  let progressOffset = 0;
  const tailProgress = () => {
    if (!existsSync(paths.progressPath)) return;
    const text = readFileSync(paths.progressPath, "utf8");
    const chunk = text.slice(progressOffset);
    progressOffset = text.length;
    for (const line of chunk.split("\n")) {
      if (!line.trim()) continue;
      const m = line.match(/^\d+\t(\d+)\t(.*)$/);
      log(`  [progress ${m ? `+${(Number(m[1]) / 1000).toFixed(1)}s` : ""}] ${m ? m[2] : line}`);
    }
  };

  const deadline = started + opts.timeoutMs;
  for (;;) {
    tailProgress();
    if (existsSync(paths.donePath)) {
      const doneMtime = statSync(paths.donePath).mtimeMs;
      if (doneMtime >= started - 1000) break;
      // Stale marker inside a fresh dir should be impossible; treat as not-done.
      log("ignoring stale done marker (mtime predates run)");
      rmSync(paths.donePath, { force: true });
    }
    if (Date.now() > deadline) {
      return {
        status: "unknown-timeout",
        reason:
          "report.done not seen before deadline; the JSX may still be running " +
          "inside AE or may have finished without writing. Do NOT respawn — " +
          `inspect ${paths.runDir} and the AE state first.`,
        waitedMs: Date.now() - started,
      };
    }
    await sleep(pollMs);
  }

  tailProgress();
  const waitedMs = Date.now() - started;

  let report: RunResult["report"];
  try {
    report = JSON.parse(readFileSync(paths.reportPath, "utf8"));
  } catch (error) {
    return { status: "failed-unreadable-report", reason: String(error), waitedMs };
  }

  // Save-phase errors are appended to __ERR after the first report write;
  // the runtime re-writes the report after saving, so this parse includes
  // them. The AEP itself must also exist and be fresh.
  const aepOk =
    paths.savePath &&
    existsSync(paths.savePath) &&
    statSync(paths.savePath).size > 0 &&
    statSync(paths.savePath).mtimeMs >= started - 1000;
  const output = aepOk
    ? { path: paths.savePath, bytes: statSync(paths.savePath).size, sha256: sha256File(paths.savePath) }
    : null;

  const errors = report?.errors ?? -1;
  if (errors !== 0) {
    return {
      status: "failed-report-errors",
      reason: `${errors} errors recorded by runtime`,
      waitedMs,
      report: report ?? undefined,
      output,
    };
  }
  if (paths.savePath && !aepOk) {
    return {
      status: "failed-no-output",
      reason: "report clean but output AEP missing/empty/stale",
      waitedMs,
      report: report ?? undefined,
      output,
    };
  }
  return { status: "ok", waitedMs, report: report ?? undefined, output };
}
