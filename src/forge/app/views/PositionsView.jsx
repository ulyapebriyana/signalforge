import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, LogOut, Plug, RefreshCw, TriangleAlert, Wallet } from "lucide-react";
import { RANGE_LABEL } from "../../../../shared/lpPositions.js";
import { formatPercent, formatUsdExact } from "../../../lib/format.js";
import { useWallet } from "../lib/wallet.jsx";
import { useZapOut } from "../../../hooks/useZapOut.js";
import { EmptyState, momentumTone, StatTile } from "../components/bits.jsx";
import ZapOutSheet from "../components/ZapOutSheet.jsx";

/** Range states in the order an LP cares about them, worst first. */
const STATE_TONE = {
  below: "danger",
  above: "danger",
  edge: "warning",
  inside: "healthy",
  unknown: "muted",
};

/**
 * Exact, never compacted — see `formatUsdExact`. This page shows the reader
 * their own money, where "$12K" hides a $470 difference.
 */
const money = formatUsdExact;

/**
 * How far the price can still move before this position stops earning.
 *
 * The range bar says *where* the price sits; this says *how much room is left*,
 * which is the number that decides whether to act now or leave it alone. An
 * out-of-range position reports how far past the edge it already is, so the
 * two states read on the same scale instead of one of them going blank.
 */
const edgeDistance = (position) => {
  const { activePrice: active, lowerPrice: lower, upperPrice: upper, rangeState, rangeProgress } = position;
  if (![active, lower, upper].every(Number.isFinite) || active <= 0) return null;

  if (rangeState === "below") return { out: true, pct: ((lower - active) / active) * 100, edge: "bawah" };
  if (rangeState === "above") return { out: true, pct: ((active - upper) / active) * 100, edge: "atas" };

  /*
   * Which edge is nearer comes from `rangeProgress`, not from comparing the two
   * price gaps. Both derive from the same bin ids, but progress is linear in
   * bin index while a price gap is linear in price, and DLMM bins are
   * geometric — so on a wide range the two can name different edges. Progress
   * is what the chip and the marker already use, and a row where the bar leans
   * right while the text says "ke bawah" reads as a bug whichever is correct.
   *
   * How *far* still comes from price, because that is the move a trader has to
   * picture: "price needs another 6% before this stops earning".
   */
  const nearerUpper = Number.isFinite(rangeProgress) ? rangeProgress >= 0.5 : upper - active <= active - lower;
  return nearerUpper
    ? { out: false, pct: ((upper - active) / active) * 100, edge: "atas" }
    : { out: false, pct: ((active - lower) / active) * 100, edge: "bawah" };
};

const percent = (value) => `${Math.abs(value) >= 10 ? Math.round(value) : value.toFixed(1)}%`;

/** Built once: this renders on every poll, and Intl formatters are not cheap. */
const readClock = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** Token amounts, not dollars — a memecoin balance needs the whole number. */
const amount = (value) =>
  value === null || value === undefined
    ? "—"
    : Number(value).toLocaleString("en-US", { maximumFractionDigits: 6 });

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
 *
 * The track carries a filled portion up to the marker as well as the marker
 * itself. A 3px tick on a flat bar was legible in isolation and vanished in a
 * row of five — the fill is what makes the position readable at a glance, and
 * the marker is what makes it precise.
 */
function RangeBar({ position }) {
  const progress = position.rangeProgress;
  const tone = STATE_TONE[position.rangeState] ?? "muted";
  const clamped = progress === null ? null : Math.max(0, Math.min(1, progress));

  return (
    <div className={`fx-range fx-range--${tone}`}>
      <div className="fx-range-track" aria-hidden="true">
        {clamped === null ? null : (
          <>
            <i className="fx-range-fill" style={{ width: `${clamped * 100}%` }} />
            <i className="fx-range-marker" style={{ left: `${clamped * 100}%` }} />
          </>
        )}
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
  pollSeconds = 30,
}) {
  const [draft, setDraft] = useState(wallet);
  const [zapPosition, setZapPosition] = useState(null);
  const walletApi = useWallet();

  const connected = walletApi.connected ? walletApi.address : null;

  /**
   * Connecting a wallet already says which address to watch, so typing it again
   * is pure duplication — the field fills itself the moment nothing is being
   * tracked yet.
   *
   * It only fills a *blank* field. Watching one wallet while signing with
   * another is a legitimate thing to be doing, and silently redirecting the
   * page to the wallet that just connected would change what the user is
   * looking at without being asked. That case gets an offer instead, below.
   */
  useEffect(() => {
    if (!connected || wallet) return;
    setDraft(connected);
    onWallet(connected);
  }, [connected, onWallet, wallet]);

  /**
   * A zap out interrupted in an earlier session.
   *
   * Closing the tab between the withdrawal and the swap leaves the funds safe
   * but in two tokens, and nothing on screen would otherwise say so — the
   * position is gone, so the table simply shows one row fewer. The server still
   * knows what was meant to be swapped, and only reports it while the wallet
   * really holds the token, so this never offers a swap that already happened.
   */
  const [pending, setPending] = useState([]);
  const reloadPending = useCallback(async () => {
    if (!wallet) return setPending([]);
    try {
      const response = await fetch(`/api/lp/zap-out/pending?wallet=${encodeURIComponent(wallet)}`);
      const payload = await response.json();
      setPending(response.ok ? payload.pending || [] : []);
    } catch {
      setPending([]);
    }
    return undefined;
  }, [wallet]);

  useEffect(() => {
    void reloadPending();
  }, [reloadPending, readAt]);

  const resume = useZapOut({
    wallet,
    signTransactions: walletApi.signTransactions,
    onDone: () => {
      onRefresh();
      void reloadPending();
    },
  });
  // Signing requires the connected wallet to *be* the wallet being watched.
  // Tracking someone else's address is a normal thing to do here, so this is a
  // real state rather than an edge case, and zap out has to stay disabled in it.
  const canSign = Boolean(connected && wallet && connected === wallet);

  return (
    <div className="fx-view fx-positions">
      <header className="fx-view-head">
        <div>
          <h1>Posisi LP</h1>
          <p>
            Dibaca langsung dari chain lewat alamat publik — tanpa tanda tangan, tanpa private key.
          </p>
        </div>
        <div className="fx-view-head-tools">
          {/* The read time belongs next to the control that changes it, not
              orphaned at the bottom of the page where it was before — "how old
              is this?" and "make it newer" are one question. */}
          {readAt ? (
            <span className="fx-read-stamp">
              Dibaca <b className="f-num">{readClock.format(new Date(readAt))}</b>
              <span className="fx-read-stamp-sep">·</span>
              tiap {pollSeconds}s
            </span>
          ) : null}
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

      {/* One panel, not two. The address field and the wallet connection are
          the same question — "whose positions am I looking at, and can I act on
          them?" — and as separate bordered boxes stacked flush they rendered as
          one panel with a stray double border through the middle. */}
      <div className="fx-wallet-panel">
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

      {/* Always shown, including before any address is set — connecting is now
          the shortest way to start, and gating this on a filled field made that
          route unreachable for a first-time visitor. */}
      <div className="fx-connect-bar fx-connect-bar--joined">
        {connected ? (
            <>
              <span className={`f-chip f-chip--${canSign ? "clear" : "warning"}`}>
                <Plug /> {walletApi.walletName || "Wallet"} · {connected.slice(0, 4)}…{connected.slice(-4)}
              </span>
              {canSign ? (
                <span className="fx-connect-note">Zap out aktif untuk wallet ini.</span>
              ) : (
                <>
                  <span className="fx-connect-note fx-connect-note--warn">
                    Sedang memantau wallet lain, jadi zap out dimatikan.
                  </span>
                  {/* Offered rather than done automatically: switching this
                      changes which positions are on screen, which is the
                      user's call to make, not a side effect of connecting. */}
                  <button
                    className="f-btn"
                    type="button"
                    onClick={() => {
                      setDraft(connected);
                      onWallet(connected);
                    }}
                  >
                    <Wallet /> Pantau wallet ini
                  </button>
                </>
              )}
              <button className="f-btn f-btn--ghost" type="button" onClick={() => walletApi.disconnect()}>
                <LogOut /> Putuskan
              </button>
            </>
          ) : (
            <>
              <span className="fx-connect-note">
                Sambungkan wallet untuk menutup posisi dari sini. Membaca posisi tidak memerlukannya.
              </span>
              {walletApi.available.length ? (
                walletApi.available.map((entry) => (
                  <button
                    key={entry.name}
                    className="f-btn"
                    type="button"
                    disabled={walletApi.connecting}
                    onClick={async () => {
                      try {
                        await walletApi.connect(entry);
                      } catch {
                        // Declining the prompt is a normal outcome, not an error.
                      }
                    }}
                  >
                    <Plug /> {entry.name}
                  </button>
                ))
              ) : (
                <span className="fx-connect-note fx-connect-note--warn">
                  Tidak ada wallet Solana terdeteksi di browser ini.
              </span>
            )}
          </>
        )}
      </div>
      </div>

      {error ? (
        <div className="fx-banner fx-banner--error" role="alert">
          <TriangleAlert />
          <span>{error}</span>
        </div>
      ) : null}

      {pending.map((item) => (
        <div className="fx-banner fx-banner--warn" role="status" key={item.positionKey}>
          <TriangleAlert />
          <span>
            Zap out <b>{item.pair}</b> belum selesai — {amount(item.amount)} {item.sourceSymbol} masih
            menunggu ditukar ke {item.targetSymbol}. Likuiditasnya sudah aman di wallet Anda.
          </span>
          <button
            className="f-btn"
            type="button"
            disabled={!canSign || resume.phase !== "idle"}
            title={canSign ? undefined : "Sambungkan wallet yang dipantau untuk melanjutkan"}
            onClick={() => resume.resumeSwap({ positionKey: item.positionKey })}
          >
            {resume.phase === "idle" ? "Lanjutkan swap" : "Memproses…"}
          </button>
        </div>
      ))}

      {resume.error ? (
        <div className="fx-banner fx-banner--error" role="alert">
          <TriangleAlert />
          <span>{resume.error}</span>
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
            label="PnL"
            value={money(totals.pnlUsd)}
            tone={totals.pnlUsd > 0 ? "low" : totals.pnlUsd < 0 ? "high" : undefined}
            sub="dari Meteora, termasuk deposit & fee"
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
            {/* See `.fx-col-w-*`: fixed layout reads its geometry from the
                first row, so widths have to be declared here, not on the
                tbody cells. */}
            <colgroup>
              <col className="fx-col-w-pair" />
              <col className="fx-col-w-status" />
              <col className="fx-col-w-range" />
              <col className="fx-col-w-price" />
              <col className="fx-col-w-value" />
              <col className="fx-col-w-value" />
              <col className="fx-col-w-fees" />
              <col className="fx-col-w-ratio" />
              <col className="fx-col-w-actions" />
            </colgroup>
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
                <th scope="col"><span>PnL</span></th>
                <th scope="col"><span>Fee belum klaim</span></th>
                <th scope="col"><span>Fee/TVL 1j</span></th>
                <th scope="col"><span className="f-visually-hidden">Tindakan</span></th>
              </tr>
            </thead>
            <tbody>
              {positions.map((position) => (
                <tr key={position.positionKey} className={position.earning ? "" : "is-idle"}>
                  <td className="fx-col-lp fx-pair-cell">
                    <strong>{position.pair || "—"}</strong>
                    {position.binStep ? <small className="f-muted">bin {position.binStep}</small> : null}
                  </td>
                  {/* State and distance live together: "keluar bawah" and
                      "how far out" are one answer, and splitting them left the
                      range column trying to fit three things into one line. */}
                  <td className="fx-col-lp fx-status-cell">
                    <span className={`f-chip f-chip--${STATE_TONE[position.rangeState] === "healthy" ? "clear" : STATE_TONE[position.rangeState]}`}>
                      {RANGE_LABEL[position.rangeState]}
                    </span>
                    {(() => {
                      const distance = edgeDistance(position);
                      if (!distance) return null;
                      return (
                        <small className={`fx-edge-gap fx-edge-gap--${STATE_TONE[position.rangeState] ?? "muted"}`}>
                          {distance.out
                            ? `${percent(distance.pct)} lewat ${distance.edge}`
                            : `${percent(distance.pct)} ke ${distance.edge}`}
                        </small>
                      );
                    })()}
                  </td>
                  <td className="fx-col-lp fx-range-cell">
                    <RangeBar position={position} />
                  </td>
                  <td className="f-num">{price(position.activePrice)}</td>
                  <td className="f-num">{money(position.valueUsd)}</td>
                  <td className="f-num">
                    {Number.isFinite(position.pnlPct) ? (
                      <span className="fx-cell-stack">
                        <span className={`f-num ${momentumTone(position.pnlPct)}`}>
                          {formatPercent(position.pnlPct)}
                        </span>
                        <small className="f-num">{money(position.pnlUsd)}</small>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="f-num">{money(position.unclaimedFeesUsd)}</td>
                  <td className="f-num">
                    {Number.isFinite(position.poolFeeTvl1h) ? `${position.poolFeeTvl1h.toFixed(2)}%` : "—"}
                  </td>
                  <td>
                    <div className="fx-row-actions">
                      <button
                        className="f-btn f-btn--ghost fx-zap-btn"
                        type="button"
                        disabled={!canSign}
                        onClick={() => setZapPosition(position)}
                        title={
                          canSign
                            ? `Tutup posisi ${position.pair} dan tukar ke satu token`
                            : "Sambungkan wallet yang dipantau untuk mengaktifkan"
                        }
                      >
                        Zap out
                      </button>
                      <a
                        className="f-icon-btn"
                        href={`https://www.meteora.ag/dlmm/${position.poolAddress}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Buka ${position.pair || "pool"} di Meteora`}
                      >
                        <ExternalLink />
                      </a>
                    </div>
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
          body="Sambungkan wallet Anda, atau tempel alamat Solana mana pun di atas untuk memantaunya tanpa menyambung. Cukup alamat publik — bukan seed phrase, bukan private key."
        />
      ) : null}

      {zapPosition ? (
        <ZapOutSheet
          position={zapPosition}
          wallet={wallet}
          walletApi={walletApi}
          onClose={() => setZapPosition(null)}
          onDone={onRefresh}
        />
      ) : null}

    </div>
  );
}
