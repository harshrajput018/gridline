import { trendFor, type Column, type Row, type Status } from "./data";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const int = new Intl.NumberFormat("en-US");
const date = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const regionName = new Intl.DisplayNames(["en"], { type: "region" });

const STATUS_STYLE: Record<Status, string> = {
  Active: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  Trial: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  Paused: "bg-amber-500/14 text-amber-700 dark:text-amber-400",
  Churned: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
};

function flag(code: string) {
  return String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

function Sparkline({ row }: { row: Row }) {
  const pts = trendFor(row);
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const w = 104;
  const h = 20;
  const d = pts.map((v, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * w).toFixed(1)},${(h - ((v - min) / (max - min || 1)) * h).toFixed(1)}`).join("");
  const up = pts[pts.length - 1] >= pts[0];
  return (
    <svg width={w} height={h} viewBox={`0 -1 ${w} ${h + 2}`} aria-label={up ? "Trending up" : "Trending down"} role="img">
      <path d={d} fill="none" strokeWidth="1.5" className={up ? "stroke-emerald-500" : "stroke-rose-500"} />
    </svg>
  );
}

/** Plain-text value, used for copy, CSV export and editing. */
export function cellText(row: Row, col: Column): string {
  if (col.key === "trend") return "";
  if (col.key === "signup") return new Date(row.signup).toISOString().slice(0, 10);
  return String(row[col.key]);
}

export function Cell({ row, col }: { row: Row; col: Column }) {
  switch (col.key) {
    case "status":
      return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[row.status]}`}>{row.status}</span>;
    case "plan":
      return <span className="text-fg">{row.plan}</span>;
    case "country":
      return (
        <span title={regionName.of(row.country)}>
          <span aria-hidden="true">{flag(row.country)}</span> {row.country}
        </span>
      );
    case "mrr":
      return <span className="tabular-nums">{money.format(row.mrr)}</span>;
    case "seats":
    case "id":
      return <span className="tabular-nums">{int.format(row[col.key])}</span>;
    case "growth": {
      const g = row.growth;
      return <span className={`tabular-nums ${g > 0 ? "text-emerald-600 dark:text-emerald-400" : g < 0 ? "text-rose-600 dark:text-rose-400" : "text-muted"}`}>{g > 0 ? "▲" : g < 0 ? "▼" : ""} {Math.abs(g).toFixed(1)}%</span>;
    }
    case "trend":
      return <Sparkline row={row} />;
    case "signup":
      return <span className="tabular-nums text-muted">{date.format(row.signup)}</span>;
    case "email":
      return <span className="truncate text-muted">{row.email}</span>;
    default:
      return <span className="truncate">{row[col.key]}</span>;
  }
}
