import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Column, Row, SortKey } from "./data";
import type { SortRule } from "./query";
import { Cell, cellText } from "./cells";

const ROW_H = 36;
const HEAD_H = 40;
const CHECK_W = 44;
const OVERSCAN_ROWS = 6;
const MIN_COL_W = 64;

type Pos = { r: number; c: number };

type Props = {
  rows: Row[];
  order: Int32Array;
  columns: Column[]; // first column is pinned
  widths: Record<string, number>;
  onResize: (key: string, width: number | null) => void;
  sort: SortRule[];
  onSort: (key: SortKey, additive: boolean) => void;
  selected: Set<number>;
  onSelectedChange: (next: Set<number>) => void;
  onEdit: (index: number, patch: Partial<Row>) => void;
  onCopy: (text: string, label: string) => void;
  footer: React.ReactNode;
};

const isNumeric = (c: Column) => c.kind === "number";

export default function Grid(props: Props) {
  const { rows, order, columns, widths, sort, selected } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [active, setActive] = useState<Pos>({ r: 0, c: 0 });
  const [editing, setEditing] = useState<Pos | null>(null);
  const anchor = useRef<number | null>(null);

  const n = order.length;
  const width = (c: Column) => widths[c.key] ?? c.width;
  const [pinned, ...rest] = columns;
  const pinnedW = CHECK_W + width(pinned);
  const offsets = useMemo(() => {
    const out: number[] = [];
    let x = 0;
    for (const c of rest) {
      out.push(x);
      x += widths[c.key] ?? c.width;
    }
    out.push(x);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, widths]);
  const restW = offsets[offsets.length - 1];
  const totalW = pinnedW + restW;

  // Viewport size
  useLayoutEffect(() => {
    const el = scroller.current!;
    const measure = () => setVp({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Batch scroll updates to one per frame
  const frame = useRef(0);
  const onScroll = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const el = scroller.current!;
      setScroll({ top: el.scrollTop, left: el.scrollLeft });
    });
  };

  // Keep the active cell inside the result set when the query changes
  useEffect(() => {
    setActive((a) => ({ ...a, r: Math.min(a.r, Math.max(0, n - 1)) }));
    setEditing(null);
  }, [order, n]);

  // Visible window
  const firstRow = Math.max(0, Math.floor(scroll.top / ROW_H) - OVERSCAN_ROWS);
  const lastRow = Math.min(n, Math.ceil((scroll.top + vp.h) / ROW_H) + OVERSCAN_ROWS);
  const viewL = scroll.left;
  const viewR = scroll.left + vp.w - pinnedW;
  const visibleCols: number[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (offsets[i + 1] >= viewL - 120 && offsets[i] <= viewR + 120) visibleCols.push(i);
  }

  const ensureVisible = useCallback(
    (p: Pos) => {
      const el = scroller.current!;
      const top = p.r * ROW_H;
      const bodyH = el.clientHeight - HEAD_H;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (top + ROW_H > el.scrollTop + bodyH) el.scrollTop = top + ROW_H - bodyH;
      if (p.c > 0) {
        const x = offsets[p.c - 1];
        const w = offsets[p.c] - x;
        const avail = el.clientWidth - pinnedW;
        if (x < el.scrollLeft) el.scrollLeft = x;
        else if (x + w > el.scrollLeft + avail) el.scrollLeft = x + w - avail;
      }
    },
    [offsets, pinnedW],
  );

  const moveTo = (p: Pos) => {
    const next = { r: Math.max(0, Math.min(n - 1, p.r)), c: Math.max(0, Math.min(columns.length - 1, p.c)) };
    setActive(next);
    ensureVisible(next);
  };

  const toggleRow = (pos: number, range: boolean) => {
    const next = new Set(selected);
    if (range && anchor.current !== null) {
      const [a, b] = anchor.current < pos ? [anchor.current, pos] : [pos, anchor.current];
      for (let i = a; i <= b; i++) next.add(order[i]);
    } else {
      const idx = order[pos];
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      anchor.current = pos;
    }
    props.onSelectedChange(next);
  };

  const allSelected = n > 0 && selected.size >= n && order.every((i) => selected.has(i));
  const toggleAll = () => props.onSelectedChange(allSelected ? new Set() : new Set(order));

  const startEdit = (p: Pos) => {
    if (columns[p.c]?.editable) setEditing(p);
  };

  const commit = (p: Pos, raw: string) => {
    const col = columns[p.c];
    const index = order[p.r];
    const value = raw.trim();
    if (isNumeric(col)) {
      const num = Number(value.replace(/[$,]/g, ""));
      if (Number.isFinite(num) && num >= 0) props.onEdit(index, { [col.key]: Math.round(num) } as Partial<Row>);
    } else if (value) {
      props.onEdit(index, { [col.key]: value } as Partial<Row>);
    }
    setEditing(null);
    scroller.current?.focus({ preventScroll: true });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing || e.target !== scroller.current) return;
    const mod = e.metaKey || e.ctrlKey;
    const page = Math.max(1, Math.floor((vp.h - HEAD_H) / ROW_H) - 1);
    const { r, c } = active;
    const keys: Record<string, () => void> = {
      ArrowDown: () => moveTo({ r: mod ? n - 1 : r + 1, c }),
      ArrowUp: () => moveTo({ r: mod ? 0 : r - 1, c }),
      ArrowRight: () => moveTo({ r, c: mod ? columns.length - 1 : c + 1 }),
      ArrowLeft: () => moveTo({ r, c: mod ? 0 : c - 1 }),
      PageDown: () => moveTo({ r: r + page, c }),
      PageUp: () => moveTo({ r: r - page, c }),
      Home: () => moveTo({ r: mod ? 0 : r, c: 0 }),
      End: () => moveTo({ r: mod ? n - 1 : r, c: columns.length - 1 }),
      Enter: () => startEdit(active),
      F2: () => startEdit(active),
      " ": () => toggleRow(r, e.shiftKey),
      Escape: () => props.onSelectedChange(new Set()),
    };
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      props.onSelectedChange(new Set(order));
      return;
    }
    if (mod && e.key.toLowerCase() === "c") {
      e.preventDefault();
      if (selected.size) {
        const head = columns.filter((col) => col.kind !== "chart");
        const lines = [...selected].slice(0, 5000).map((i) => head.map((col) => cellText(rows[i], col)).join("\t"));
        props.onCopy([head.map((h) => h.label).join("\t"), ...lines].join("\n"), `Copied ${lines.length.toLocaleString()} rows`);
      } else if (n) {
        props.onCopy(cellText(rows[order[r]], columns[c]), "Copied cell");
      }
      return;
    }
    const fn = keys[e.key];
    if (fn && n) {
      e.preventDefault();
      fn();
    }
  };

  const cellId = (r: number, c: number) => `cell-${r}-${c}`;
  const activeId = n ? cellId(active.r, active.c) : undefined;

  const renderCell = (pos: number, ci: number, col: Column, style: React.CSSProperties) => {
    const row = rows[order[pos]];
    const isActive = active.r === pos && active.c === ci;
    const isEditing = editing?.r === pos && editing.c === ci;
    return (
      <div
        key={col.key}
        id={cellId(pos, ci)}
        role="gridcell"
        aria-colindex={ci + 2}
        aria-readonly={!col.editable}
        style={style}
        onMouseDown={() => setActive({ r: pos, c: ci })}
        onDoubleClick={() => startEdit({ r: pos, c: ci })}
        className={`flex h-full items-center overflow-hidden px-3 text-sm ${isNumeric(col) ? "justify-end" : ""} ${
          isActive ? "z-[1] outline-2 -outline-offset-2 outline-accent" : ""
        }`}
      >
        {isEditing ? <Editor initial={cellText(row, col)} numeric={isNumeric(col)} onDone={(v) => (v === null ? (setEditing(null), scroller.current?.focus()) : commit({ r: pos, c: ci }, v))} /> : <Cell row={row} col={col} />}
      </div>
    );
  };

  const header = (col: Column, ci: number, style: React.CSSProperties) => {
    const ruleIdx = sort.findIndex((s) => s.key === col.key);
    const rule = sort[ruleIdx];
    const sortable = col.kind !== "chart";
    return (
      <div
        key={col.key}
        role="columnheader"
        aria-colindex={ci + 2}
        aria-sort={rule ? (rule.dir === "asc" ? "ascending" : "descending") : "none"}
        style={style}
        className={`group relative flex h-full items-center border-r border-line ${isNumeric(col) ? "justify-end" : ""}`}
      >
        {sortable ? (
          <button
            type="button"
            title="Click to sort · Shift-click to add to the sort"
            onClick={(e) => props.onSort(col.key as SortKey, e.shiftKey)}
            className={`flex h-full w-full items-center gap-1.5 px-3 text-left text-xs font-semibold uppercase tracking-wide hover:text-fg ${rule ? "text-fg" : "text-muted"} ${isNumeric(col) ? "justify-end" : ""}`}
          >
            <span className="truncate">{col.label}</span>
            {rule && (
              <span className="flex items-center font-mono text-[10px] text-accent" aria-hidden="true">
                {rule.dir === "asc" ? "↑" : "↓"}
                {sort.length > 1 && <sup>{ruleIdx + 1}</sup>}
              </span>
            )}
          </button>
        ) : (
          <span className="px-3 text-xs font-semibold uppercase tracking-wide text-muted">{col.label}</span>
        )}
        <ResizeHandle label={col.label} width={width(col)} onResize={(w) => props.onResize(col.key, w)} />
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scroller}
        role="grid"
        aria-label="Customers"
        aria-rowcount={n + 1}
        aria-colcount={columns.length + 1}
        aria-multiselectable="true"
        aria-activedescendant={activeId}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent/40"
      >
        <div style={{ width: totalW, height: HEAD_H + n * ROW_H }} className="relative">
          {/* Header */}
          <div role="row" aria-rowindex={1} className="sticky top-0 z-20 flex border-b border-line bg-surface-2" style={{ height: HEAD_H, width: totalW }}>
            <div className="sticky left-0 z-10 flex border-r border-line bg-surface-2" style={{ width: pinnedW }}>
              <div role="columnheader" aria-colindex={1} className="grid h-full place-items-center border-r border-line" style={{ width: CHECK_W }}>
                <input type="checkbox" aria-label="Select all rows" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-[var(--accent)]" />
              </div>
              {header(pinned, 0, { width: width(pinned) })}
            </div>
            <div className="relative" style={{ width: restW }}>
              {visibleCols.map((i) => header(rest[i], i + 1, { position: "absolute", left: offsets[i], width: offsets[i + 1] - offsets[i] }))}
            </div>
          </div>

          {/* Body: only the rows and columns in view are in the DOM */}
          {Array.from({ length: Math.max(0, lastRow - firstRow) }, (_, k) => {
            const pos = firstRow + k;
            const idx = order[pos];
            const isSel = selected.has(idx);
            return (
              <div
                key={idx}
                role="row"
                aria-rowindex={pos + 2}
                aria-selected={isSel}
                className={`absolute left-0 flex border-b border-line/70 ${isSel ? "bg-accent-soft" : pos % 2 ? "bg-surface" : "bg-bg"} hover:bg-hover`}
                style={{ top: HEAD_H + pos * ROW_H, height: ROW_H, width: totalW }}
              >
                <div className={`sticky left-0 z-10 flex border-r border-line ${isSel ? "bg-accent-soft-solid" : pos % 2 ? "bg-surface" : "bg-bg"}`} style={{ width: pinnedW }}>
                  <div role="gridcell" aria-colindex={1} className="grid h-full place-items-center" style={{ width: CHECK_W }}>
                    <input
                      type="checkbox"
                      tabIndex={-1}
                      aria-label={`Select ${rows[idx].name}`}
                      checked={isSel}
                      onChange={() => {}}
                      onClick={(e) => toggleRow(pos, e.shiftKey)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                  </div>
                  {renderCell(pos, 0, pinned, { width: width(pinned) })}
                </div>
                <div className="relative h-full" style={{ width: restW }}>
                  {visibleCols.map((i) => renderCell(pos, i + 1, rest[i], { position: "absolute", left: offsets[i], width: offsets[i + 1] - offsets[i] }))}
                </div>
              </div>
            );
          })}

          {n === 0 && (
            <div className="sticky left-0 grid place-items-center text-sm text-muted" style={{ top: HEAD_H, height: 200, width: vp.w }}>
              No customers match these filters.
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line bg-surface-2 px-4 py-2 font-mono text-[11px] text-muted">
        <span>
          DOM: <b className="text-fg">{Math.max(0, lastRow - firstRow)}</b> rows × <b className="text-fg">{visibleCols.length + 1}</b> cols of {n.toLocaleString()}
        </span>
        {props.footer}
      </div>
    </div>
  );
}

function Editor({ initial, numeric, onDone }: { initial: string; numeric: boolean; onDone: (value: string | null) => void }) {
  const done = useRef(false);
  const finish = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(v);
  };
  return (
    <input
      autoFocus
      defaultValue={initial}
      inputMode={numeric ? "numeric" : "text"}
      aria-label="Edit cell"
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(e.currentTarget.value);
        if (e.key === "Escape") finish(null);
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
      className={`h-7 w-full rounded border border-accent bg-bg px-2 text-sm outline-none ${numeric ? "text-right" : ""}`}
    />
  );
}

function ResizeHandle({ label, width, onResize }: { label: string; width: number; onResize: (w: number | null) => void }) {
  const start = useRef<{ x: number; w: number } | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label} column`}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, w: width };
      }}
      onPointerMove={(e) => {
        if (start.current) onResize(Math.max(MIN_COL_W, start.current.w + e.clientX - start.current.x));
      }}
      onPointerUp={() => (start.current = null)}
      onDoubleClick={() => onResize(null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          onResize(Math.max(MIN_COL_W, width + (e.key === "ArrowRight" ? 16 : -16)));
        }
      }}
      className="absolute right-0 top-0 z-10 h-full w-2 cursor-col-resize touch-none opacity-0 transition hover:bg-accent/60 hover:opacity-100 focus-visible:bg-accent focus-visible:opacity-100 group-hover:opacity-40"
    />
  );
}
