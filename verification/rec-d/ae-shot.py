# Screenshot helper for the REC-D harness.
# Usage:
#   python ae-shot.py <outfile.png> [region]
# region: "ae"  -> the After Effects main window rect (virtual screen coords)
#          "all" -> the whole virtual desktop
#          "x,y,w,h" -> explicit virtual-screen rect
#
# Virtual screen origin is (SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN); PIL's
# all_screens grab uses the same origin, so bbox coords are virtual coords.
import ctypes, ctypes.wintypes as wt, sys
from PIL import ImageGrab

u = ctypes.windll.user32
AE_PID = None


def find_ae_window():
    found = []

    @ctypes.WINFUNCTYPE(ctypes.c_bool, wt.HWND, wt.LPARAM)
    def cb(hwnd, lparam):
        pid = wt.DWORD()
        u.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
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
    out = sys.argv[1]
    region = sys.argv[2] if len(sys.argv) > 2 else "ae"
    if region == "all":
        vx = u.GetSystemMetrics(76)
        vy = u.GetSystemMetrics(77)
        box = (vx, vy, vx + u.GetSystemMetrics(78), vy + u.GetSystemMetrics(79))
    elif region == "ae":
        wins = find_ae_window()
        if not wins:
            print("NO_AE_WINDOW")
            return
        hwnd, (l, t, r, b) = wins[0]
        box = (l, t, r, b)
    else:
        box = tuple(int(v) for v in region.split(","))
    print("BOX", box)
    img = ImageGrab.grab(bbox=box, all_screens=True)
    img.save(out)
    print("SAVED", out, img.size)


if __name__ == "__main__":
    main()
