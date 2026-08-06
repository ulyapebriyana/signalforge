import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "signalforge:watchlist";
const CHANGE_EVENT = "signalforge:watchlist-change";

const read = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
};

/**
 * Pools the trader has pinned by hand. Kept in localStorage so it survives a
 * reload without the server having to know about it.
 */
export function useWatchlist() {
  const [addresses, setAddresses] = useState(read);

  useEffect(() => {
    const sync = () => setAddresses(read());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = useCallback((address) => {
    const next = read();
    const index = next.indexOf(address);
    if (index === -1) next.unshift(address);
    else next.splice(index, 1);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, 100)));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return index === -1;
  }, []);

  const clear = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "[]");
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return {
    addresses,
    has: useCallback((address) => addresses.includes(address), [addresses]),
    toggle,
    clear,
  };
}
