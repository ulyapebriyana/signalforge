import { useCallback, useEffect, useState } from "react";

const readJson = async (response) => {
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Riwayat sinyal gagal dimuat");
  return payload;
};

export function useSignalHistory(refreshIntervalSeconds = 30) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const payload = await fetch("/api/history").then(readJson);
      setHistory(Array.isArray(payload.data) ? payload.data : []);
      setError("");
    } catch (refreshError) {
      setError(refreshError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(async () => {
    await fetch("/api/history", { method: "DELETE" }).then(readJson);
    setHistory([]);
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, refreshIntervalSeconds * 1_000);
    return () => window.clearInterval(timer);
  }, [refresh, refreshIntervalSeconds]);

  return { history, loading, error, refresh, clear };
}
