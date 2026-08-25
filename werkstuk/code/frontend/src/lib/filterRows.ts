/** Case-insensitive text filter used by the admin tables. */
export function filterRows<T>(
  rows: T[],
  query: string,
  haystack: (row: T) => string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return rows;
  }
  return rows.filter((row) => haystack(row).toLowerCase().includes(needle));
}
