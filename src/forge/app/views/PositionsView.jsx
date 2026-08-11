import { useState } from "react";
import { ExternalLink, Loader2, RefreshCw, TriangleAlert, Wallet } from "lucide-react";
import { RANGE_LABEL } from "../../../../shared/lpPositions.js";
import { formatUsd } from "../../../lib/format.js";
import { EmptyState, StatTile } from "../components/bits.jsx";

/** Range states in the order an LP cares about them, worst first. */
const STATE_TONE = {
  below: "danger",
  above: "danger",
  edge: "warning",
  inside: "healthy",
  unknown: "muted",
};

const money = (value) => (value === null || value === undefined ? "—" : formatUsd(value));

/**
 * Prices here run from SOL-USDC to six-decimal memecoins, so a fixed number of
 * decimals would print either noise or nothing. Significant digits fit both.
 */
const price = (value) => {
  if (value === null || value === undefined) return "—";
  const magnitude = Math.abs(value);
  if (magnitude === 0) return "0";
  if (magnitude >= 1_000) return Math.round(value).toLocaleString("en-US");
  return Number(value.toPrecision(magnitude >= 1 ? 5 : 3)).toString();
};

/**
 * The range as a strip, with the active price marked on it.
 *
 * This is the one thing a table of numbers cannot say quickly: how much room is
 * left before the position stops earning. An out-of-range position pins its
 * marker to the edge it left through, so the direction stays visible.
 */
function RangeBar({ position }) {
  const progress = position.rangeProgress;
  const tone = STATE_TONE[position.rangeState] ?? "muted";
  const clamped = progress === null ? null : Math.max(0, Math.min(1, progress));

  return (
    <div className={`fx-range fx-range--${tone}`}>
      <div className="fx-range-track" aria-hidden="true">
        {clamped === null ? null : <i className="fx-range-marker" style={{ left: `${clamped * 100}%` }} />}
      </div>
      <div className="fx-range-scale">
        <span className="f-num">{price(position.lowerPrice)}</span>
        <span className="f-num">{price(position.upperPrice)}</span>
      </div>
    </div>
  );
}

export default function PositionsView({
  wallet,
  onWallet,
  positions,
  totals,
  readAt,
  loading,
  refreshing,
  error,
  onRefresh,
  configured,
}) {
  const [draft, setDraft] = useState(wallet);

  return (
    <div className="fx-view fx-positions">
      <header className="fx-view-head">
        <div>
          <h1>Posisi LP</h1>
          <p>
            Dibaca langsung dari chain memakai alamat publik. Tidak ada tanda tangan, tidak ada
            private key — scanner mencari entry, halaman ini menjaga posisi yang sudah jalan.
          </p>
        </div>
        <div className="fx-view-head-tools">
          <button
            className="f-btn f-btn--ghost"
            type="button"
            onClick={onRefresh}
            disabled={!wallet || refreshing}
          >
            {refreshing ? <Loader2 className="f-spin" /> : <RefreshCw />} Muat ulang
          </button>
        </div>
      </header>

      {!configured ? (
        <div className="fx-banner fx-banner--error" role="alert">
          <TriangleAlert />
          <span>
            <code>SOLANA_RPC_URL</code> belum diisi di file <code>.env</code>. Posisi dibaca lewat RPC
            Solana, jadi tanpa itu halaman ini tidak bisa membaca apa pun.
          </span>
        </div>
      ) : null}

      <form
        className="fx-wallet-form"
        onSubmit={(event) => {
          event.preventDefault();
          onWallet(draft);
        }}
      >
        <label htmlFor="lp-wallet">Alamat wallet</label>
        <div className="fx-wallet-row">
          <input
            id="lp-wallet"
            type="text"
            spellCheck="false"
            autoComplete="off"
            placeholder="Tempel alamat wallet Solana"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button className="f-btn" type="submit" disabled={draft.trim() === wallet}>
            <Wallet /> Pantau
          </button>
          {wallet ? (
            <button
              className="f-btn f-btn--ghost"
              type="button"
              onClick={() => {
                setDraft("");
                onWallet("");
              }}
            >
              Lupakan
            </button>
          ) : null}
        </div>
        <small>
          Alamat disimpan di browser ini saja. Alert keluar-range yang berjalan di server memakai
          daftar <code>LP_WALLETS</code> di <code>.env</code>.
        </small>
      </form>

      {error ? (
        <div className="fx-banner fx-banner--error" role="alert">
          <TriangleAlert />
          <span>{error}</span>
        </div>
      ) : null}

      {totals ? (
        <div className="fx-tiles">
          <StatTile
            label="Nilai posisi"
            value={money(totals.valueUsd)}
            sub={
              totals.pricedCount < totals.positionCount
                ? `${totals.positionCount - totals.pricedCount} posisi belum bisa dihargai`
                : undefined
            }
          />
          <StatTile
            label="Masih dapat fee"
            value={`${totals.earningCount}/${totals.positionCount}`}
            tone={totals.outOfRangeCount > 0 ? "high" : undefined}
            sub={totals.outOfRangeCount ? `${totals.outOfRangeCount} keluar range` : "semua dalam range"}
          />
          <StatTile label="Fee belum diklaim" value={money(totals.unclaimedFeesUsd)} />
          <StatTile label="Total fee didapat" value={money(totals.totalFeesUsd)} sub="klaim + belum klaim" />
        </div>
      ) : null}

      {loading ? (
        <p className="fx-notify-empty">
          <Loader2 className="f-spin" /> Membaca posisi dari chain…
        </p>
      ) : null}

      {positions.length ? (
        <div className="fx-table-frame fx-table-frame--compact">
          <table className="fx-table fx-table--positions">
            <thead>
              {/*
                Header labels sit in a <span> because .fx-table thead th carries
                no padding of its own — every other table in the app puts the
                label in a span or a button, and bare text collides with the
                next column.
              */}
              <tr>
                <th className="fx-col-lp" scope="col"><span>Pool</span></th>
                <th className="fx-col-lp" scope="col"><span>Status</span></th>
                <th className="fx-col-lp" scope="col"><span>Range</span></th>
                <th scope="col"><span>Harga aktif</span></th>
                <th scope="col"><span>Nilai</span></th>
                <th scope="col"><span>Fee belum klaim</span></th>
                <th scope="col"><span>Fee/TVL 1j</span></th>
                <th scope="col"><span className="f-visually-hidden">Tautan</span></th>
              </tr>
            </thead>
            <tbody>
              {positions.map((position) => (
                <tr key={position.positionKey} className={position.earning ? "" : "is-idle"}>
                  <td className="fx-col-lp">
                    <strong>{position.pair || "—"}</strong>
                    {position.binStep ? <small className="f-muted"> · bin {position.binStep}</small> : null}
                  </td>
                  <td className="fx-col-lp">
                    <span className={`f-chip f-chip--${STATE_TONE[position.rangeState] === "healthy" ? "clear" : STATE_TONE[position.rangeState]}`}>
                      {RANGE_LABEL[position.rangeState]}
                    </span>
                  </td>
                  <td className="fx-col-lp fx-range-cell">
                    <RangeBar position={position} />
                  </td>
                  <td className="f-num">{price(position.activePrice)}</td>
                  <td className="f-num">{money(position.valueUsd)}</td>
                  <td className="f-num">{money(position.unclaimedFeesUsd)}</td>
                  <td className="f-num">
                    {Number.isFinite(position.poolFeeTvl1h) ? `${position.poolFeeTvl1h.toFixed(2)}%` : "—"}
                  </td>
                  <td>
                    <a
                      className="f-icon-btn"
                      href={`https://www.meteora.ag/dlmm/${position.poolAddress}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Buka ${position.pair || "pool"} di Meteora`}
                    >
                      <ExternalLink />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && wallet && !positions.length && !error ? (
        <EmptyState
          icon={Wallet}
          title="Tidak ada posisi terbuka"
          body="Wallet ini tidak sedang memegang posisi DLMM. Halaman akan terisi sendiri begitu ada posisi dibuka."
        />
      ) : null}

      {!wallet ? (
        <EmptyState
          icon={Wallet}
          title="Belum ada wallet dipantau"
          body="Tempel alamat wallet Solana di atas. Cukup alamat publik — bukan seed phrase, bukan private key."
        />
      ) : null}

      {readAt ? (
        <p className="fx-foot-note">
          Dibaca {new Intl.DateTimeFormat("id-ID", {
            timeZone: "Asia/Jakarta",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          }).format(new Date(readAt))} WIB
        </p>
      ) : null}
    </div>
  );
}
