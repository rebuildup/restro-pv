// Layout grid — pure geometry for the production model. A GridSpec describes
// `columns` x `rows` cells inside the frame minus `margin`, separated by
// `gutter`; every dependent placement is recomputed from it at compile time,
// so changing the grid re-flows sections without touching their definitions.

import type { Vec2 } from "../spec/types.ts";
import type { CellSpan, GridSpec, Rect } from "./model.ts";

export interface Grid {
  readonly columns: number;
  readonly rows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  /** Left edge of column line `col` (0..columns); col==columns is the right content edge. */
  columnX(col: number): number;
  /** Top edge of row line `row` (0..rows); row==rows is the bottom content edge. */
  rowY(row: number): number;
  /** Single cell rect (col/row are 0-based, < columns/rows). */
  cell(col: number, row: number): Rect;
  /** Inclusive span of cells [c0, r0, c1, r1]. */
  span(span: CellSpan): Rect;
  /** Grid intersection at column line `col`, row line `row` (0..columns / 0..rows). */
  point(col: number, row: number): Vec2;
}

function assertInt(name: string, v: number, min: number, max: number): void {
  if (!Number.isInteger(v) || v < min || v > max) {
    throw new Error(`grid ${name} must be an integer in [${min}, ${max}], got ${v}`);
  }
}

export function createGrid(spec: GridSpec, frame: { width: number; height: number }): Grid {
  assertInt("columns", spec.columns, 1, 1000);
  assertInt("rows", spec.rows, 1, 1000);
  const { margin, gutter } = spec;
  if (margin.x < 0 || margin.y < 0 || gutter.x < 0 || gutter.y < 0) {
    throw new Error("grid margin/gutter must be >= 0");
  }
  const innerW = frame.width - margin.x * 2 - gutter.x * (spec.columns - 1);
  const innerH = frame.height - margin.y * 2 - gutter.y * (spec.rows - 1);
  const cellWidth = innerW / spec.columns;
  const cellHeight = innerH / spec.rows;
  if (!(cellWidth > 0) || !(cellHeight > 0)) {
    throw new Error(
      `grid cells are not positive (${cellWidth}x${cellHeight}); check frame/margin/gutter`,
    );
  }

  const columnX = (col: number): number => {
    assertInt("column", col, 0, spec.columns);
    if (col === spec.columns) return frame.width - margin.x;
    return margin.x + col * (cellWidth + gutter.x);
  };
  const rowY = (row: number): number => {
    assertInt("row", row, 0, spec.rows);
    if (row === spec.rows) return frame.height - margin.y;
    return margin.y + row * (cellHeight + gutter.y);
  };

  return {
    columns: spec.columns,
    rows: spec.rows,
    cellWidth,
    cellHeight,
    columnX,
    rowY,
    cell(col, row) {
      assertInt("cell column", col, 0, spec.columns - 1);
      assertInt("cell row", row, 0, spec.rows - 1);
      return { x: columnX(col), y: rowY(row), width: cellWidth, height: cellHeight };
    },
    span([c0, r0, c1, r1]) {
      if (c0 > c1 || r0 > r1) throw new Error(`grid span inverted: [${c0},${r0},${c1},${r1}]`);
      return {
        x: columnX(c0),
        y: rowY(r0),
        width: columnX(c1 + 1) - columnX(c0),
        height: rowY(r1 + 1) - rowY(r0),
      };
    },
    point(col, row) {
      return { x: columnX(col), y: rowY(row) };
    },
  };
}
