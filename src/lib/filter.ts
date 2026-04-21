export function toArray(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

export function matchesText(needle: string | undefined, hay: string[]): boolean {
  if (!needle) return true;
  const q = needle.toLowerCase().trim();
  if (!q) return true;
  return hay.some((v) => v?.toLowerCase().includes(q));
}

export function counts<T>(
  items: T[],
  accessor: (t: T) => string | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const v = accessor(it);
    if (v === undefined) continue;
    out[v] = (out[v] ?? 0) + 1;
  }
  return out;
}
