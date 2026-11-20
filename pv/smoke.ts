// Smoke-test spec: exercises every runtime path (comps, shape paths,
// keyframes+eases, masks, text, parenting, footage, track matte).
// Build: node tools/build-jsx.ts --spec pv/smoke.ts --out dist/smoke.jsx
import type { CompSpec, ProjectSpec } from './model/types.ts';

const TRI = {
  vertices: [[0, 0], [100, 0], [50, 80]],
  inTangents: [[0, 0], [0, 0], [0, 0]],
  outTangents: [[0, 0], [0, 0], [0, 0]],
  closed: true,
};

const inner: CompSpec = {
  name: 'smoke-inner',
  width: 200, height: 200, duration: 2, frameRate: 24,
  layers: [
    {
      index: 1, name: 'tri', kind: 'shape',
      shapes: {
        name: 'Contents', matchName: 'ADBE Root Vectors Group',
        properties: [
          {
            name: 'Group 1', matchName: 'ADBE Vector Group',
            properties: [
              {
                name: 'Contents', matchName: 'ADBE Vectors Group',
                properties: [
                  { name: 'Path 1', matchName: 'ADBE Vector Shape - Group',
                    properties: [{ name: 'Path', matchName: 'ADBE Vector Shape', value: TRI }] },
                  { name: 'Fill 1', matchName: 'ADBE Vector Graphic - Fill',
                    properties: [
                      { name: 'Color', matchName: 'ADBE Vector Fill Color', value: [0.8, 0.1, 0.1] },
                      { name: 'Opacity', matchName: 'ADBE Vector Fill Opacity', value: 100 },
                    ] },
                ],
              },
            ],
          },
        ],
      },
      transform: {
        name: 'Transform', matchName: 'ADBE Transform Group',
        properties: [
          { name: 'Position', matchName: 'ADBE Position',
            keys: [
              { t: 0, v: [50, 50], outT: 2, outEase: [[0.2, 50]] },
              { t: 1.5, v: [150, 100], inT: 2, inEase: [[75, 0.5]], outT: 2, outEase: [[0.1, 90]] },
              { t: 2, v: [100, 150] },
            ] },
          { name: 'Opacity', matchName: 'ADBE Opacity', value: 100 },
        ],
      },
    },
    {
      index: 2, name: 'label', kind: 'text',
      text: {
        name: 'Text', matchName: 'ADBE Text Properties',
        properties: [
          { name: 'Source Text', matchName: 'ADBE Text Document',
            value: { text: 'smoke', font: 'Arial-BoldMT', size: 48, fillColor: [0, 0, 0] } },
        ],
      },
      transform: {
        name: 'Transform', matchName: 'ADBE Transform Group',
        properties: [
          { name: 'Position', matchName: 'ADBE Position', value: [100, 30] },
        ],
      },
    },
  ],
};

const master: CompSpec = {
  name: 'smoke-master',
  width: 400, height: 300, duration: 3, frameRate: 24,
  layers: [
    {
      index: 1, name: 'inner', kind: 'comp', source: 'smoke-inner',
      inPoint: 0.25, outPoint: 2.25, startTime: 0.25,
      transform: {
        name: 'Transform', matchName: 'ADBE Transform Group',
        properties: [
          { name: 'Position', matchName: 'ADBE Position', value: [200, 150] },
          { name: 'Scale', matchName: 'ADBE Scale', value: [50, 50, 100] },
        ],
      },
    },
    {
      index: 2, name: 'null-parent', kind: 'null',
      transform: {
        name: 'Transform', matchName: 'ADBE Transform Group',
        properties: [
          { name: 'Position', matchName: 'ADBE Position', value: [50, 250] },
        ],
      },
    },
    {
      index: 3, name: 'child', kind: 'shape',
      parentIndex: 2,
      shapes: {
        name: 'Contents', matchName: 'ADBE Root Vectors Group',
        properties: [
          {
            name: 'Group 1', matchName: 'ADBE Vector Group',
            properties: [
              {
                name: 'Contents', matchName: 'ADBE Vectors Group',
                properties: [
                  { name: 'Ellipse 1', matchName: 'ADBE Vector Shape - Ellipse',
                    properties: [
                      { name: 'Size', matchName: 'ADBE Vector Ellipse Size', value: [40, 40] },
                      { name: 'Position', matchName: 'ADBE Vector Ellipse Position', value: [0, 0] },
                    ] },
                  { name: 'Stroke 1', matchName: 'ADBE Vector Graphic - Stroke',
                    properties: [
                      { name: 'Color', matchName: 'ADBE Vector Stroke Color', value: [0, 0, 1] },
                      { name: 'Width', matchName: 'ADBE Vector Stroke Width', value: 4 },
                    ] },
                ],
              },
            ],
          },
        ],
      },
    },
    {
      index: 4, name: 'masked', kind: 'shape',
      masks: {
        name: 'Masks', matchName: 'ADBE Mask Parade',
        properties: [
          {
            name: 'Mask 1', matchName: 'ADBE Mask Atom', maskMode: 'add',
            properties: [
              { name: 'Mask Shape', matchName: 'ADBE Mask Shape', value: TRI },
              { name: 'Mask Opacity', matchName: 'ADBE Mask Opacity', value: 100 },
              { name: 'Mask Feather', matchName: 'ADBE Mask Feather', value: 0 },
            ],
          },
        ],
      },
      shapes: {
        name: 'Contents', matchName: 'ADBE Root Vectors Group',
        properties: [
          {
            name: 'Group 1', matchName: 'ADBE Vector Group',
            properties: [
              {
                name: 'Contents', matchName: 'ADBE Vectors Group',
                properties: [
                  { name: 'Rect 1', matchName: 'ADBE Vector Shape - Rect',
                    properties: [
                      { name: 'Size', matchName: 'ADBE Vector Rect Size', value: [120, 60] },
                      { name: 'Position', matchName: 'ADBE Vector Rect Position', value: [0, 0] },
                    ] },
                  { name: 'Fill 1', matchName: 'ADBE Vector Graphic - Fill',
                    properties: [
                      { name: 'Color', matchName: 'ADBE Vector Fill Color', value: [0.1, 0.6, 0.2] },
                    ] },
                ],
              },
            ],
          },
        ],
      },
      transform: {
        name: 'Transform', matchName: 'ADBE Transform Group',
        properties: [
          { name: 'Position', matchName: 'ADBE Position', value: [300, 60] },
        ],
      },
    },
    {
      index: 5, name: 'photo', kind: 'footage', source: 'Ae.png',
      inPoint: 0, outPoint: 3,
      transform: {
        name: 'Transform', matchName: 'ADBE Transform Group',
        properties: [
          { name: 'Position', matchName: 'ADBE Position', value: [330, 220] },
          { name: 'Scale', matchName: 'ADBE Scale', value: [25, 25, 100] },
        ],
      },
    },
  ],
};

export function buildSpec(): ProjectSpec {
  return {
    name: 'pv-smoke',
    comps: [inner, master],
    footage: [{ file: 'assets/images/Ae.png' }],
  };
}
