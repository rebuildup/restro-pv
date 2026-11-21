// Regression tests for AE-style parent-child transform composition
// (pv/production/transform.ts). The legacy brand rig is the canonical
// case: 833%/330% leaf scales under 12% P-null parents compose to
// ~100%/39.6% EFFECTIVE world transforms — reading the leaf scale alone
// produced the giant-crop bug this module exists to prevent.

import { describe, expect, test } from "bun:test";
import {
  affineApply,
  affineInvert,
  affineLinear,
  affineMultiply,
  localAffine,
} from "../pv/production/transform.ts";

const V = (x: number, y: number) => ({ x, y });

/** Compose a chain of local TRS nodes into one world affine (root first). */
function chainWorld(
  nodes: { anchor: { x: number; y: number }; position: { x: number; y: number }; scale: number | { x: number; y: number }; rotation?: number }[],
) {
  let w = localAffine({
    anchor: nodes[0].anchor,
    position: nodes[0].position,
    scale: nodes[0].scale,
    rotation: nodes[0].rotation ?? 0,
  });
  for (let i = 1; i < nodes.length; i++) {
    const n = nodes[i];
    w = affineMultiply(
      w,
      localAffine({ anchor: n.anchor, position: n.position, scale: n.scale, rotation: n.rotation ?? 0 }),
    );
  }
  return w;
}

describe("transform — parent-child composition", () => {
  test("12% parent x 833.333% child composes to ~100% effective scale", () => {
    // P 9 rig: anchor[50,50], pos(26,734), scale 12%
    //   -> P-33: pos(100,100), anchor[0,0], scale 100%
    //     -> Heading: pos(0,0), anchor[0,0], scale 833.333%
    const w = chainWorld([
      { anchor: V(50, 50), position: V(26, 734), scale: 0.12 },
      { anchor: V(0, 0), position: V(100, 100), scale: 1 },
      { anchor: V(0, 0), position: V(0, 0), scale: 8.333333333333 },
    ]);
    const lin = affineLinear(w, V(1, 0));
    const linY = affineLinear(w, V(0, 1));
    expect(lin.x).toBeCloseTo(1, 6);
    expect(lin.y).toBeCloseTo(0, 6);
    expect(linY.x).toBeCloseTo(0, 6);
    expect(linY.y).toBeCloseTo(1, 6);
    // World anchor position: Heading anchor [0,0] -> (32,740).
    const p = affineApply(w, V(0, 0));
    expect(p.x).toBeCloseTo(32, 5);
    expect(p.y).toBeCloseTo(740, 5);
  });

  test("world->local and local->world are exact inverses under scaled parents", () => {
    const parent = localAffine({
      anchor: V(50, 50),
      position: V(26, 734),
      scale: 0.12,
    });
    const desiredWorld = V(32, 740);
    const localPos = affineApply(affineInvert(parent), desiredWorld);
    // Forward check: parent(localPos) == desiredWorld.
    const back = affineApply(parent, localPos);
    expect(back.x).toBeCloseTo(desiredWorld.x, 8);
    expect(back.y).toBeCloseTo(desiredWorld.y, 8);
    // And the inverse is not the naive position subtraction:
    // naive would give (6,6); the true local pos accounts for anchor+scale.
    expect(localPos.x).not.toBeCloseTo(desiredWorld.x - 26, 3);
  });

  test("original master chains reproduce measured world transforms", () => {
    // Heading chain (P 9 -> P-33 -> Heading): ~(32,740), scale ~1.0
    const heading = chainWorld([
      { anchor: V(50, 50), position: V(26, 734), scale: 0.12 },
      { anchor: V(0, 0), position: V(100, 100), scale: 1 },
      { anchor: V(0, 0), position: V(0, 0), scale: 8.333333333333 },
    ]);
    const hp = affineApply(heading, V(0, 0));
    expect(hp.x).toBeCloseTo(32, 4);
    expect(hp.y).toBeCloseTo(740, 4);

    // Logo chain (P 5 -> Logo): ~(32,429), scale ~1.0
    const logo = chainWorld([
      { anchor: V(50, 50), position: V(26, 423), scale: 0.12 },
      { anchor: V(0, 0), position: V(100, 100), scale: 8.333333333333 },
    ]);
    const lp = affineApply(logo, V(0, 0));
    expect(lp.x).toBeCloseTo(32, 4);
    expect(lp.y).toBeCloseTo(429, 4);

    // Ae.png chain (P 3 -> P-11 -> Ae.png): anchor [0,234] -> (32,262),
    // effective scale 0.12 x 3.30 = 0.396 — NOT 330%.
    const ae = chainWorld([
      { anchor: V(50, 50), position: V(26, 268), scale: 0.12 },
      { anchor: V(0, 100), position: V(100, 0), scale: 1 },
      { anchor: V(0, 234), position: V(0, 100), scale: 3.3 },
    ]);
    const ap = affineApply(ae, V(0, 234));
    expect(ap.x).toBeCloseTo(32, 4);
    expect(ap.y).toBeCloseTo(262, 4);
    const sx = affineLinear(ae, V(1, 0)).x;
    expect(sx).toBeCloseTo(0.396, 5);
  });

  test("rotation composes through the chain", () => {
    // 90° parent rotation maps child +x to world +y (AE: clockwise +).
    const w = chainWorld([
      { anchor: V(0, 0), position: V(100, 100), scale: 1, rotation: 90 },
      { anchor: V(0, 0), position: V(0, 0), scale: 1 },
    ]);
    const d = affineLinear(w, V(1, 0));
    expect(d.x).toBeCloseTo(0, 6);
    expect(d.y).toBeCloseTo(1, 6);
  });
});
