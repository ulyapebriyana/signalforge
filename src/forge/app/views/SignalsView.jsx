import { useMemo, useState } from "react";
import { History, Loader2, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { formatPercent, formatUsd } from "../../../lib/format.js";
import { heatVars } from "../../lib/heat.js";
import { EmptyState, StatTile } from "../components/bits.jsx";

const FILTERS = [
  ["all", "Semua"],
  ["scanner", "Scanner"],
  ["auto", "Alert otomatis"],
  ["manual", "Alert manual"],
];

const stamp = (iso) =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

const deliveryLabel = (delivered) =>
  delivered === true ? "Terkirim" : delivered === false ? "Gagal" : "Terdeteksi";

export default function SignalsView({ history, loading, error, onRefresh, onClear, onOpenAddress }) {
  const [source, setSource] = useState("all");
  const [confirming, setConfirming] = useState(false);

  const rows = useMemo(
    () => (source === "all" ? history : history.filter((item) => item.source === source)),
    [history, source],
  );

  return (
    <div className="fx-view fx-signals">
      <header className="fx-view-head">
        <div>
          <h1>Riwayat sinyal</h1>
          <p>Setiap deteksi scanner dan setiap pengiriman Telegram, tersimpan di server.</p>
        </div>
        <div className="fx-view-head-tools">
          <button className="f-btn f-btn--ghost" type="button" onClick={onRefresh} disabled={loading}>
            {loading ? <Loader2 className="f-spin" /> : <RefreshCw />} Muat ulang
          </button>
          <button
            className="f-btn f-btn--danger"
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!history.length}
          >
            <Trash2 /> Hapus riwayat
          </button>
        </div>
      </header>

      {error ? (
        <div className="fx-banner fx-banner--error" role="alert">
          <TriangleAlert />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="fx-tiles">
        <StatTile label="Total catatan" value={history.length} />
        <StatTile label="Terkirim ke Telegram" value={history.filter((item) => item.delivered === true).length} />
        <StatTile label="Gagal kirim" value={history.filter((item) => item.delivered === false).length} tone="high" />
        <StatTile label="Deteksi scanner" value={history.filter((item) => item.source === "scanner").length} />
      </div>

      <div className="fx-scanner-bar">
        <div className="fx-tabs" role="tablist" aria-label="Sumber sinyal">
          {FILTERS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={source === id}
              className={source === id ? "is-active" : ""}
              onClick={() => setSource(id)}
            >
              {label}
              <span className="f-num">
                {id === "all" ? history.length : history.filter((item) => item.source === id).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="fx-table-frame fx-table-frame--compact">
        <table className="fx-table fx-table--history">
          <thead>
            <tr>
              <th scope="col">Waktu</th>
              <th scope="col">Pool</th>
              <th scope="col">Skor</th>
              <th scope="col">1 jam</th>
              <th scope="col">TVL</th>
              <th scope="col">Peristiwa</th>
              <th scope="col">Pengiriman</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id} style={heatVars(item.score)} onClick={() => onOpenAddress?.(item.address)}>
                <td className="f-num f-muted">{stamp(item.createdAt)}</td>
                <td>
                  <strong>{item.pair}</strong>
                </td>
                <td>
                  <span className="fx-history-score f-num">{item.score}</span>
                </td>
                <td className={`f-num ${item.priceChange1h >= 0 ? "f-pos" : "f-neg"}`}>
                  {formatPercent(item.priceChange1h)}
                </td>
                <td className="f-num">{formatUsd(item.tvl)}</td>
                <td>
                  {item.eventType === "status-entry"
                    ? `Masuk ${String(item.status).toUpperCase()}`
                    : item.source === "scanner"
                      ? "Terdeteksi scanner"
                      : item.source === "auto"
                        ? "Alert otomatis"
                        : "Alert manual"}
                </td>
                <td>
                  <span className={`fx-delivery fx-delivery--${item.delivered === true ? "sent" : item.delivered === false ? "failed" : "detected"}`}>
                    {deliveryLabel(item.delivered)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && rows.length === 0 ? (
        <EmptyState
          icon={History}
          title="Belum ada catatan"
          body="Scanner mencatat sinyal pertama begitu ada pool yang lolos gate preset server."
        />
      ) : null}

      {confirming ? (
        <div className="fx-sheet-backdrop" role="presentation" onMouseDown={() => setConfirming(false)}>
          <div
            className="fx-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="confirm-title">Hapus seluruh riwayat sinyal?</h2>
            <p>
              {history.length} catatan akan dihapus dari server dan tidak bisa dikembalikan. Cooldown
              deteksi juga ikut direset, jadi pool yang sudah pernah tercatat bisa muncul lagi.
            </p>
            <div className="fx-confirm-actions">
              <button className="f-btn" type="button" onClick={() => setConfirming(false)}>
                Batal
              </button>
              <button
                className="f-btn f-btn--danger"
                type="button"
                onClick={() => {
                  onClear();
                  setConfirming(false);
                }}
              >
                <Trash2 /> Hapus riwayat
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
