# Run one REC-D take: reset AE, verify the Restro button coordinates from a
# fresh screenshot, record the AE window with the WGC recorder while the
# mouse driver plays the story, then stop.
#
# Usage: python run-take.py <outdir> [seconds]
#   outdir   e.g. D:\pv-tmp\rec-d\take2
#   seconds  recorder length (default 22)
import ctypes, ctypes.wintypes as wt, json, os, subprocess, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import aeclick as A

ROOT = r"C:\Users\rebui\Desktop\restro-pv-23"
AE_EXE = r"D:\4_apps\adobe\Adobe After Effects 2027\Support Files\AfterFX.exe"
HERE = os.path.dirname(os.path.abspath(__file__))

DECOMPOSE_BTN_EXPECTED = (2455, 527)


def run_jsx(path, timeout=60):
    """Run a JSX in the running AE instance and wait for its .done marker."""
    done = path + ".done"
    try:
        os.remove(done)
    except OSError:
        pass
    subprocess.Popen([AE_EXE, "-r", path])
    t0 = time.time()
    while time.time() - t0 < timeout:
        if os.path.exists(done):
            time.sleep(0.5)
            return True
        time.sleep(0.3)
    return False


def main():
    outdir = sys.argv[1]
    seconds = float(sys.argv[2]) if len(sys.argv) > 2 else 22.0
    os.makedirs(outdir, exist_ok=True)

    hwnd, rect = A.find_ae_window()[0]
    print("AE hwnd", hwnd, "rect", rect)
    assert rect == (-8, -8, 2568, 1448), "AE window must be maximised: %s" % (rect,)
    A.foreground(hwnd)

    # 1. reset the project to the clean REC-D state (SOURCE 筆 + [BG])
    print("reset...", run_jsx(ROOT + r"\tools\capture\rec-d-reset.jsx"))
    time.sleep(1.0)
    print("setup...", run_jsx(ROOT + r"\tools\capture\rec-d-setup.jsx"))
    time.sleep(1.5)

    # 2. verify the Decompose button coordinate against a fresh screenshot
    shot = os.path.join(outdir, "..", "pre-take.png")
    subprocess.run([sys.executable, os.path.join(HERE, "ae-shot.py"), shot, "ae"], check=True)
    from PIL import Image
    import numpy as np
    a = np.asarray(Image.open(shot).convert("RGB")).astype(int)
    reg = a[380:1000, 2400:2560]
    bright = reg.min(axis=2) > 170
    rows = np.where(bright.sum(axis=1) > 2)[0]
    groups, start, prev = [], None, None
    for r in rows:
        if start is None:
            start = prev = r
            continue
        if r - prev > 8:
            groups.append((start, prev)); start = r
        prev = r
    if start is not None:
        groups.append((start, prev))
    blobs = []
    for g in groups:
        sub = bright[g[0]:g[1] + 1]
        cols = np.where(sub.sum(axis=0) > 0)[0]
        blobs.append(((cols.min() + cols.max()) // 2 + 2400 - 8, (g[0] + g[1]) // 2 + 380 - 8))
    print("icon blobs (virtual):", blobs)
    ok = DECOMPOSE_BTN_EXPECTED in blobs
    print("Decompose button at", DECOMPOSE_BTN_EXPECTED, "->", "OK" if ok else "MISMATCH")
    if not ok:
        print("ABORT: button coordinate mismatch")
        return 2

    # 3. record
    rec = subprocess.Popen([sys.executable, os.path.join(HERE, "wgc-rec2.py"),
                            str(hwnd), str(seconds), outdir])
    time.sleep(2.5)
    drv = subprocess.run([sys.executable, os.path.join(HERE, "rec-d-drive.py")])
    rec.wait()
    ts = json.load(open(os.path.join(outdir, "timestamps.json"), encoding="utf-8"))
    print("frames", ts["count"], "unit", ts["timespan_unit"],
          "span_s", round((ts["times"][-1] - ts["times"][0]) / 1e7, 3))
    return 0


if __name__ == "__main__":
    sys.exit(main())
