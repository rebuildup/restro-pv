// Contract test: the TypeScript GridSpec must reproduce the ORIGINAL
// master's kg_LayoutGrid parameters measured from legacy/pv-2dc99e1.aep
// (master / Adjustment Layer 5 / kg_LayoutGrid, dumped via ExtendScript):
//
//   Columns Count        12      Margin Left / Right   32
//   Column Gutter        12      Rows Count           24
//   Margin Top / Bottom  80      Row Gutter           12
//   Line Width 2, Band Opacity 48, Display/Guide Mode 1
//
// On the 1080x1080 master this yields cell 73.67 x 26.83 inside
// x 32..1048 / y 80..1000 — deliberately asymmetric: the original design
// gives columns most of the width and compresses rows.

import { describe, expect, test } from "bun:test";
import { createGrid } from "../pv/production/grid.ts";

// kg_LayoutGrid parameters -> GridSpec (margin.x = L/R, margin.y = T/B).
export const ORIGINAL_MASTER_GRID = {
  columns: 12,
  rows: 24,
  margin: { x: 32, y: 80 },
  gutter: { x: 12, y: 12 },
} as const;

const FRAME = { width: 1080, height: 1080 };

describe("original master grid (kg_LayoutGrid)", () => {
  const grid = createGrid(ORIGINAL_MASTER_GRID, FRAME);

  test("cell metrics match the effect's arithmetic", () => {
    // innerW = 1080 - 2*32 - 11*12 = 884 -> 884/12
    expect(grid.cellWidth).toBeCloseTo(884 / 12, 5);
    // innerH = 1080 - 2*80 - 23*12 = 644 -> 644/24
    expect(grid.cellHeight).toBeCloseTo(644 / 24, 5);
  });

  test("grid lines sit at margin + n*(cell+gutter), edges at margin", () => {
    expect(grid.columnX(0)).toBe(32);
    expect(grid.rowY(0)).toBe(80);
    expect(grid.columnX(1)).toBeCloseTo(32 + 884 / 12 + 12, 5);
    expect(grid.rowY(1)).toBeCloseTo(80 + 644 / 24 + 12, 5);
    // Far edges: right/bottom content edge = frame - margin.
    expect(grid.columnX(12)).toBe(1080 - 32);
    expect(grid.rowY(24)).toBe(1080 - 80);
  });

  test("span resolves inclusive cells with gutters excluded", () => {
    const full = grid.span([0, 0, 11, 23]);
    expect(full.x).toBe(32);
    expect(full.y).toBe(80);
    expect(full.x + full.width).toBeCloseTo(1048, 5);
    expect(full.y + full.height).toBeCloseTo(1000, 5);
    // A single cell is cellW x cellH (gutters are not part of cells).
    const c = grid.cell(0, 0);
    expect(c.width).toBeCloseTo(884 / 12, 5);
    expect(c.height).toBeCloseTo(644 / 24, 5);
  });
});
