// Generated from AEP dump 48-PV A2.json — do not edit by hand.
// Regenerate: bun tools/dump-aep-tree.ts <aep> <dir> && bun tools/convert-dump.ts <dir>
import type { CompSpec } from "../model/types.ts";

export const comp_48: CompSpec = {
  uid: 18349,
  name: "PV A2",
  width: 1080,
  height: 1080,
  pixelAspect: 1,
  duration: 2.29166666666667,
  frameRate: 24,
  bgColor: [0, 0, 0],
  layers: [
    {
      index: 1,
      name: "reconstruction",
      kind: "comp",
      source: "PV glyph A2",
      sourceUid: 18321,
      sourceCompIndex: 7,
      inPoint: 0,
      outPoint: 2.29166666666667,
      startTime: 0,
      stretch: 100,
      trackMatteType: 5012,
      transform: {
        name: "Transform",
        matchName: "ADBE Transform Group",
        type: 6213,
        active: true,
        enabled: true,
        propertyIndex: 6,
        numProperties: 5,
        properties: [
          {
            name: "Anchor Point",
            matchName: "ADBE Anchor Point",
            type: 6212,
            numKeys: 0,
            value: [700, 540, 0],
          },
          {
            name: "Position",
            matchName: "ADBE Position",
            type: 6212,
            numKeys: 2,
            value: [509.079986572266, 452.899993896484, 0],
            keys: [
              {
                t: 0,
                v: [539.080017089844, 438.899993896484, 0],
                inT: 6612,
                outT: 6612,
                inEase: [{ influence: 16.666666667, speed: 0 }],
                outEase: [{ influence: 16.666666667, speed: 14.3938266225 }],
                spIn: [0, 0, 0],
                spOut: [0, 0, 0],
              },
              {
                t: 2.30000813802083,
                v: [509.079986572266, 452.899993896484, 0],
                inT: 6612,
                outT: 6612,
                inEase: [{ influence: 16.666666667, speed: 14.3938266225 }],
                outEase: [{ influence: 16.666666667, speed: 0 }],
                spIn: [0, 0, 0],
                spOut: [0, 0, 0],
              },
            ],
          },
          {
            name: "Scale",
            matchName: "ADBE Scale",
            type: 6212,
            numKeys: 2,
            value: [102, 102, 100],
            keys: [
              {
                t: 0,
                v: [108.120002746582, 108.120002746582, 100],
                inT: 6612,
                outT: 6612,
                inEase: [
                  { influence: 16.666666667, speed: 0 },
                  { influence: 16.666666667, speed: 0 },
                  { influence: 16.666666667, speed: 0 },
                ],
                outEase: [
                  { influence: 16.666666667, speed: -2.66086134453782 },
                  { influence: 16.666666667, speed: -2.66086134453782 },
                  { influence: 16.666666667, speed: 0 },
                ],
              },
              {
                t: 2.30000813802083,
                v: [102, 102, 100],
                inT: 6612,
                outT: 6612,
                inEase: [
                  { influence: 16.666666667, speed: -2.66086134453782 },
                  { influence: 16.666666667, speed: -2.66086134453782 },
                  { influence: 16.666666667, speed: 0 },
                ],
                outEase: [
                  { influence: 16.666666667, speed: 0 },
                  { influence: 16.666666667, speed: 0 },
                  { influence: 16.666666667, speed: 0 },
                ],
              },
            ],
          },
          { name: "Rotation", matchName: "ADBE Rotate Z", type: 6212, numKeys: 0, value: 0 },
          { name: "Opacity", matchName: "ADBE Opacity", type: 6212, numKeys: 0, value: 100 },
        ],
      },
      masks: {
        name: "Masks",
        matchName: "ADBE Mask Parade",
        type: 6214,
        numKeys: null,
        value: null,
      },
      effects: {
        name: "Effects",
        matchName: "ADBE Effect Parade",
        type: 6214,
        numKeys: null,
        value: null,
      },
    },
  ],
} as CompSpec;
export default comp_48;
