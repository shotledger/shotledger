// How CountCells lays out its cells, free of React so it is tested on its
// own: as many 48dp cells per row as the width holds, then the rows evened
// out so every cell is the same width and no last row is left nearly empty.

export const MIN_CELL = 48;

export interface CountCellsLayout {
  columns: number;
  cellWidth: number;
}

export function countCellsLayout(width: number, count: number, gap: number): CountCellsLayout {
  if (count <= 0 || width <= 0) return { columns: Math.max(1, count), cellWidth: MIN_CELL };
  const fit = Math.max(1, Math.floor((width + gap) / (MIN_CELL + gap)));
  const rows = Math.ceil(count / fit);
  const columns = Math.ceil(count / rows);
  return { columns, cellWidth: (width - gap * (columns - 1)) / columns };
}
