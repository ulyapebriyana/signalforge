import { ArrowRight, Flame, History, Radar, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import { PRESETS } from "../../../../shared/scoring.js";
import { formatPercent, formatUsd, formatWibTime } from "../../../lib/format.js";
import { heatVars, riskBand } from "../../lib/heat.js";
import { Distribution, Spark } from "../components/charts.jsx";
import { EmptyState, HeatBadge, StatTile } from "../components/bits.jsx";

const historyTime = (iso) =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

function MoverRow({ pool, onOpen }) {
  return (
    <button className="fx-mover" type="button" style={heatVars(pool.score)} onClick={() => onOpen(pool)}>
      <span className="fx-mover-heat" aria-hidden="true" />
      <span className="fx-mover-pair">{pool.pair}</span>
      <Spark values={pool.sparkline} score={pool.score} width={64} height={20} />
      <span className="f-num fx-mover-score">{pool.score}</span>
      <span className={`f-num ${pool.priceChange1h >= 0 ? "f-pos" : "f-neg"}`}>
        {formatPercent(pool.priceChange1h)}
      </span>
    </button>
  );
}

export default function OverviewView({ summary, meta, preset, loading, history, onOpenPool, onGoScanner }) {
  const rules = PRESETS[preset];

  return (
    <div className="fx-view fx-overview">
      <header className="fx-view-head">
        <div>
          <h1>Ringkasan</h1>
          <p>
            Kondisi tungku pada pemindaian {formatWibTime(meta?.scannedAt)} WIB · gate {rules.label}.
          </p>
        </div>
        <button className="f-btn f-btn--hot" type="button" onClick={onGoScanner}>
          Buka scanner <ArrowRight />
        </button>
      </header>

      <div className="fx-tiles">
        <StatTile label="Pool dipindai" value={loading ? "—" : meta?.scannedCount ?? 0} sub={`${summary.enriched} diperkaya penuh`} />
        <StatTile
          label="Lolos gate"
          value={loading ? "—" : summary.qualified.length}
          sub={`${summary.watch.length} watch · ${summary.hot.length} hot`}
        />
        <StatTile
          label="Hot sekarang"
          value={loading ? "—" : summary.hot.length}
          heat={summary.hot.length ? 88 : 25}
          sub="Skor 80 ke atas"
        />
        <StatTile
          label="Risiko median"
          value={loading ? "—" : summary.medianRisk}
          tone={riskBand(summary.medianRisk)}
          sub={`Skor median ${summary.medianScore}`}
        />
        <StatTile label="Fee 1 jam" value={loading ? "—" : formatUsd(summary.totalFees1h)} sub="Total di set yang diperkaya" />
        <StatTile label="Volume 1 jam" value={loading ? "—" : formatUsd(summary.totalVolume1h)} sub={`TVL ${formatUsd(summary.totalTvl)}`} />
      </div>

      <div className="fx-overview-grid">
        <section className="fx-panel fx-panel--wide">
          <header className="fx-panel-head">
            <div>
              <span className="f-eyebrow">Sebaran skor</span>
              <h2>Di mana pool berada di skala panas</h2>
            </div>
            <Radar />
          </header>
          <Distribution buckets={summary.distribution} />
          <p className="fx-panel-note">
            Empat kotak ini memakai batas yang sama dengan status: di bawah 50 dianggap Skip, 65 ke
            atas mulai memenuhi syarat gate, dan 80 ke atas dilabeli Hot.
          </p>
        </section>

        <section className="fx-panel">
          <header className="fx-panel-head">
            <div>
              <span className="f-eyebrow">Gate aktif</span>
              <h2>{rules.label}</h2>
            </div>
            <ShieldCheck />
          </header>
          <dl className="fx-fact-list">
            <div>
              <dt>Market cap</dt>
              <dd className="f-num">
                {formatUsd(rules.marketCapMin)} – {formatUsd(rules.marketCapMax)}
              </dd>
            </div>
            <div>
              <dt>TVL minimum</dt>
              <dd className="f-num">{formatUsd(rules.tvlMin)}</dd>
            </div>
            <div>
              <dt>Momentum 1 jam</dt>
              <dd className="f-num">
                {rules.momentumMin}% – {rules.momentumMax}%
              </dd>
            </div>
            <div>
              <dt>Fee/TVL minimum</dt>
              <dd className="f-num">{rules.feeTvlMin}%</dd>
            </div>
            <div>
              <dt>Risiko maksimum</dt>
              <dd className="f-num">{rules.maxRisk}</dd>
            </div>
            <div>
              <dt>Cooldown alert</dt>
              <dd className="f-num">{rules.cooldownMinutes} menit</dd>
            </div>
          </dl>
        </section>

        <section className="fx-panel">
          <header className="fx-panel-head">
            <div>
              <span className="f-eyebrow">Keyakinan tertinggi</span>
              <h2>Sinyal teratas</h2>
            </div>
            <Flame />
          </header>
          <div className="fx-signal-list">
            {summary.qualified.slice(0, 6).map((pool) => (
              <button
                className="fx-signal"
                key={pool.address}
                type="button"
                style={heatVars(pool.score)}
                onClick={() => onOpenPool(pool)}
              >
                <span className="fx-signal-heat" aria-hidden="true" />
                <span className="fx-signal-pair">{pool.pair}</span>
                <HeatBadge score={pool.score} status={pool.status} size="sm" />
              </button>
            ))}
            {!loading && summary.qualified.length === 0 ? (
              <EmptyState title="Belum ada yang lolos gate" body="Coba preset yang lebih longgar, atau tunggu pemindaian berikutnya." />
            ) : null}
          </div>
        </section>

        <section className="fx-panel">
          <header className="fx-panel-head">
            <div>
              <span className="f-eyebrow">Momentum 1 jam</span>
              <h2>Naik paling kencang</h2>
            </div>
            <TrendingUp />
          </header>
          <div className="fx-mover-list">
            {summary.gainers.map((pool) => (
              <MoverRow key={pool.address} pool={pool} onOpen={onOpenPool} />
            ))}
          </div>
        </section>

        <section className="fx-panel">
          <header className="fx-panel-head">
            <div>
              <span className="f-eyebrow">Momentum 1 jam</span>
              <h2>Turun paling dalam</h2>
            </div>
            <TrendingDown />
          </header>
          <div className="fx-mover-list">
            {summary.losers.map((pool) => (
              <MoverRow key={pool.address} pool={pool} onOpen={onOpenPool} />
            ))}
          </div>
        </section>

        <section className="fx-panel fx-panel--wide">
          <header className="fx-panel-head">
            <div>
              <span className="f-eyebrow">Tercatat di server</span>
              <h2>Aktivitas terakhir</h2>
            </div>
            <History />
          </header>
          <div className="fx-activity">
            {history.slice(0, 8).map((item) => (
              <div className="fx-activity-row" key={item.id} style={heatVars(item.score)}>
                <span className="fx-activity-heat" aria-hidden="true" />
                <strong>{item.pair}</strong>
                <span className="f-muted">
                  {item.eventType === "status-entry"
                    ? `Masuk ${String(item.status).toUpperCase()}`
                    : item.source === "scanner"
                      ? "Terdeteksi scanner"
                      : item.source === "auto"
                        ? "Alert otomatis"
                        : "Alert manual"}
                </span>
                <span className="f-num">{item.score}</span>
                <span className="f-num f-muted">{historyTime(item.createdAt)}</span>
              </div>
            ))}
            {history.length === 0 ? (
              <EmptyState title="Riwayat masih kosong" body="Sinyal pertama yang lolos gate akan tercatat di sini." />
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
