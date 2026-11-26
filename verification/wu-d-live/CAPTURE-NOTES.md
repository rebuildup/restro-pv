# WU-D live capture — automated path (working)

Real-operation capture of Restro Decompose inside After Effects, obtained
fully unattended on 2026-11-27 (branch 23).

## Artifacts

- `wu-d-live-capture.mp4` — Windows Graphics Capture (WGC) of the AE
  workspace window (hwnd-targeted, 2506x1392, on-change frames). Shows the
  comp viewer going through the Decompose layer rebuild.
- `decompose-log.txt` — script log: `VIEWER_READY` → `GO` →
  `DECOMPOSED {"ok":true,"created_layer_ids":[101..113],"items=13
  created=13"}` → `SHAPE_LAYERS=13` → `DONE`.
- `wu-d-live.jsx` — capture driver (see below).
- `wgc-rec.py` — WGC window recorder (`windows-capture` package).

## Working recipe (all steps verified)

1. Launch `AfterFX.exe` **without** `-r` → persistent instance with real
   windows (home screen + workspace as separate top-level windows).
2. Dismiss Crash Repair dialog if present (SendKeys SPACE hits focused
   "Continue"; button is owner-drawn, no Win32 child buttons).
3. Raise the workspace window (`AE_CApplication_*` class) with the
   AttachThreadInput + SetForegroundWindow trick — plain
   SetForegroundWindow/SetWindowPos TOPMOST fail due to foreground lock.
4. Record via WGC `WindowsCapture(window_hwnd=...)` — captures GPU/D3D
   comp viewer content that PrintWindow cannot (PrintWindow yields black
   viewer), and is immune to window occlusion.
5. Run `AfterFX.exe -r wu-d-live.jsx` — delegates into the RUNNING
   instance (single-instance); script executes in ~15s, no reboot, no new
   dialogs. `--allow-running-ae` on ae-proof.
6. `wu-d-live.jsx` gates on `.tmp/wu-d-go` flag file before calling
   `executeCommand(findMenuCommandId("Restro: Decompose"))` — gives the
   recorder a deterministic lead-in. `$.sleep` afterwards is ms.

## Notes / caveats

- `AfterFX.exe -r` with NO AE running spawns a transient instance that
  runs the script then exits — usable for headless proof but produces no
  persistent windows.
- WGC delivers frames on change only; a mostly-static AE UI yields sparse
  frames (~44 per 80s). The decompose moment appears as a viewer
  dark-repaint gap between before/after glyph states.
- comp viewer shows the same 筆 glyph before and after (decompose
  preserves appearance); the layer-count change is proven by the reply
  JSON (`items=13 created=13`) and the timeline STROKE_* layers.
- SceneD integration (ROI/clip measured against this footage) is pending.
