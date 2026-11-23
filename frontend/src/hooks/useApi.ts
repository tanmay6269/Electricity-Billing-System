import { useCallback, useEffect, useRef, useState } from "react";
import { api, clean, errorMessage } from "@/services/api";

/** Fetch data from an API endpoint, re-fetching whenever url or params change. */
export function useApi<T>(url: string | null, params?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!!url);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(params ?? {});
  const reqId = useRef(0);

  const load = useCallback(async () => {
    if (!url) return;
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<T>(url, { params: clean(JSON.parse(key)) });
      if (id === reqId.current) setData(res.data);
    } catch (e) {
      if (id === reqId.current) setError(errorMessage(e));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [url, key]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load, setData };
}

export function useDebounce<T>(value: T, delay = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** Table state: page, size, sort, plus arbitrary filters. Resets to page 1 when filters change. */
export function useTableState<F extends Record<string, string>>(initialFilters: F, initialSort?: { by: string; dir: "asc" | "desc" }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState(initialSort ?? { by: "", dir: "desc" as "asc" | "desc" });
  const [filters, setFilters] = useState<F>(initialFilters);

  const setFilter = (k: keyof F, v: string) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };
  const toggleSort = (by: string) => {
    setSort((s) => (s.by === by ? { by, dir: s.dir === "asc" ? "desc" : "asc" } : { by, dir: "asc" }));
  };
  const reset = () => {
    setFilters(initialFilters);
    setPage(1);
  };
  return { page, setPage, pageSize, setPageSize: (n: number) => { setPageSize(n); setPage(1); }, sort, toggleSort, filters, setFilter, reset };
}
