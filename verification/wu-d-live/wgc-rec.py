import cv2, numpy as np, time, sys
from windows_capture import WindowsCapture

hwnd = int(sys.argv[1]); seconds = float(sys.argv[2]); outpath = sys.argv[3]
cap = WindowsCapture(cursor_capture=True, draw_border=False, window_hwnd=hwnd, minimum_update_interval=30)
frames = []
def on_frame_arrived(frame, ctl):
    img = frame.frame_buffer
    if img.shape[2] == 4: img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    elif img.dtype != np.uint8: img = img.astype(np.uint8)
    frames.append(img.copy())
def on_closed(): print("closed")
cap.event(on_frame_arrived); cap.event(on_closed)
cap.start_free_threaded()
t0 = time.time()
while time.time() - t0 < seconds:
    time.sleep(0.05)
print("frames", len(frames))
if frames:
    h, w = frames[0].shape[:2]
    out = cv2.VideoWriter(outpath, cv2.VideoWriter_fourcc(*'mp4v'), 15, (w, h))
    for f in frames: out.write(f)
    out.release()
    print("wrote", outpath, w, h)
