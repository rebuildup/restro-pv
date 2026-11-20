// Timeline assembly: master comp and scene ordering.
// Scene interval contract (seconds, 24fps, 20s master):
//   A1 [0,45f) A2 [45,90f) A3 [90,101f) B [101,191f)
//   C [191,281f) D [281,371f) E [371,480f)
import type { CompSpec, CompLayerSpec, ProjectSpec } from './model/types.ts';
import { sceneA1 } from './scenes/a1.ts';
import { sceneA2 } from './scenes/a2.ts';
import { sceneA3 } from './scenes/a3.ts';
import { sceneB } from './scenes/b.ts';
import { sceneC } from './scenes/c.ts';
import { sceneD } from './scenes/d.ts';
import { sceneE } from './scenes/e.ts';

const FPS = 24;
const MASTER_W = 1080;
const MASTER_H = 1080;
const MASTER_DUR = 20;

// scene comp -> master in/out (comp seconds)
const SCENES: Array<{ comp: CompSpec; t0: number; t1: number }> = [
  { comp: sceneA1(), t0: 0, t1: 45 / FPS },
  { comp: sceneA2(), t0: 45 / FPS, t1: 90 / FPS },
  { comp: sceneA3(), t0: 90 / FPS, t1: 101 / FPS },
  { comp: sceneB(), t0: 101 / FPS, t1: 191 / FPS },
  { comp: sceneC(), t0: 191 / FPS, t1: 281 / FPS },
  { comp: sceneD(), t0: 281 / FPS, t1: 371 / FPS },
  { comp: sceneE(), t0: 371 / FPS, t1: 480 / FPS },
];

export function timeline(): ProjectSpec {
  const comps: CompSpec[] = SCENES.map((s) => s.comp);
  const layers: CompLayerSpec[] = [];

  // scene layers bottom-to-top in master (AE layer index 1 = top, so push
  // reverse order: later entries are lower). Background first.
  for (let i = SCENES.length - 1; i >= 0; i--) {
    const s = SCENES[i];
    layers.push({
      kind: 'comp',
      name: s.comp.name,
      source: s.comp.name,
      inPoint: s.t0,
      outPoint: s.t1,
      startTime: s.t0,
    });
  }

  comps.push({
    name: 'master',
    width: MASTER_W,
    height: MASTER_H,
    duration: MASTER_DUR,
    frameRate: FPS,
    layers,
  });

  return {
    name: 'pv',
    comps,
    footage: [
      { file: 'assets/audio/drums-and-somps-background-music-458414.mp3' },
      { file: 'assets/rec/ae-decompose-ops.mp4' },
      { file: 'assets/rec/ae-reprocess.mp4' },
      { file: 'assets/rec/ae-stroke-animate.mp4' },
    ],
    bgm: { file: 'assets/audio/drums-and-somps-background-music-458414.mp3' },
  };
}
