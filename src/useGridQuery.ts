import { useCallback, useEffect, useRef, useState } from "react";
import type { Row } from "./data";
import type { Query } from "./query";
import type { WorkerRequest, WorkerResponse } from "./worker";

type State = { order: Int32Array | null; ms: number; pending: boolean };

/** Runs filter + sort off the main thread and drops any result that a newer query has superseded. */
export function useGridQuery(query: Query) {
  const worker = useRef<Worker | null>(null);
  const latest = useRef(0);
  const [state, setState] = useState<State>({ order: null, ms: 0, pending: true });

  useEffect(() => {
    const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.id !== latest.current) return; // stale
      setState({ order: e.data.indexes, ms: e.data.ms, pending: false });
    };
    worker.current = w;
    return () => w.terminate();
  }, []);

  const post = (msg: WorkerRequest) => worker.current?.postMessage(msg);

  const run = useCallback(() => {
    const id = ++latest.current;
    setState((s) => ({ ...s, pending: true }));
    post({ type: "query", id, query });
  }, [query]);

  useEffect(run, [run]);

  const edit = useCallback(
    (index: number, patch: Partial<Row>) => {
      post({ type: "edit", index, patch });
      run();
    },
    [run],
  );

  return { ...state, edit };
}
