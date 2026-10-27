export type Status = "Active" | "Trial" | "Paused" | "Churned";
export type Plan = "Free" | "Starter" | "Growth" | "Enterprise";

export const STATUSES: Status[] = ["Active", "Trial", "Paused", "Churned"];
export const PLANS: Plan[] = ["Free", "Starter", "Growth", "Enterprise"];
export const ROW_COUNT = 100_000;

export type Row = {
  id: number;
  name: string;
  company: string;
  email: string;
  country: string; // ISO 3166 alpha-2
  plan: Plan;
  status: Status;
  mrr: number;
  seats: number;
  growth: number; // % month over month
  signup: number; // epoch ms, midnight UTC
};

export type ColumnKey = keyof Row | "trend";
export type SortKey = Exclude<ColumnKey, "trend">;

export type Column = {
  key: ColumnKey;
  label: string;
  width: number;
  kind: "text" | "number" | "date" | "enum" | "chart";
  editable?: boolean;
};

export const COLUMNS: Column[] = [
  { key: "name", label: "Customer", width: 200, kind: "text", editable: true },
  { key: "company", label: "Company", width: 190, kind: "text", editable: true },
  { key: "email", label: "Email", width: 280, kind: "text" },
  { key: "country", label: "Country", width: 110, kind: "enum" },
  { key: "plan", label: "Plan", width: 120, kind: "enum" },
  { key: "status", label: "Status", width: 120, kind: "enum" },
  { key: "mrr", label: "MRR", width: 120, kind: "number", editable: true },
  { key: "seats", label: "Seats", width: 96, kind: "number", editable: true },
  { key: "growth", label: "Growth", width: 110, kind: "number" },
  { key: "trend", label: "16-week trend", width: 140, kind: "chart" },
  { key: "signup", label: "Signed up", width: 130, kind: "date" },
  { key: "id", label: "ID", width: 96, kind: "number" },
];

/** Small, fast, seedable PRNG so the main thread and the worker generate identical data. */
export function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Aarav", "Ananya", "Kabir", "Isha", "Rohan", "Meera", "Vivaan", "Diya", "Arjun", "Saanvi", "Liam", "Olivia", "Noah", "Emma", "Lucas", "Mia", "Hiro", "Yuki", "Mateo", "Sofia", "Leon", "Hannah", "Omar", "Layla", "Ethan", "Zara", "Kenji", "Amara", "Felix", "Nora"];
const LAST = ["Sharma", "Verma", "Iyer", "Kapoor", "Reddy", "Mehta", "Nair", "Gupta", "Bose", "Malhotra", "Smith", "Johnson", "Garcia", "Müller", "Martin", "Silva", "Tanaka", "Sato", "Rossi", "Kim", "Nguyen", "Okafor", "Haddad", "Novak", "Larsen", "Costa", "Dubois", "Schmidt", "Ali", "Chen"];
const CO_A = ["Blue", "North", "Bright", "Quantum", "Pixel", "Cedar", "Atlas", "Nimbus", "Lumen", "Vertex", "Copper", "Orbit", "Signal", "Harbor", "Prism"];
const CO_B = ["Labs", "Systems", "Works", "Analytics", "Cloud", "Health", "Logistics", "Studio", "Finance", "Robotics", "Foods", "Mobility"];
const COUNTRIES = ["IN", "US", "GB", "DE", "FR", "BR", "JP", "SG", "AU", "CA", "NL", "SE", "AE", "ES", "KE"];
const SEAT_PRICE: Record<Plan, number> = { Free: 0, Starter: 12, Growth: 29, Enterprise: 49 };

export function generateRows(count = ROW_COUNT, seed = 42): Row[] {
  const rnd = mulberry32(seed);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rnd() * list.length)];
  const between = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const start = Date.UTC(2019, 0, 1);
  const days = Math.floor((Date.UTC(2026, 9, 1) - start) / 86_400_000);

  const rows: Row[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const company = `${pick(CO_A)} ${pick(CO_B)}`;

    const p = rnd();
    const plan: Plan = p < 0.35 ? "Free" : p < 0.7 ? "Starter" : p < 0.92 ? "Growth" : "Enterprise";
    const seats = plan === "Free" ? between(1, 3) : plan === "Starter" ? between(2, 15) : plan === "Growth" ? between(10, 120) : between(50, 2000);

    const s = rnd();
    const status: Status = s < 0.68 ? "Active" : s < 0.8 ? "Trial" : s < 0.88 ? "Paused" : "Churned";
    const mrr = status === "Churned" ? 0 : Math.round(seats * SEAT_PRICE[plan] * (0.8 + rnd() * 0.4));
    const growth = status === "Churned" ? -100 : Math.round((rnd() * 2 - 0.7) * 400) / 10;

    rows[i] = {
      id: i + 1,
      name: `${first} ${last}`,
      company,
      email: `${first}.${last}${i % 97}@${company.replace(" ", "").toLowerCase()}.com`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""),
      country: pick(COUNTRIES),
      plan,
      status,
      mrr,
      seats,
      growth,
      signup: start + between(0, days) * 86_400_000,
    };
  }
  return rows;
}

/** Derived from the row id so it costs nothing to store — only computed for rows on screen. */
export function trendFor(row: Row): number[] {
  const rnd = mulberry32(row.id * 7919 + 1);
  const out: number[] = [];
  let v = 50;
  for (let i = 0; i < 16; i++) {
    v += (rnd() - 0.5) * 14 + row.growth / 25;
    out.push(v);
  }
  return out;
}
