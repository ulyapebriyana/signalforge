import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "signalforge:theme";
const THEMES = ["dark", "light", "auto"];

const systemTheme = () =>
  window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";

const applyTheme = (choice) => {
  const resolved = choice === "auto" ? systemTheme() : choice;
  document.documentElement.dataset.theme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", resolved === "light" ? "#e6ebf2" : "#0b0f14");
  return resolved;
};

export function useTheme() {
  const [choice, setChoice] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(saved) ? saved : "dark";
  });
  const [resolved, setResolved] = useState(() => (choice === "auto" ? systemTheme() : choice));

  useEffect(() => {
    setResolved(applyTheme(choice));
    localStorage.setItem(STORAGE_KEY, choice);
    if (choice !== "auto") return undefined;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const sync = () => setResolved(applyTheme("auto"));
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [choice]);

  const cycle = useCallback(
    () => setChoice((current) => THEMES[(THEMES.indexOf(current) + 1) % THEMES.length]),
    [],
  );

  return { theme: choice, resolved, setTheme: setChoice, cycleTheme: cycle };
}
