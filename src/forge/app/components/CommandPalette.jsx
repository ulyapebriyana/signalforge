import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { formatPercent, formatUsd } from "../../../lib/format.js";
import { heatVars } from "../../lib/heat.js";

/**
 * Cmd/Ctrl-K. Two kinds of result: commands (navigation, toggles) and pools from
 * the current scan. Pools win ties because that's what people are hunting for.
 */
export default function CommandPalette({ open, onClose, commands = [], pools = [], onSelectPool }) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(timer);
  }, [open]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matchedCommands = commands.filter(
      (command) => !needle || `${command.label} ${command.hint || ""}`.toLowerCase().includes(needle),
    );
    const matchedPools = (needle ? pools : pools.slice(0, 6))
      .filter((pool) => !needle || `${pool.pair} ${pool.name} ${pool.address}`.toLowerCase().includes(needle))
      .slice(0, 8);
    return [
      ...matchedPools.map((pool) => ({ kind: "pool", pool, id: `pool:${pool.address}` })),
      ...matchedCommands.map((command) => ({ kind: "command", command, id: `cmd:${command.id}` })),
    ];
  }, [commands, pools, query]);

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setCursor((current) => Math.min(results.length - 1, current + 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setCursor((current) => Math.max(0, current - 1));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const item = results[cursor];
        if (!item) return;
        if (item.kind === "pool") onSelectPool(item.pool);
        else item.command.run();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cursor, onClose, onSelectPool, open, results]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  return (
    <div className="fx-palette-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="fx-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Pencarian cepat"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="fx-palette-input">
          <Search />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari pool, atau ketik perintah…"
            aria-label="Cari pool atau perintah"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="fx-palette-list" ref={listRef}>
          {results.length === 0 ? (
            <p className="fx-palette-empty">Tidak ada yang cocok dengan “{query}”.</p>
          ) : null}
          {results.map((item, index) => {
            const active = index === cursor;
            if (item.kind === "pool") {
              return (
                <button
                  key={item.id}
                  type="button"
                  data-active={active}
                  className="fx-palette-row fx-palette-row--pool"
                  style={heatVars(item.pool.score)}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => {
                    onSelectPool(item.pool);
                    onClose();
                  }}
                >
                  <span className="fx-palette-heat" aria-hidden="true" />
                  <span className="fx-palette-pair">{item.pool.pair}</span>
                  <span className="f-num fx-palette-score">{item.pool.score}</span>
                  <span className={`f-num ${item.pool.priceChange1h >= 0 ? "f-pos" : "f-neg"}`}>
                    {formatPercent(item.pool.priceChange1h)}
                  </span>
                  <span className="f-num f-muted">{formatUsd(item.pool.tvl)}</span>
                </button>
              );
            }
            const Icon = item.command.icon;
            return (
              <button
                key={item.id}
                type="button"
                data-active={active}
                className="fx-palette-row"
                onMouseEnter={() => setCursor(index)}
                onClick={() => {
                  item.command.run();
                  onClose();
                }}
              >
                {Icon ? <Icon /> : <CornerDownLeft />}
                <span className="fx-palette-pair">{item.command.label}</span>
                {item.command.hint ? <span className="f-muted">{item.command.hint}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
