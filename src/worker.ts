/// <reference lib="webworker" />
import { generateRows, type Row } from "./data";
import { buildSearchIndex, runQuery, searchText, type Query } from "./query";

export type WorkerRequest =
  | { type: "query"; id: number; query: Query }
  | { type: "edit"; index: number; patch: Partial<Row> };

export type WorkerResponse = { type: "result"; id: number; indexes: Int32Array; ms: number };

// Same seed as the main thread, so both sides hold identical data without a 100k-row postMessage.
const rows = generateRows();
const haystack = buildSearchIndex(rows);

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === "edit") {
    Object.assign(rows[msg.index], msg.patch);
    haystack[msg.index] = searchText(rows[msg.index]);
    return;
  }
  const t0 = performance.now();
  const indexes = runQuery(rows, haystack, msg.query);
  const res: WorkerResponse = { type: "result", id: msg.id, indexes, ms: performance.now() - t0 };
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(res, [indexes.buffer]);
};
