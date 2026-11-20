// After Effects host resolution for PV tooling.
//
// Ported from Ae_Restro scripts/lib/host-platform.ts (resolveAe only): the PV
// tools need the AE executable and its install dir, nothing else.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";

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
