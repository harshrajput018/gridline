import { PLANS, STATUSES, type Plan, type Row, type SortKey, type Status } from "./data";

export type SortRule = { key: SortKey; dir: "asc" | "desc" };
export type Query = { search: string; statuses: Status[]; plans: Plan[]; sort: SortRule[] };

export function searchText(r: Row) {
  return `${r.name} ${r.company} ${r.email} ${r.country}`.toLowerCase();
}

export function buildSearchIndex(rows: Row[]) {
  return rows.map(searchText);
}

function sortValues(rows: Row[], key: SortKey): ArrayLike<number> | string[] {
  if (key === "plan") return Int8Array.from(rows, (r) => PLANS.indexOf(r.plan));
  if (key === "status") return Int8Array.from(rows, (r) => STATUSES.indexOf(r.status));
  if (typeof rows[0]?.[key] === "string") return rows.map((r) => (r[key] as string).toLowerCase());
  return Float64Array.from(rows, (r) => r[key] as number);
}

/**
 * Filters and sorts without copying rows — returns an Int32Array of row indexes,
 * which can be transferred (not cloned) back to the main thread.
 */
export function runQuery(rows: Row[], haystack: string[], q: Query): Int32Array {
  const terms = q.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const statuses = q.statuses.length ? new Set(q.statuses) : null;
  const plans = q.plans.length ? new Set(q.plans) : null;

  const hits = new Int32Array(rows.length);
  let n = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (statuses && !statuses.has(r.status)) continue;
    if (plans && !plans.has(r.plan)) continue;
    if (terms.length) {
      const h = haystack[i];
      let ok = true;
      for (const t of terms) if (!h.includes(t)) { ok = false; break; }
      if (!ok) continue;
    }
    hits[n++] = i;
  }
  const result = hits.slice(0, n);

  if (q.sort.length) {
    // Pre-extract one flat column per sort key so the comparator never touches row objects.
    const rules = q.sort.map((s) => ({ vals: sortValues(rows, s.key), dir: s.dir === "asc" ? 1 : -1 }));
    result.sort((a, b) => {
      for (const { vals, dir } of rules) {
        const va = vals[a];
        const vb = vals[b];
        if (va < vb) return -dir;
        if (va > vb) return dir;
      }
      return a - b;
    });
  }
  return result;
}
