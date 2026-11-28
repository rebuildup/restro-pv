# Timestamped WGC window capture -> JPEG sequence + timestamps.json
# Usage: python wgc-rec2.py <hwnd> <seconds> <outdir>
# Writes <outdir>/f%05d.jpg and <outdir>/timestamps.json (ms since start).
import json, os, sys, time
import cv2
import numpy as np
from windows_capture import WindowsCapture

hwnd = int(sys.argv[1]); seconds = float(sys.argv[2]); outdir = sys.argv[3]
os.makedirs(outdir, exist_ok=True)

cap = WindowsCapture(cursor_capture=True, draw_border=False, window_hwnd=hwnd,
                     minimum_update_interval=30)
frames = []  # (timespan_ms, jpg_bytes)

def on_frame_arrived(frame, ctl):
    img = frame.frame_buffer
    if img.shape[2] == 4:
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    elif img.dtype != np.uint8:
        img = img.astype(np.uint8)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 92])
    if ok:
        frames.append((int(frame.timespan), buf.tobytes()))

def on_closed():
    print("closed")

cap.event(on_frame_arrived); cap.event(on_closed)
t0 = time.time()
cap.start_free_threaded()
while time.time() - t0 < seconds:
    time.sleep(0.05)
time.sleep(0.5)  # drain tail frames

# timespan units: calibrate — assume ms; if values look like 100ns, detect
ts = [f[0] for f in frames]
span = (ts[-1] - ts[0]) if len(ts) > 1 else 0
unit = "ms"
if span > seconds * 5_000_000:  # >5e6 per second => 100ns units
    unit = "100ns"
elif span > seconds * 1_000_000:
    unit = "us?"

for i, (_, data) in enumerate(frames):
    with open(os.path.join(outdir, "f%05d.jpg" % i), "wb") as fh:
        fh.write(data)

with open(os.path.join(outdir, "timestamps.json"), "w") as fh:
    json.dump({"timespan_unit": unit, "times": [f[0] for f in frames],
               "count": len(frames)}, fh)
print("frames", len(frames), "unit", unit, "span", span)
