# Encode a REC-D take into a fixed-24fps H.264 mp4.
#
# The WGC recorder emits a frame only when the window changes, so the raw
# sequence is not a constant-rate timeline. This script rebuilds a true 24 fps
# timeline: every captured frame is placed at its own capture timestamp and
# the previous frame is repeated to fill the gaps; the last frame is held to
# the end.
#
# Usage: python encode-take.py <framesdir> <out.mp4> [start_frame] [fps] [width] [height]
import glob, json, os, subprocess, sys

import numpy as np
from PIL import Image

FFMPEG = r"C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\Aeviewer\bin\Win\ffmpeg.exe"


def main():
    fdir = sys.argv[1]
    out = sys.argv[2]
    start = int(sys.argv[3]) if len(sys.argv) > 3 else 0
    fps = int(sys.argv[4]) if len(sys.argv) > 4 else 24
    W = int(sys.argv[5]) if len(sys.argv) > 5 else 1920
    H = int(sys.argv[6]) if len(sys.argv) > 6 else 1080

    fs = sorted(glob.glob(os.path.join(fdir, "f*.jpg")))
    ts = json.load(open(os.path.join(fdir, "timestamps.json"), encoding="utf-8"))["times"]
    assert len(fs) == len(ts), (len(fs), len(ts))
    # 100 ns units -> seconds
    sec = [(t - ts[0]) / 1e7 for t in ts]

    last = len(fs) - 1
    t0 = sec[start]
    total = sec[last] - t0
    n = int(round(total * fps))
    print("frames %d  span %.3fs  -> %d output frames @%dfps" % (len(fs), total, n, fps))

    cmd = [FFMPEG, "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", "%dx%d" % (W, H), "-r", str(fps), "-i", "-",
           "-c:v", "libx264", "-preset", "slow", "-crf", "19",
           "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    j = start
    for k in range(n):
        t = t0 + k / float(fps)
        while j + 1 <= last and sec[j + 1] <= t:
            j += 1
        im = Image.open(fs[j]).convert("RGB").resize((W, H), Image.LANCZOS)
        p.stdin.write(np.asarray(im).tobytes())
    p.stdin.close()
    rc = p.wait()
    print("ffmpeg rc", rc, "->", out, os.path.getsize(out), "bytes")


if __name__ == "__main__":
    main()
