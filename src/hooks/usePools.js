import { useCallback, useEffect, useRef, useState } from "react";

const readJson = async (response) => {
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Permintaan gagal");
  return payload;
};

export function usePools(scanIntervalSeconds = 30) {
  const [payload, setPayload] = useState({ data: [], meta: null });
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef();
  const hasLoadedRef = useRef(false);

  const load = useCallback(async ({ force = false, signal } = {}) => {
    if (force) setRefreshing(true);
    else if (!hasLoadedRef.current) setLoading(true);
    try {
      const [pools, runtimeStatus] = await Promise.all([
        fetch(`/api/pools${force ? "?force=1" : ""}`, { signal }).then(readJson),
        fetch("/api/status", { signal }).then(readJson),
      ]);
      setPayload(pools);
      setStatus(runtimeStatus);
      setError("");
      hasLoadedRef.current = true;
    } catch (loadError) {
      if (loadError.name !== "AbortError") setError(loadError.message || "Data gagal dimuat");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load({ signal: controller.signal });
    timerRef.current = window.setInterval(() => load(), scanIntervalSeconds * 1_000);
    return () => {
      controller.abort();
      window.clearInterval(timerRef.current);
    };
  }, [load, scanIntervalSeconds]);

  return {
    pools: payload.data,
    meta: payload.meta,
    status,
    loading,
    refreshing,
    error,
    refresh: () => load({ force: true }),
  };
}
