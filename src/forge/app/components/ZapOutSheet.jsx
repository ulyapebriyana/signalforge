import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, TriangleAlert, Wallet, X } from "lucide-react";
import { SLIPPAGE_PRESETS, shortfallPct } from "../../../../shared/zapOut.js";
import { useZapOut } from "../../../hooks/useZapOut.js";

const amount = (value, digits = 6) =>
  value === null || value === undefined ? "—" : Number(value).toLocaleString("en-US", { maximumFractionDigits: digits });

const PHASE_LABEL = {
  preparing: "Menyusun transaksi penarikan…",
  signing: "Menunggu tanda tangan di wallet…",
  withdrawing: "Mengirim penarikan ke chain…",
  "swap-preparing": "Menyusun rute swap…",
  "swap-signing": "Menunggu tanda tangan swap…",
  swapping: "Mengirim swap ke chain…",
};

const BUSY = new Set(Object.keys(PHASE_LABEL));

export default function ZapOutSheet({ position, wallet, walletApi, onClose, onDone }) {
  const [targetMint, setTargetMint] = useState(position.mintY);
  const [slippageBps, setSlippageBps] = useState(100);
  const [plan, setPlan] = useState(null);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState("");

  const zap = useZapOut({ wallet, signTransactions: walletApi.signTransactions, onDone });

  const targetSymbol = targetMint === position.mintY ? position.symbolY : position.symbolX;

  const loadPlan = useCallback(async () => {
    setPlanning(true);
    setPlanError("");
    try {
      const response = await fetch("/api/lp/zap-out/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet, positionKey: position.positionKey, targetMint, slippageBps }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Rencana gagal disusun");
      setPlan(payload);
      if (!payload.ok) setPlanError(payload.message || "Zap out tidak bisa dijalankan untuk posisi ini.");
    } catch (error) {
      setPlan(null);
      setPlanError(error.message);
    } finally {
      setPlanning(false);
    }
  }, [position.positionKey, slippageBps, targetMint, wallet]);

  // The plan is re-priced whenever the two things that change it change. It is
  // read-only and reserves nothing, so refreshing it costs the user nothing.
  useEffect(() => {
    if (zap.phase === "idle") void loadPlan();
  }, [loadPlan, zap.phase]);

  const busy = BUSY.has(zap.phase);
  const finished = zap.phase === "done";
  const shortfall = shortfallPct(plan);

  return (
    <div className="fx-sheet-backdrop" role="presentation" onMouseDown={busy ? undefined : onClose}>
      <div
        className="fx-confirm fx-zap"
        role="dialog"
        aria-modal="true"
        aria-labelledby="zap-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="fx-zap-head">
          <h2 id="zap-title">Zap out · {position.pair}</h2>
          <button className="f-icon-btn" type="button" onClick={onClose} disabled={busy} aria-label="Tutup">
            <X />
          </button>
        </header>

        {finished ? (
          <div className="fx-zap-result fx-zap-result--done">
            <CheckCircle2 />
            <div>
              <strong>Posisi selesai ditutup.</strong>
              <p>Likuiditas ditarik, fee diklaim, dan sisa token ditukar ke {targetSymbol}.</p>
            </div>
          </div>
        ) : null}

        {zap.phase === "partial" ? (
          <div className="fx-zap-result fx-zap-result--partial">
            <TriangleAlert />
            <div>
              <strong>Sebagian sudah dieksekusi.</strong>
              <p>
                {zap.signatures.length} transaksi berhasil sebelum sisanya gagal, jadi sebagian dana
                sudah berpindah. Periksa posisi dan saldo dulu — <b>jangan langsung ulangi</b>, karena
                menjalankan lagi bisa menarik atau menukar dua kali.
              </p>
              <p className="fx-zap-error">{zap.error}</p>
            </div>
          </div>
        ) : null}

        {zap.phase === "failed" ? (
          <div className="fx-zap-result fx-zap-result--failed">
            <TriangleAlert />
            <div>
              <strong>Tidak ada yang dieksekusi.</strong>
              <p>Tidak ada dana yang berpindah, jadi aman untuk mencoba lagi.</p>
              <p className="fx-zap-error">{zap.error}</p>
            </div>
          </div>
        ) : null}

        {!finished && zap.phase !== "partial" ? (
          <>
            <div className="fx-zap-field">
              <span className="fx-zap-label">Keluar sebagai</span>
              <div className="fx-zap-choices">
                {[
                  { mint: position.mintY, symbol: position.symbolY },
                  { mint: position.mintX, symbol: position.symbolX },
                ].map((token) => (
                  <button
                    key={token.mint}
                    type="button"
                    className={targetMint === token.mint ? "is-active" : ""}
                    onClick={() => setTargetMint(token.mint)}
                    disabled={busy}
                  >
                    {token.symbol}
                  </button>
                ))}
              </div>
            </div>

            <div className="fx-zap-field">
              <span className="fx-zap-label">Slippage</span>
              <div className="fx-zap-choices">
                {SLIPPAGE_PRESETS.map((bps) => (
                  <button
                    key={bps}
                    type="button"
                    className={slippageBps === bps ? "is-active" : ""}
                    onClick={() => setSlippageBps(bps)}
                    disabled={busy}
                  >
                    {(bps / 100).toFixed(bps % 100 ? 2 : 0)}%
                  </button>
                ))}
              </div>
            </div>

            {planning ? (
              <p className="fx-zap-status">
                <Loader2 className="f-spin" /> Menghitung rute…
              </p>
            ) : null}

            {planError ? (
              <div className="fx-banner fx-banner--error" role="alert">
                <TriangleAlert />
                <span>{planError}</span>
              </div>
            ) : null}

            {plan?.ok ? (
              <>
                <dl className="fx-zap-plan">
                  <div>
                    <dt>Ditarik</dt>
                    <dd className="f-num">
                      {amount(plan.withdrawSource)} {plan.sourceSymbol} + {amount(plan.withdrawTarget)}{" "}
                      {plan.targetSymbol}
                    </dd>
                  </div>
                  {plan.needsSwap ? (
                    <div>
                      <dt>Ditukar</dt>
                      <dd className="f-num">
                        {amount(plan.withdrawSource)} {plan.sourceSymbol} → ~{amount(plan.estimatedSwapOut)}{" "}
                        {plan.targetSymbol}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Estimasi diterima</dt>
                    <dd className="f-num">
                      ~{amount(plan.estimatedTotal)} {plan.targetSymbol}
                    </dd>
                  </div>
                  {/* The floor is the only figure with a guarantee behind it, so
                      it is the one set in bold — the estimate above it can move. */}
                  <div className="fx-zap-plan-floor">
                    <dt>Minimum dijamin</dt>
                    <dd className="f-num">
                      {amount(plan.minimumTotal)} {plan.targetSymbol}
                      {shortfall !== null ? <em> · sampai {shortfall.toFixed(2)}% di bawah estimasi</em> : null}
                    </dd>
                  </div>
                  <div>
                    <dt>Price impact</dt>
                    <dd className="f-num">{plan.priceImpactPct?.toFixed(3) ?? "—"}%</dd>
                  </div>
                </dl>

                {plan.warnings?.map((warning) => (
                  <p className="fx-zap-warn" key={warning}>
                    <TriangleAlert /> {warning}
                  </p>
                ))}

                <p className="fx-zap-note">
                  Penarikan dan swap adalah dua transaksi terpisah — jumlah yang ditukar baru diketahui
                  setelah penarikan mendarat. Wallet Anda akan meminta tanda tangan dua kali.
                </p>
              </>
            ) : null}

            {busy ? (
              <p className="fx-zap-status">
                <Loader2 className="f-spin" /> {PHASE_LABEL[zap.phase]}
                {zap.summary.total ? ` (${zap.summary.done}/${zap.summary.total})` : ""}
              </p>
            ) : null}
          </>
        ) : null}

        {zap.signatures.length ? (
          <div className="fx-zap-sigs">
            {zap.signatures.map((signature) => (
              <a key={signature} href={`https://solscan.io/tx/${signature}`} target="_blank" rel="noreferrer">
                {signature.slice(0, 8)}…{signature.slice(-6)} <ExternalLink />
              </a>
            ))}
          </div>
        ) : null}

        <div className="fx-confirm-actions">
          <button className="f-btn" type="button" onClick={onClose} disabled={busy}>
            {finished || zap.phase === "partial" ? "Tutup" : "Batal"}
          </button>
          {!finished && zap.phase !== "partial" ? (
            <button
              className="f-btn f-btn--danger"
              type="button"
              disabled={busy || planning || !plan?.ok}
              onClick={() => zap.execute({ positionKey: position.positionKey, targetMint, slippageBps })}
            >
              <Wallet /> {zap.phase === "failed" ? "Coba lagi" : "Zap out sekarang"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
