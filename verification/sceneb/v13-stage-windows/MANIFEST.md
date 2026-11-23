# v13 stage-window renders — provenance

B-scene stage display authored in TypeScript: the four step comps
(`STEP1 outline`, `STEP2/3/4 draft`) are visible only during their own
stage windows (`BRUSH_STAGE_IN`/`BRUSH_STAGE_OUT` in
`pv/scenes/scene-b.ts`), trailing the label/lens boundaries by
~0.1–0.25 s to match legacy pacing. Explicit lens window mask, borders/
cards as visible info layers, and tracker rig are unchanged from
`a6ea002`/`9cee1eb`.

## Artifact chain

| item | value |
| --- | --- |
| source | `pv/scenes/scene-b.ts` sha256 `e3763da965f1cbac2df5c7f386a3e709a803c9a074079db18b0d341441a32e16` (working tree at build time; committed as part of this change) |
| generated JSX | `dist/sbcheck.jsx` sha256 `fa235397f673b478b3738caf89a5015aae8bbec5f18095864e644d7cb90956d1` |
| run | `.tmp/run/2026-11-23T15-25-53-539Z-fa235397f673/` (manifest.json, report.json, progress.log) |
| runtime report | `warnings=1 errors=0` — the single warning is the known inert `Rotate X` write on `STEP1 outline` (hidden property, no render effect) |
| generated AEP | `.tmp/probe/scene-b.aep` — 5,991,888 bytes, saved 2026-11-24 00:30:46 local; this is the **current-code** build, not the earlier v12 matte experiment |
| frames | `f0120.png` (t=5.00, STEP 01), `f0160.png` (t=6.67, STEP 03 + lens), `f0185.png` (t=7.71, STEP 04), rendered 00:31 from that AEP |

## Comparison images

- `sbs-f0120.png` / `sbs-f0160.png` / `sbs-f0185.png` — legacy (left,
  `verification/legacy-frames-v1/`) vs generated (right)
- `bl-f0120.png` / `bl-f0160.png` / `bl-f0185.png` — bottom-left region,
  2x crop, legacy left / generated right

## Notes

- Stage colors now follow the material comps' authored stage fills:
  red (STEP1) → green (STEP2) → blue (STEP3) → yellow/orange (STEP4).
- The extra circle visible near the lens at f160 is the legacy
  `LENS frame` **source ring** (master ≈ (772,403), r≈70) plus its
  connector line — a deliberate magnifier annotation marking the
  source region, not stale structure. The concentric lens ring sits at
  (660,810), matching the explicit window mask center.
- Dark marks at master y≈890–960 x≈0–400 are stage scaffolding strokes
  (border/Baseline brush contours), not description text — the
  description comp ends at master y≈883 and renders identically in
  both. In legacy renders the full-bleed magnified lens content covers
  that region from ~stage 4; the explicit windowed lens intentionally
  does not.
