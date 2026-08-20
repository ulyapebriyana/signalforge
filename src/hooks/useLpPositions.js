import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "signalforge:lpWallet";

const readJson = async (response) => {
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Permintaan gagal");
  return payload;
};

/**
 * A wallet's LP positions, polled while the view is open.
 *
 * The address lives in localStorage rather than on the server so switching
 * wallets needs no redeploy — it is a public address, and the server validates
 * it before spending an RPC call on it either way. Background alerts still come
 * from LP_WALLETS in .env, because those have to keep running after the tab is
 * closed.
 */
export function useLpPositions(intervalSeconds = 30) {
  const [wallet, setWalletState] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef();
  const loadedWalletRef = useRef(null);

  const load = useCallback(
    async ({ force = false, signal, address = wallet } = {}) => {
      const target = address.trim();
      if (!target) {
        setPayload(null);
        setError("");
        return;
      }

      if (force) setRefreshing(true);
      // Only the first read of a given wallet blanks the view; a poll keeps the
      // previous positions on screen so the table does not flash on every tick.
      else if (loadedWalletRef.current !== target) setLoading(true);

      try {
        const query = new URLSearchParams({ wallet: target });
        if (force) query.set("force", "1");
        const result = await fetch(`/api/lp/positions?${query}`, { signal }).then(readJson);
        setPayload(result);
        setError("");
        loadedWalletRef.current = target;
      } catch (loadError) {
        if (loadError.name !== "AbortError") {
          setError(loadError.message || "Posisi gagal dimuat");
          // A wallet that failed must not stay marked as loaded, or switching
          // back to it would silently skip the loading state.
          if (loadedWalletRef.current !== target) setPayload(null);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [wallet],
  );

  useEffect(() => {
    if (!wallet.trim()) {
      setPayload(null);
      return undefined;
    }
    const controller = new AbortController();
    load({ signal: controller.signal });
    timerRef.current = window.setInterval(() => load(), intervalSeconds * 1_000);
    return () => {
      controller.abort();
      window.clearInterval(timerRef.current);
    };
  }, [load, intervalSeconds, wallet]);

  const setWallet = useCallback((next) => {
    const trimmed = String(next || "").trim();
    setWalletState(trimmed);
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    wallet,
    setWallet,
    positions: payload?.positions ?? [],
    totals: payload?.totals ?? null,
    readAt: payload?.readAt ?? null,
    loading,
    refreshing,
    error,
    refresh: () => load({ force: true }),
  };
}
