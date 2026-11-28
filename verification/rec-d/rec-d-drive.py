# REC-D recording driver: real mouse/keyboard input against the AE window
# while wgc-rec2.py captures it.
#
# Screen coords are VIRTUAL screen coordinates (what GetCursorPos/SetCursorPos
# use on this two-monitor box). The After Effects window is maximised at
# (-8,-8,2568,1448), so a pixel of an AE-window grab at (px,py) is the
# virtual coord (px-8, py-8).
#
# ------------------------------------------------------------------
# BUTTON COORDINATE HISTORY
#   OLD (take1/take2 era, stale): DECOMPOSE_BTN=(2437,543) MERGE_BTN=(2437,730)
#     (2437,543) lands in the dead zone between the Decompose icon
#      (image x 2450..2477, y 522..549) and its caption - on no widget.
#   NEW (measured 2026-11-29 from a fresh maximised-window screenshot, then
#        confirmed by clicking and reading AE's layer selection back):
#     DECOMPOSE_BTN = (2455, 527)   icon centre (image 2463,535)
#     MERGE_BTN     = (2455, 714)   icon centre (image 2463,722)
#     REFINE_BTN    = (2455, 901)   icon centre (image 2463,909)
#   These are the icons of the Restro ScriptUI panel (labels underneath).
# ------------------------------------------------------------------
# COMPOSITION VIEWER MAPPING
#   virtual_x = 485 + comp_x * 1.125
#   virtual_y = 112 + comp_y * 1.125
#   Validated by clicking four known STROKE centroids and reading the
#   selected layer name back from AE (rec-d-sel.jsx): 4/4 exact.
#
# The take is pure mouse: NO AE script is executed while recording. The
# earlier attempt ran pick.jsx concurrently with the recording, which is what
# produced the "Attempt was made to run a second script" warning.
import ctypes, ctypes.wintypes as wt, time

u = ctypes.windll.user32

# screen-space targets (virtual screen coords)
DECOMPOSE_BTN = (2455, 527)
MERGE_BTN = (2455, 714)
REFINE_BTN = (2455, 901)

# comp -> screen
VIEW_X0, VIEW_Y0, VIEW_S = 485.0, 112.0, 1.125

# the four STROKE pieces the take selects and drags (comp-space centroids,
# from .tmp/rec-d-probe.json, produced by the real Decompose command)
PICK_STROKES = [
    ("STROKE_000_runs4", 485.2, 233.2),
    ("STROKE_004_runs4", 547.9, 258.9),
    ("STROKE_002_runs4", 655.2, 228.7),
    ("STROKE_005_runs4", 732.9, 256.0),
]
DRAG_FROM = ("STROKE_002_runs4", 655.2, 228.7)
DRAG_DELTA_COMPPX = (-80.0, -70.0)   # comp px; screen delta = *1.125


def comp_to_screen(cx, cy):
    return (VIEW_X0 + cx * VIEW_S, VIEW_Y0 + cy * VIEW_S)


def cursor_pos():
    p = wt.POINT()
    u.GetCursorPos(ctypes.byref(p))
    return (p.x, p.y)


def setpos(x, y):
    u.SetCursorPos(int(x), int(y))


def move_to(x, y, dur=0.6, hz=60):
    sx, sy = cursor_pos()
    steps = max(2, int(dur * hz))
    for i in range(1, steps + 1):
        t = i / steps
        e = t * t * (3 - 2 * t)
        setpos(sx + (x - sx) * e, sy + (y - sy) * e)
        time.sleep(dur / steps)


def click(x, y, settle=0.15, shift=False):
    move_to(x, y, 0.25)
    time.sleep(settle)
    if shift:
        u.keybd_event(0x10, 0, 0, 0)  # SHIFT down
    u.mouse_event(0x0002, 0, 0, 0, 0)  # LEFTDOWN
    time.sleep(0.06)
    u.mouse_event(0x0004, 0, 0, 0, 0)  # LEFTUP
    if shift:
        time.sleep(0.05)
        u.keybd_event(0x10, 0, 2, 0)  # SHIFT up


def drag(x1, y1, x2, y2, dur=1.0):
    move_to(x1, y1, 0.35)
    time.sleep(0.15)
    u.mouse_event(0x0002, 0, 0, 0, 0)
    steps = max(6, int(dur * 60))
    sx, sy = cursor_pos()
    for i in range(1, steps + 1):
        t = i / steps
        e = t * t * (3 - 2 * t)
        setpos(sx + (x2 - sx) * e, sy + (y2 - sy) * e)
        time.sleep(dur / steps)
    time.sleep(0.12)
    u.mouse_event(0x0004, 0, 0, 0, 0)


def find_ae_window():
    found = []

    @ctypes.WINFUNCTYPE(ctypes.c_bool, wt.HWND, wt.LPARAM)
    def cb(hwnd, lparam):
        cls = ctypes.create_unicode_buffer(256)
        u.GetClassNameW(hwnd, cls, 256)
        if cls.value.startswith("AE_CApplication"):
            r = wt.RECT()
            u.GetWindowRect(hwnd, ctypes.byref(r))
            found.append((hwnd, (r.left, r.top, r.right, r.bottom)))
        return True

    u.EnumWindows(cb, 0)
    return found


def main():
    t_start = time.time()

    def at(t):
        d = t - (time.time() - t_start)
        if d > 0:
            time.sleep(d)

    wins = find_ae_window()
    if not wins:
        print("NO_AE_WINDOW")
        return
    hwnd, rect = wins[0]
    print("AE hwnd", hwnd, "rect", rect)
    if rect != (-8, -8, 2568, 1448):
        print("WARNING: AE window is not maximised at (-8,-8,2568,1448); "
              "the recorded coordinates assume that layout")
    u.SetForegroundWindow(hwnd)
    time.sleep(0.6)

    # P0: rest the cursor over the composition viewer
    setpos(1180, 300)
    at(1.2)

    # P1: travel to the Restro panel's Decompose button and press it
    move_to(*DECOMPOSE_BTN, 1.1)
    at(2.9)
    u.mouse_event(0x0002, 0, 0, 0, 0)
    time.sleep(0.07)
    u.mouse_event(0x0004, 0, 0, 0, 0)
    print("clicked Decompose at t=%.2f" % (time.time() - t_start))

    # P2: let the decomposition land (native command, no script involved)
    at(6.6)

    # P3: shift-click the four STROKE pieces in the Composition viewer
    for i, (nm, cx, cy) in enumerate(PICK_STROKES):
        p = comp_to_screen(cx, cy)
        at(6.6 + i * 0.8)
        click(p[0], p[1], settle=0.18, shift=True)
        print("selected", nm, tuple(round(q, 1) for q in p))

    # P4: drag one of the selected pieces -> all selected pieces move
    nm, cx, cy = DRAG_FROM
    sx, sy = comp_to_screen(cx, cy)
    dx = DRAG_DELTA_COMPPX[0] * VIEW_S
    dy = DRAG_DELTA_COMPPX[1] * VIEW_S
    at(9.8)
    drag(sx, sy, sx + dx, sy + dy, 1.3)
    print("dragged", nm, "by", (round(dx, 1), round(dy, 1)))

    # P5: hold the result
    at(16.6)
    print("driver done at t=%.2f" % (time.time() - t_start))


if __name__ == "__main__":
    main()
