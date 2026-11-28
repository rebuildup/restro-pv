# Small Win32 input helpers for the REC-D harness.
# Screen coordinates are VIRTUAL screen coordinates (the value GetCursorPos
# and SetCursorPos use on this two-monitor box: origin = SM_XVIRTUALSCREEN).
import ctypes, ctypes.wintypes as wt, time

u = ctypes.windll.user32


def cursor_pos():
    p = wt.POINT()
    u.GetCursorPos(ctypes.byref(p))
    return (p.x, p.y)


def move_to(x, y, dur=0.6, hz=60):
    sx, sy = cursor_pos()
    steps = max(2, int(dur * hz))
    for i in range(1, steps + 1):
        t = i / steps
        e = t * t * (3 - 2 * t)
        u.SetCursorPos(int(sx + (x - sx) * e), int(sy + (y - sy) * e))
        time.sleep(dur / steps)


def click(x, y, settle=0.15, button="left"):
    move_to(x, y, 0.25)
    time.sleep(settle)
    if button == "left":
        u.mouse_event(0x0002, 0, 0, 0, 0)
        time.sleep(0.06)
        u.mouse_event(0x0004, 0, 0, 0, 0)
    else:
        u.mouse_event(0x0010, 0, 0, 0, 0)  # RIGHTDOWN
        time.sleep(0.06)
        u.mouse_event(0x0020, 0, 0, 0, 0)


def drag(x1, y1, x2, y2, dur=0.8, ctrl=False):
    move_to(x1, y1, 0.3)
    time.sleep(0.12)
    if ctrl:
        u.keybd_event(0x11, 0, 0, 0)  # VK_CONTROL down
    u.mouse_event(0x0002, 0, 0, 0, 0)
    steps = max(4, int(dur * 60))
    sx, sy = cursor_pos()
    for i in range(1, steps + 1):
        t = i / steps
        e = t * t * (3 - 2 * t)
        u.SetCursorPos(int(sx + (x2 - sx) * e), int(sy + (y2 - sy) * e))
        time.sleep(dur / steps)
    time.sleep(0.08)
    u.mouse_event(0x0004, 0, 0, 0, 0)
    if ctrl:
        time.sleep(0.05)
        u.keybd_event(0x11, 0, 2, 0)  # VK_CONTROL up


def foreground(hwnd):
    # NEVER use SW_RESTORE here: it un-maximises the AE window and silently
    # changes every screen coordinate. Only un-minimise when needed.
    if u.IsIconic(hwnd):
        u.ShowWindow(hwnd, 9)  # SW_RESTORE
        time.sleep(0.3)
    u.SetForegroundWindow(hwnd)
    time.sleep(0.4)


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


def visible_dialogs(pid=None):
    out = []

    @ctypes.WINFUNCTYPE(ctypes.c_bool, wt.HWND, wt.LPARAM)
    def cb(hwnd, lparam):
        if pid is not None:
            p = wt.DWORD()
            u.GetWindowThreadProcessId(hwnd, ctypes.byref(p))
            if p.value != pid:
                return True
        if u.IsWindowVisible(hwnd):
            cls = ctypes.create_unicode_buffer(256)
            u.GetClassNameW(hwnd, cls, 256)
            ttl = ctypes.create_unicode_buffer(512)
            u.GetWindowTextW(hwnd, ttl, 512)
            r = wt.RECT()
            u.GetWindowRect(hwnd, ctypes.byref(r))
            if cls.value in ("#32770",) or "Alert" in (ttl.value or ""):
                out.append((hwnd, cls.value, ttl.value, (r.left, r.top, r.right, r.bottom)))
        return True

    u.EnumWindows(cb, 0)
    return out


def child_buttons(hwnd):
    out = []

    @ctypes.WINFUNCTYPE(ctypes.c_bool, wt.HWND, wt.LPARAM)
    def cb(ch, lp):
        cls = ctypes.create_unicode_buffer(256)
        u.GetClassNameW(ch, cls, 256)
        ttl = ctypes.create_unicode_buffer(256)
        u.GetWindowTextW(ch, ttl, 256)
        r = wt.RECT()
        u.GetWindowRect(ch, ctypes.byref(r))
        out.append((ch, cls.value, ttl.value, (r.left, r.top, r.right, r.bottom)))
        return True

    u.EnumChildWindows(hwnd, cb, 0)
    return out
