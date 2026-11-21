// After Effects host resolution for PV tooling.
//
// Ported from Ae_Restro scripts/lib/host-platform.ts (resolveAe only): the PV
// tools need the AE executable and its install dir, nothing else.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

/** `AfterFX.exe -r` drops paths with whitespace on Windows; `-ro` is the
 *  read-only variant the ae-a8n launcher expects. */
export const WINDOWS_SCRIPT_FLAG = "-ro";

export type AeHost = {
  executable: string;
  installDir: string;
};

async function explicitExecutable(): Promise<string | null> {
  const overridden = process.env.AE_EXECUTABLE;
  if (!overridden) return null;
  if (!isAbsolute(overridden) || !existsSync(overridden)) {
    throw new Error("AE_EXECUTABLE must be an existing absolute executable path");
  }
  return overridden;
}

/** `<install>\Support Files\AfterFX.exe` belongs to `<install>`. */
function windowsInstallDirOf(executable: string): string {
  const support = dirname(executable);
  if (basename(support) !== "Support Files") {
    throw new Error('AfterFX.exe is expected inside a "Support Files" folder: ' + executable);
  }
  return dirname(support);
}

async function resolveDarwin(): Promise<AeHost> {
  let executable = await explicitExecutable();
  if (!executable) {
    const folders = (await readdir("/Applications"))
      .filter((name) => /^Adobe After Effects \d{4}$/.test(name))
      .sort()
      .reverse();
    for (const name of folders) {
      const candidate = join("/Applications", name, name + ".app/Contents/MacOS/After Effects");
      if (existsSync(candidate)) {
        executable = candidate;
        break;
      }
    }
  }
  if (!executable) throw new Error("After Effects application not found; set AE_EXECUTABLE");
  const macos = dirname(executable);
  const contents = dirname(macos);
  const bundle = dirname(contents);
  if (
    basename(macos) !== "MacOS" ||
    basename(contents) !== "Contents" ||
    !bundle.endsWith(".app")
  ) {
    throw new Error("AE executable is not inside a macOS application bundle");
  }
  return { executable, installDir: bundle };
}

async function resolveWindows(): Promise<AeHost> {
  let executable = await explicitExecutable();
  if (!executable) {
    const { resolveInstall } = await import("@ido-bata/ae-a8n");
    executable = resolveInstall().executable;
  }
  return { executable, installDir: windowsInstallDirOf(executable) };
}

export async function resolveAe(): Promise<AeHost> {
  if (process.platform === "darwin") return resolveDarwin();
  if (process.platform === "win32") return resolveWindows();
  throw new Error("PV tooling supports macOS and Windows with a locally installed After Effects");
}

export function aeIsRunning(): boolean {
  if (process.platform === "win32") {
    const check = spawnSync("tasklist", ["/FI", "IMAGENAME eq AfterFX.exe", "/NH", "/FO", "CSV"], {
      encoding: "utf8",
    });
    if (check.error) throw check.error;
    if (check.status !== 0)
      throw new Error("could not enumerate After Effects processes: " + check.stderr);
    return /AfterFX\.exe/i.test(check.stdout);
  }
  if (process.platform === "darwin") {
    const check = spawnSync("/usr/bin/pgrep", ["-x", "After Effects"], { encoding: "utf8" });
    if (check.error) throw check.error;
    if (check.status === 0) return true;
    if (check.status === 1) return false;
    throw new Error("could not enumerate After Effects processes: " + check.stderr);
  }
  return false;
}

// ---- script readiness probe ------------------------------------------------
//
// `AfterFX.exe -r` delivered during cold boot can execute while AE is still
// initializing plugins/media; layers.add* then throws "undefined is not an
// object" for minutes (observed on the ~85MB material project). Process
// existence is not readiness — the only reliable signal is a round-trip:
// a tiny JSX that exercises the same DOM write path and removes its probe
// comp afterwards (AVItem.remove() works in AE 27). The probe leaves no
// residue in the project.

const PROBE_DIR = ".tmp/run";

function probeJsx(donePath: string, reportPath: string): string {
  return [
    'var F=new File("' + reportPath + '");F.open("w");',
    'function log(s){var f=new File("' + reportPath + '");f.open("a");f.writeln(s);f.close();}',
    "try{",
    '  var c=app.project.items.addComp("ae-ready-probe",64,64,1,1,24);',
    '  var n=c.layers.addNull();n.name="probe/null";',
    '  var ok=(c.numLayers===undefined?c.layers.length:c.numLayers)>=1;',
    '  try{c.remove();}catch(x){}',
    '  log("probe ok="+ok+" items="+app.project.numItems);',
    '}catch(e){log("probe FAIL "+(e&&e.description?e.description:"?"));}',
    'var d=new File("' + donePath + '");d.open("w");d.write("done");d.close();',
    "",
  ].join("\n");
}

/**
 * Returns true once AE answers a DOM-write probe. Sends the probe JSX via
 * `-r` and waits for its .done marker; callers should retry until their own
 * deadline because an early `-r` can be dropped while AE is still booting.
 */
export async function aeProbeOnce(
  ae: AeHost,
  rootDir: string,
  timeoutMs = 60_000,
): Promise<boolean> {
  const tag = `${process.pid}-${Date.now()}`;
  const jsxPath = resolve(rootDir, PROBE_DIR, `ae-probe-${tag}.jsx`);
  const donePath = jsxPath + ".done";
  const reportPath = jsxPath + ".txt";
  mkdirSync(resolve(rootDir, PROBE_DIR), { recursive: true });
  rmSync(donePath, { force: true });
  rmSync(reportPath, { force: true });
  writeFileSync(jsxPath, probeJsx(donePath.replace(/\\/g, "/"), reportPath.replace(/\\/g, "/")));
  const { spawn } = await import("node:child_process");
  const child = spawn(ae.executable, ["-r", jsxPath], { detached: true, stdio: "ignore" });
  child.unref();
  const deadline = Date.now() + timeoutMs;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  while (Date.now() < deadline) {
    if (existsSync(donePath)) {
      // Probe ran — but only count it ready if the DOM write actually worked.
      try {
        const report = readFileSync(reportPath, "utf8");
        return report.includes("probe ok=true");
      } catch {
        return false;
      }
    }
    await sleep(2000);
  }
  return false;
}
