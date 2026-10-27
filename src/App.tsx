import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Grid from "./Grid";
import { COLUMNS, PLANS, ROW_COUNT, STATUSES, generateRows, type ColumnKey, type Plan, type Row, type SortKey, type Status } from "./data";
import type { Query, SortRule } from "./query";
import { useGridQuery } from "./useGridQuery";
import { cellText } from "./cells";

function useFps() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let id = 0;
    const tick = (t: number) => {
      frames++;
      if (t - last >= 500) {
        setFps(Math.round((frames * 1000) / (t - last)));
        frames = 0;
        last = t;
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);
  return fps;
}

function nextSort(sort: SortRule[], key: SortKey, additive: boolean): SortRule[] {
  const kind = COLUMNS.find((c) => c.key === key)!.kind;
  const firstDir = kind === "number" || kind === "date" ? "desc" : "asc";
  const existing = sort.find((s) => s.key === key);
  // Cycle: first direction → opposite → off
  const cycled: SortRule | null = !existing ? { key, dir: firstDir } : existing.dir === firstDir ? { key, dir: firstDir === "asc" ? "desc" : "asc" } : null;
  if (!additive) return cycled ? [cycled] : [];
  const others = sort.filter((s) => s.key !== key);
  return cycled ? (existing ? sort.map((s) => (s.key === key ? cycled : s)) : [...others, cycled]) : others;
}

function toggle<T>(list: T[], item: T) {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export default function App() {
  const rows = useMemo(() => generateRows(), []);
  const [, bump] = useState(0);
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sort, setSort] = useState<SortRule[]>([{ key: "mrr", dir: "desc" }]);
  const [hidden, setHidden] = useState<Set<ColumnKey>>(new Set());
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fps = useFps();

  const deferredSearch = useDeferredValue(search);
  const query: Query = useMemo(() => ({ search: deferredSearch, statuses, plans, sort }), [deferredSearch, statuses, plans, sort]);
  const { order, ms, pending, edit } = useGridQuery(query);
  const columns = useMemo(() => COLUMNS.filter((c) => !hidden.has(c.key)), [hidden]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1800);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onEdit = (index: number, patch: Partial<Row>) => {
    Object.assign(rows[index], patch);
    bump((v) => v + 1);
    edit(index, patch);
    flash("Saved");
  };

  const exportCsv = () => {
    if (!order) return;
    const cols = columns.filter((c) => c.kind !== "chart");
    const source = selected.size ? order.filter((i) => selected.has(i)) : order;
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [cols.map((c) => c.label).join(",")];
    for (const i of source) lines.push(cols.map((c) => esc(cellText(rows[i], c))).join(","));
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "gridline-export.csv" });
    a.click();
    URL.revokeObjectURL(url);
    flash(`Exported ${source.length.toLocaleString()} rows`);
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text).then(
      () => flash(label),
      () => flash("Clipboard blocked by the browser"),
    );
  };

  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition ${on ? "border-accent bg-accent-soft text-fg" : "border-line text-muted hover:text-fg"}`;

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <div className="mr-2 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-sm font-bold text-white" aria-hidden="true">
            ▦
          </span>
          <h1 className="text-base font-semibold tracking-tight">Gridline</h1>
          <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted">{ROW_COUNT.toLocaleString()} rows · no table library</span>
        </div>

        <label className="relative min-w-56 flex-1 sm:max-w-xs">
          <span className="sr-only">Search customers</span>
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company, email…"
            className="h-9 w-full rounded-lg border border-line bg-surface px-3 pr-9 text-sm outline-none placeholder:text-muted focus:border-accent"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-line px-1.5 font-mono text-[10px] text-muted">/</kbd>
        </label>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by status">
          {STATUSES.map((s) => (
            <button key={s} type="button" aria-pressed={statuses.includes(s)} onClick={() => setStatuses((l) => toggle(l, s))} className={chip(statuses.includes(s))}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by plan">
          {PLANS.map((p) => (
            <button key={p} type="button" aria-pressed={plans.includes(p)} onClick={() => setPlans((l) => toggle(l, p))} className={chip(plans.includes(p))}>
              {p}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <details className="relative">
            <summary className="flex h-9 cursor-pointer list-none items-center rounded-lg border border-line px-3 text-sm hover:bg-surface-2">Columns</summary>
            <div className="absolute right-0 z-30 mt-1 w-52 rounded-lg border border-line bg-surface p-2 shadow-xl">
              {COLUMNS.map((c, i) => (
                <label key={c.key} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-2">
                  <input type="checkbox" disabled={i === 0} checked={!hidden.has(c.key)} onChange={() => setHidden((h) => { const next = new Set(h); if (next.has(c.key)) next.delete(c.key); else next.add(c.key); return next; })} className="accent-[var(--accent)]" />
                  {c.label}
                  {i === 0 && <span className="ml-auto text-[10px] text-muted">pinned</span>}
                </label>
              ))}
            </div>
          </details>
          <button type="button" onClick={exportCsv} className="h-9 rounded-lg bg-accent px-3 text-sm font-medium text-white hover:opacity-90">
            Export CSV{selected.size ? ` (${selected.size.toLocaleString()})` : ""}
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        {order ? (
          <Grid
            rows={rows}
            order={order}
            columns={columns}
            widths={widths}
            onResize={(key, w) => setWidths((ws) => { const next = { ...ws }; if (w === null) delete next[key]; else next[key] = w; return next; })}
            sort={sort}
            onSort={(key, additive) => setSort((s) => nextSort(s, key, additive))}
            selected={selected}
            onSelectedChange={setSelected}
            onEdit={onEdit}
            onCopy={copy}
            footer={
              <>
                <span>
                  Query: <b className="text-fg">{ms.toFixed(1)} ms</b> in a Web Worker{pending && " · updating…"}
                </span>
                <span>
                  <b className="text-fg">{order.length.toLocaleString()}</b> matching
                </span>
                {selected.size > 0 && (
                  <span>
                    <b className="text-fg">{selected.size.toLocaleString()}</b> selected
                  </span>
                )}
                <span>
                  <b className="text-fg">{fps}</b> fps
                </span>
                <span className="ml-auto hidden md:inline">↑↓←→ move · Enter edit · Space select · Shift-click range · ⌘C copy · Shift-click header to multi-sort</span>
              </>
            }
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted">Indexing {ROW_COUNT.toLocaleString()} rows…</div>
        )}
      </main>

      <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-14 left-1/2 -translate-x-1/2">
        {toast && <div className="rounded-lg bg-fg px-3 py-2 text-sm text-bg shadow-lg">{toast}</div>}
      </div>
    </div>
  );
}
