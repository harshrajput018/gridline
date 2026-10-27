import { describe, expect, it } from "vitest";
import { generateRows, type Row } from "./data";
import { buildSearchIndex, runQuery, type Query } from "./query";

const rows = generateRows(5000, 7);
const hay = buildSearchIndex(rows);
const q = (over: Partial<Query>): Query => ({ search: "", statuses: [], plans: [], sort: [], ...over });
const pick = (idx: Int32Array) => Array.from(idx, (i) => rows[i]);

describe("generateRows", () => {
  it("is deterministic for a seed, so the worker and UI hold the same data", () => {
    expect(generateRows(50, 7)).toEqual(generateRows(50, 7));
    expect(generateRows(50, 8)).not.toEqual(generateRows(50, 7));
  });
});

describe("runQuery", () => {
  it("returns every row in original order with no filters or sort", () => {
    const res = runQuery(rows, hay, q({}));
    expect(res.length).toBe(rows.length);
    expect(res[0]).toBe(0);
    expect(res[res.length - 1]).toBe(rows.length - 1);
  });

  it("filters by status and plan together", () => {
    const res = pick(runQuery(rows, hay, q({ statuses: ["Trial"], plans: ["Growth", "Enterprise"] })));
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((r) => r.status === "Trial" && (r.plan === "Growth" || r.plan === "Enterprise"))).toBe(true);
  });

  it("matches every search term, case-insensitively, across fields", () => {
    const target = rows[123];
    const [first] = target.name.split(" ");
    const res = pick(runQuery(rows, hay, q({ search: `${first.toUpperCase()}  ${target.country}` })));
    expect(res).toContain(target);
    expect(res.every((r) => r.name.includes(first) || r.email.includes(first.toLowerCase()) || r.company.includes(first))).toBe(true);
  });

  it("sorts numbers descending", () => {
    const res = pick(runQuery(rows, hay, q({ sort: [{ key: "mrr", dir: "desc" }] })));
    for (let i = 1; i < res.length; i++) expect(res[i - 1].mrr).toBeGreaterThanOrEqual(res[i].mrr);
  });

  it("sorts enums by their natural order, not alphabetically", () => {
    const res = pick(runQuery(rows, hay, q({ sort: [{ key: "plan", dir: "asc" }] })));
    expect(res[0].plan).toBe("Free");
    expect(res[res.length - 1].plan).toBe("Enterprise");
  });

  it("applies multi-column sort with later rules breaking ties", () => {
    const res = pick(runQuery(rows, hay, q({ sort: [{ key: "status", dir: "asc" }, { key: "seats", dir: "desc" }] })));
    const cmp = (a: Row, b: Row) => ["Active", "Trial", "Paused", "Churned"].indexOf(a.status) - ["Active", "Trial", "Paused", "Churned"].indexOf(b.status) || b.seats - a.seats;
    for (let i = 1; i < res.length; i++) expect(cmp(res[i - 1], res[i])).toBeLessThanOrEqual(0);
  });
});
