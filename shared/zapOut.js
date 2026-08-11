/**
 * Zap out — planning what leaving a position will actually do.
 *
 * Closing a DLMM position hands back two tokens plus whatever fees accrued.
 * "Zap out" means not stopping there: one side gets swapped into the other, so
 * the position ends as a single asset. That is two separate on-chain steps, and
 * they cannot be merged — the swap amount is not known until the withdrawal has
 * actually landed, because the exact token amounts depend on where the active
 * bin sits at execution time.
 *
 * This module is the part that decides and describes, never the part that
 * signs. It takes plain numbers and returns a plan a human can check before
 * committing money to it. The guard rails here are the last thing standing
 * between a mispriced route and a real loss, so they fail closed: anything
 * unreadable is a refusal, not a warning.
 *
 * v1 restricts the target to one of the pool's own two mints. That keeps the
 * swap to a single leg. Targeting a third token would need two legs and two
 * more failure modes, which is not worth it for the common case of leaving a
 * TOKEN-SOL position entirely in SOL.
 */

/** A route worse than this is refused outright rather than merely flagged. */
export const MAX_PRICE_IMPACT_PCT = 10;

/** Above this the plan is shown with a warning; below it passes quietly. */
export const WARN_PRICE_IMPACT_PCT = 2;

/** Slippage the UI offers, in basis points. */
export const SLIPPAGE_PRESETS = Object.freeze([50, 100, 300, 500]);

export const MIN_SLIPPAGE_BPS = 10;
export const MAX_SLIPPAGE_BPS = 5_000;

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Slippage the user asked for, clamped to something a wallet should sign. */
export function normalizeSlippageBps(value) {
  const parsed = num(value);
  if (parsed === null) return null;
  const rounded = Math.round(parsed);
  if (rounded < MIN_SLIPPAGE_BPS || rounded > MAX_SLIPPAGE_BPS) return null;
  return rounded;
}

/**
 * Which side gets swapped, and which is already the target.
 *
 * Returns null when the target is not one of the pool's mints — the caller must
 * treat that as a refusal, since swapping toward a token this pool does not
 * hold would need a route this module never planned for.
 */
export function resolveZapTarget(pool, targetMint) {
  const x = pool?.tokenX;
  const y = pool?.tokenY;
  if (!x?.address || !y?.address || !targetMint) return null;

  if (targetMint === x.address) return { target: x, source: y, targetSide: "x" };
  if (targetMint === y.address) return { target: y, source: x, targetSide: "y" };
  return null;
}

/**
 * The plan, in the terms the confirmation screen states them.
 *
 * `estimatedTotal` is deliberately an estimate and labelled as one everywhere:
 * the withdrawal has not happened yet, so both the amounts coming out and the
 * route pricing them can move before the transactions land. `minimumTotal` is
 * the number that carries a guarantee — it is what the swap's slippage bound
 * actually enforces, and it is the figure a decision should rest on.
 */
export function planZapOut({ position, pool, targetMint, slippageBps, quote }) {
  const slippage = normalizeSlippageBps(slippageBps);
  if (slippage === null) {
    return { ok: false, reason: "slippage-invalid", message: "Slippage di luar batas yang wajar." };
  }

  const resolved = resolveZapTarget(pool, targetMint);
  if (!resolved) {
    return {
      ok: false,
      reason: "target-not-in-pool",
      message: "Token tujuan harus salah satu dari dua token pool ini.",
    };
  }

  const { target, source, targetSide } = resolved;
  const withdrawTarget = num(targetSide === "x" ? position?.amountX : position?.amountY) ?? 0;
  const withdrawSource = num(targetSide === "x" ? position?.amountY : position?.amountX) ?? 0;

  // Nothing to swap is a valid plan, not an error: a position sitting entirely
  // on the target side just withdraws and stops.
  if (withdrawSource <= 0) {
    return {
      ok: true,
      needsSwap: false,
      slippageBps: slippage,
      targetSymbol: target.symbol,
      sourceSymbol: source.symbol,
      withdrawTarget,
      withdrawSource: 0,
      estimatedSwapOut: 0,
      minimumSwapOut: 0,
      estimatedTotal: withdrawTarget,
      minimumTotal: withdrawTarget,
      priceImpactPct: 0,
      warnings: [],
    };
  }

  if (!quote) {
    return {
      ok: false,
      reason: "quote-missing",
      message: "Rute swap belum bisa dibaca. Coba lagi sebentar.",
    };
  }

  const estimatedSwapOut = num(quote.outAmount);
  const minimumSwapOut = num(quote.minimumOut);
  const priceImpactPct = num(quote.priceImpactPct);

  if (estimatedSwapOut === null || minimumSwapOut === null) {
    return { ok: false, reason: "quote-unreadable", message: "Hasil swap tidak terbaca dari rute." };
  }

  // Fail closed on an unreadable impact: not knowing how bad a route is cannot
  // be treated the same as knowing it is fine.
  if (priceImpactPct === null) {
    return { ok: false, reason: "impact-unknown", message: "Price impact rute tidak terbaca." };
  }

  if (priceImpactPct > MAX_PRICE_IMPACT_PCT) {
    return {
      ok: false,
      reason: "impact-too-high",
      message: `Price impact ${priceImpactPct.toFixed(2)}% melebihi batas ${MAX_PRICE_IMPACT_PCT}%.`,
      priceImpactPct,
    };
  }

  const warnings = [];
  if (priceImpactPct > WARN_PRICE_IMPACT_PCT) {
    warnings.push(`Price impact ${priceImpactPct.toFixed(2)}% — likuiditas rute ini tipis.`);
  }
  if (slippage > 300) {
    warnings.push(`Slippage ${(slippage / 100).toFixed(1)}% cukup longgar; hasil bisa jauh di bawah estimasi.`);
  }

  return {
    ok: true,
    needsSwap: true,
    slippageBps: slippage,
    targetSymbol: target.symbol,
    sourceSymbol: source.symbol,
    targetMint: target.address,
    sourceMint: source.address,
    withdrawTarget,
    withdrawSource,
    estimatedSwapOut,
    minimumSwapOut,
    estimatedTotal: withdrawTarget + estimatedSwapOut,
    minimumTotal: withdrawTarget + minimumSwapOut,
    priceImpactPct,
    warnings,
  };
}

/**
 * How far the guaranteed floor sits below the estimate, as a percentage.
 *
 * Shown next to the two totals because the gap is the part people miss: a
 * generous slippage setting makes the estimate no less likely and the floor a
 * lot lower, and only the floor is enforceable.
 */
export function shortfallPct(plan) {
  if (!plan?.ok || !plan.estimatedTotal) return null;
  const gap = ((plan.estimatedTotal - plan.minimumTotal) / plan.estimatedTotal) * 100;
  return Number.isFinite(gap) ? gap : null;
}

/**
 * Withdrawals arrive as several transactions for a wide position, and a partial
 * failure leaves real money half-moved. This turns the raw signature results
 * into the state the UI has to be honest about.
 */
export function summarizeExecution(results) {
  const list = Array.isArray(results) ? results : [];
  const done = list.filter((step) => step.status === "confirmed").length;
  const failed = list.filter((step) => step.status === "failed");

  if (!list.length) return { state: "idle", done: 0, total: 0, partial: false };
  if (failed.length && done > 0) {
    return {
      state: "partial",
      done,
      total: list.length,
      partial: true,
      message:
        `${done} dari ${list.length} transaksi berhasil sebelum sisanya gagal. ` +
        "Sebagian likuiditas sudah ditarik — periksa posisi sebelum mencoba lagi.",
    };
  }
  if (failed.length) return { state: "failed", done, total: list.length, partial: false };
  if (done === list.length) return { state: "done", done, total: list.length, partial: false };
  return { state: "running", done, total: list.length, partial: false };
}
