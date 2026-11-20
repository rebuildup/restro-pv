# PV production architecture (Issue #14)

## Canonical sources

- `pv/production/scene-layout.ts`: 1080×1080 / 24fps layout tokens, upper information band, lower main band, main hero trajectory, time-aware collision contracts
- `pv/production/scene-compose.ts`: converts authored Heading / Description / Icon / Main into actual `CompSpec` layers
- `pv/scenes/master.ts`: chronological C/D/E scene composition and single 20-second master; audio and all windows are explicitly trimmed
- `pv/production/ae-organization.ts`: role → AE label index (1–16); ordered FoldLayers groups and Layer Control/parent remapping
- `pv/production/project-lint.ts`: rejects invalid trims, missing references, orphan generated nulls, invalid label slots, syntactically invalid expressions, and unstable literal layer-index expressions
- `pv/runtime/aeRuntime.ts`: generates the AEP, creates FoldLayers marker ShapeLayers with hidden `FD-0` (and optional `FD-H:`) groups, arranges Project panel items, scans evaluated expression errors across reachable precomps, and writes the final error report *after* the save attempt
- `legacy/pv-2dc99e1.aep`: **temporary material library only**. Do not edit or resave the original; the output AEP is independent. Extract only the required Restro precomps before considering the migration complete.

## Produced structure

```text
Project
├─ 01 - PV Output
│  ├─ Scene C         (top information + Logo + bottom reel)
│  ├─ Scene D         (top information + Logo + bottom operations)
│  ├─ Scene E         (top information + Logo + bottom ending)
│  └─ PV master       (A/B legacy bridge + C/D/E + audio)
├─ 02 - Restro Materials
├─ 03 - Media
└─ 04 - Audio
```

The C, D, E hero placements form a **right-rising sequence** across scenes. The lower main region runs from y=292 to y=1032; the upper information band runs from y=48 to y=264. Main sources are aspect-ratio preserved rather than non-uniformly stretched. Original C's vertical reel remains inside the material comp for now.

No generated composition contains a tracking null; legacy nulls are still present **inside the imported material AEP** and cannot be called removed. The legacy A/B bridge also remains until the actual Restro materials are extracted into a clean asset AEP.

## Collision policy

`lintSceneLayouts` checks each section's bounding rectangle *and active frame interval*. Spatial collision during overlapping time is an error. Intentional overlaps must specify both IDs and a concrete reason, and stale exemptions also fail. Missing or invalid bounds, a section outside its vertical band, invalid trims, and a broken right-rising sequence fail.

This is a conservative **declared envelope check**. It cannot establish actual pixel/text extents, opacity masks, expressions that move elements beyond their declared rects, or visual collisions inside legacy comps. Those remain real-host review obligations. Never report static lint as proof that video sections do not overlap visually. Extend the compositor with motion envelopes before introducing moving headings / foregrounds.

## AE labels and FoldLayers

AE `label` is a numbered user-configurable color slot; RGB appearance can differ with AE preferences. Slots are stable semantic categories:

| Role | Label |
| --- | --- |
| Information | 9 |
| Main content | 13 |
| Overlays | 11 |
| Tracking rig | 6 |
| Background | 2 |
| Audio | 10 |
| Fold divider | 4 |
| Imported source comps | 5 |
| Imported footage | 8 |

FoldLayers plugin identity is NOT the `▾` character alone. Its AEGP logic checks for a ShapeLayer with `FD-0` (unfolded) / `FD-1` (folded) inside Root Vectors Group; `FD-H:` carries hierarchy. The runtime generates actual vector identity groups. It does not call locale-dependent menu commands or claim FoldLayers is installed on the runner. Verify folding/unfolding against the installed plugin in an owned AE session.

Pre-existing source layer names are preserved as long as their expression references may depend on them. Generated scene sections use `Scene <ID> / role` names. Renaming legacy project material prematurely would invalidate source expressions.

## Validation levels

1. Fast in CI: Bun typecheck, production spec preflight/build, JSX static gate, unit and fake-host tests
2. Local during development: render only changed representative frames and scene boundaries from **PV master**, not the imported `master`
3. Candidate/freeze: real-host AEP import, expressionError scan, FoldLayers interaction, no unexpected video collisions, rendered 20-second output and audio

**Not yet verified in this PR:** real AE import of the new generated Scene C/D/E comps, actual text metrics/font availability, existing source material expression health, FoldLayers plugin interaction, real rendered diagonal composition, and complete removal of legacy unused source comps/nulls. The PR stays Draft until host evidence and visual inspection exist.
