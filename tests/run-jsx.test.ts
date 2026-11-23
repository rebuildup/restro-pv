// Simulated (AE-free) verification of the per-run JSX completion contract
// in tools/lib/jsx-run.ts. A fake "JSX" carries the same baked path
// variables build-jsx emits; the test executor runs it under bun instead of
// AfterFX.exe, and executeRun must classify each outcome correctly.

import { afterAll, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { executeRun, prepareRun } from "../tools/lib/jsx-run.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(join(tmpdir(), "jsx-run-test-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

let seq = 0;
function fakeJsx(body: string, savePath: string): string {
  const p = join(tmp, `fake-${seq++}.jsx`);
  writeFileSync(
    p,
    [
      'import { writeFileSync as w, mkdirSync as m } from "node:fs";',
      'import { dirname as d } from "node:path";',
      "(function(){",
      `  var __SAVE_PATH_BAKED = ${JSON.stringify(savePath.replace(/\\/g, "/"))};`,
      '  var __REPORT_PATH_BAKED = "C:/nonexistent/report.json";',
      '  var __PROGRESS_PATH_BAKED = "C:/nonexistent/progress.log";',
      '  var __WARNINGS_PATH_BAKED = "C:/nonexistent/warnings.jsonl";',
      body,
      "})();",
      "",
    ].join("\n"),
  );
  return p;
}

const launchWith = (scriptPath: string) => () => {
  const c = spawn(process.execPath, [scriptPath], { stdio: "ignore", detached: true });
  c.unref();
};

const finishBody = (errors: number, writeSave: boolean) => `
  var rep = JSON.stringify({warnings:0,errors:${errors},errList:${errors ? '["boom"]' : "[]"},warnList:[]});
  m(d(__REPORT_PATH_BAKED), {recursive:true});
  w(__REPORT_PATH_BAKED, rep);
  w(__REPORT_PATH_BAKED + ".done", "done");
  w(__PROGRESS_PATH_BAKED, "1\\t100\\tbuildProject returned");
  ${writeSave ? `m(d(__SAVE_PATH_BAKED), {recursive:true}); w(__SAVE_PATH_BAKED, "aep-bytes");` : ""}
`;

describe("jsx-run per-run contract", () => {
  test("prepareRun rewrites artifact paths into a unique run dir", () => {
    const jsx = fakeJsx("", join(tmp, "out.aep"));
    const a = prepareRun(jsx, ROOT);
    const b = prepareRun(jsx, ROOT);
    expect(a.runId).not.toBe(b.runId);
    expect(a.reportPath.replace(/\\/g, "/")).toContain(".tmp/run/");
    expect(a.reportPath).not.toBe(b.reportPath);
    expect(a.jsxSha256).toMatch(/^[0-9a-f]{64}$/);
    const script = readFileSync(a.scriptPath, "utf8");
    expect(script).toContain(a.reportPath.replace(/\\/g, "/"));
    expect(script).not.toContain("C:/nonexistent/report.json");
    // Save path is preserved (it is the deliverable).
    expect(script).toContain(join(tmp, "out.aep").replace(/\\/g, "/"));
    expect(JSON.parse(readFileSync(join(a.runDir, "manifest.json"), "utf8")).runId).toBe(a.runId);
  });

  test("ok: report + fresh done + saved AEP classify as ok", async () => {
    const save = join(tmp, "ok-out.aep");
    const jsx = fakeJsx(finishBody(0, true), save);
    const paths = prepareRun(jsx, ROOT);
    const r = await executeRun(paths, launchWith(paths.scriptPath), {
      timeoutMs: 15_000,
      pollMs: 50,
    });
    expect(r.status).toBe("ok");
    expect(r.report?.errors).toBe(0);
    expect(r.output?.path.replace(/\\/g, "/")).toBe(save.replace(/\\/g, "/"));
  });

  test("report errors classify as failed-report-errors", async () => {
    const save = join(tmp, "err-out.aep");
    const jsx = fakeJsx(finishBody(2, true), save);
    const paths = prepareRun(jsx, ROOT);
    const r = await executeRun(paths, launchWith(paths.scriptPath), {
      timeoutMs: 15_000,
      pollMs: 50,
    });
    expect(r.status).toBe("failed-report-errors");
    expect(r.report?.errList).toEqual(["boom"]);
  });

  test("clean report without AEP classifies as failed-no-output", async () => {
    const save = join(tmp, "missing-out.aep");
    const jsx = fakeJsx(finishBody(0, false), save);
    const paths = prepareRun(jsx, ROOT);
    const r = await executeRun(paths, launchWith(paths.scriptPath), {
      timeoutMs: 15_000,
      pollMs: 50,
    });
    expect(r.status).toBe("failed-no-output");
  });

  test("no artifacts classify as unknown-timeout, never ok", async () => {
    const save = join(tmp, "silent-out.aep");
    const jsx = fakeJsx("// does nothing", save);
    const paths = prepareRun(jsx, ROOT);
    const r = await executeRun(paths, launchWith(paths.scriptPath), {
      timeoutMs: 800,
      pollMs: 50,
    });
    expect(r.status).toBe("unknown-timeout");
  });
});
