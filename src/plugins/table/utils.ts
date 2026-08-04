import { Node } from "../../dom/node.js";
import { getAttribute } from "../../dom/helpers.js";
import { stringWidth } from "../../internal/width.js";

/**
 * The content should be at least 1 character wide.
 * This also ensures that the table is correctly *recognized* as a markdown table.
 */
const DEFAULT_CELL_WIDTH = 1;

/**
 * Returns how many terminal columns the cell content occupies.
 *
 * This differs from the number of characters for e.g. CJK characters, emojis
 * and combining characters — which is what makes the columns line up.
 */
export function cellDisplayWidth(cell: string): number {
  return stringWidth(cell);
}

export function calculateMaxWidths(rows: string[][]): number[] {
  const maxWidths: number[] = [];

  for (const cells of rows) {
    for (let index = 0; index < cells.length; index++) {
      const width = cellDisplayWidth(cells[index]!);

      if (index >= maxWidths.length) {
        maxWidths.push(DEFAULT_CELL_WIDTH);
      }
      if (width > maxWidths[index]!) {
        maxWidths[index] = width;
      }
    }
  }

  return maxWidths;
}

export function fillUpRows(rows: string[][], maxColumnCount: number): string[][] {
  for (const cells of rows) {
    const missingCells = maxColumnCount - cells.length;
    for (let i = 0; i < missingCells; i++) {
      cells.push("");
    }
  }
  return rows;
}

export function getNumberAttributeOr(node: Node, key: string, fallback: number): number {
  const val = getAttribute(node, key);
  if (val === undefined) {
    return fallback;
  }
  if (!/^[+-]?\d+$/.test(val.trim())) {
    return fallback;
  }
  const num = Number.parseInt(val, 10);
  if (!Number.isFinite(num) || num < 1) {
    return fallback;
  }
  return num;
}

// - - - - - - - - - - - - - Col / row span - - - - - - - - - - - - - //

export interface Modification {
  y: number;
  x: number;
  data: string;
}

export function calculateModifications(
  currentRowIndex: number,
  currentColIndex: number,
  rowSpan: number,
  colSpan: number,
  data: string,
): Modification[] {
  const mods: Modification[] = [];

  if (colSpan <= 1 && rowSpan <= 1) {
    // No modification is needed
    return mods;
  }

  // Calculate modifications for colspan
  for (let dx = 1; dx < colSpan; dx++) {
    // Add modifications for the same row
    mods.push({ y: currentRowIndex, x: currentColIndex + dx, data });
  }

  // Calculate modifications for subsequent rows
  if (rowSpan > 1) {
    for (let dy = 1; dy < rowSpan; dy++) {
      for (let dx = 0; dx < colSpan; dx++) {
        mods.push({ y: currentRowIndex + dy, x: currentColIndex + dx, data });
      }
    }
  }

  return mods;
}

/** Ensures the array is long enough for the given index to be assignable. */
function growSlice<T>(contents: T[], index: number, placeholder: () => T): T[] {
  while (contents.length <= index) {
    contents.push(placeholder());
  }
  return contents;
}

export function applyModifications(contents: string[][], mods: Modification[]): string[][] {
  for (const mod of mods) {
    // Grow on the y axis
    growSlice(contents, mod.y, () => []);

    // Grow on the x axis
    // (Note: we only grow x-1 since the insert takes care of the rest)
    growSlice(contents[mod.y]!, mod.x - 1, () => "");

    // Now we can do our change:
    contents[mod.y]!.splice(mod.x, 0, mod.data);
  }

  return contents;
}

export function applyGroupedModifications(
  contents: string[][],
  groupedMods: Modification[][],
): string[][] {
  // By applying the modifications in reverse we correctly
  // handle overlapping modifications.
  for (let i = groupedMods.length - 1; i >= 0; i--) {
    contents = applyModifications(contents, groupedMods[i]!);
  }

  return contents;
}

// - - - - - - - - - - - - - Empty rows - - - - - - - - - - - - - //

function isEmptyRow(cells: string[]): boolean {
  return cells.every((cell) => cell.length === 0);
}

export function removeEmptyRows(rows: string[][]): string[][] {
  const filtered = rows.filter((cells, index) => {
    // Always keep the first row (the header row)
    if (index === 0) {
      return true;
    }
    return !isEmptyRow(cells);
  });

  if (filtered.length === 1 && isEmptyRow(filtered[0]!)) {
    // If all the rows are empty (including the header row)
    // then the table is completely empty...
    return [];
  }

  return filtered;
}

export function removeFirstRowIfEmpty(rows: string[][]): string[][] {
  if (rows.length > 0 && isEmptyRow(rows[0]!)) {
    // The first row (the header row) is empty. So lets remove it...
    return rows.slice(1);
  }
  return rows;
}
