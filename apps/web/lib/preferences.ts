/**
 * Display preferences kept in cookies, so the server renders the page the way the
 * person left it (no flash of images before a client script hides them).
 */

/** "1" when preview images are hidden and cards show a plain placeholder instead. */
export const HIDE_IMAGES_COOKIE = "jl_hide_images";

/** "1" when the sidebar is collapsed on large screens. */
export const SIDEBAR_COLLAPSED_COOKIE = "jl_sidebar_collapsed";

/** The most cards a row of the grid holds (fewer when there isn't room). */
export const GRID_COLUMNS_COOKIE = "jl_grid_columns";
export const GRID_COLUMN_CHOICES = [3, 4, 5] as const;
export type GridColumns = (typeof GRID_COLUMN_CHOICES)[number];

export function readGridColumns(value: string | undefined): GridColumns {
  const columns = Number(value);
  return columns === 4 || columns === 5 ? columns : 3;
}
