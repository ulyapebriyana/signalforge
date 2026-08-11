/**
 * LP position math — what a DLMM position is worth and whether it still earns.
 *
 * The screener answers "masuk pool mana". This answers the other half: the
 * position you already opened, and whether it is still doing anything. For a
 * DLMM position that reduces to one question the pool list cannot ask — is the
 * active bin still inside your range? Out of range means the position holds one
 * side entirely and collects no fees, so it is the exit signal that matters,
 * and it is checkable from on-chain state alone.
 *
 * Everything here is pure and takes plain numbers: the server converts the
 * SDK's BN and PublicKey values into a flat record first, so these rules can be
 * tested without an RPC. Amounts arrive as raw integer strings (base units),
 * which is how the chain stores them and the only form that survives JSON
 * without losing precision.
 */

/** Fraction of the range width within which an in-range position reads as "near the edge". */
const EDGE_MARGIN = 0.15;

/**
 * Number, treating "absent" as unknown rather than zero.
 *
 * `Number(null)` and `Number("")` are both 0 and both pass `Number.isFinite`,
 * which would turn an unpriced token into a free one and a missing bin id into
 * bin zero. Absent has to stay null all the way through, because null is what
 * every total here checks for before it refuses to add up.
 */
const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Raw base units → human amount. Returns null rather than NaN on bad input. */
export function toDecimalAmount(raw, decimals) {
  const parsed = num(raw);
  const places = num(decimals);
  if (parsed === null || places === null) return null;
  return parsed / 10 ** places;
}

/**
 * Price at a bin's lower edge, in token Y per token X, as a human would read it.
 *
 * DLMM lays bins out geometrically: each step up multiplies the price by
 * (1 + binStep/10000), so bin `id` sits at that ratio raised to `id`. That ratio
 * is in base units, so the decimal difference between the two mints converts it
 * to the price shown in the UI.
 */
export function binIdToPrice(binId, binStep, decimalsX, decimalsY) {
  const id = num(binId);
  const step = num(binStep);
  const placesX = num(decimalsX);
  const placesY = num(decimalsY);
  if (id === null || step === null || step <= 0) return null;
  if (placesX === null || placesY === null) return null;

  const price = (1 + step / 10_000) ** id * 10 ** (placesX - placesY);
  return Number.isFinite(price) ? price : null;
}

/**
 * Where the active bin sits inside the position, as 0–1 across the range.
 *
 * Below 0 or above 1 means out of range, and the sign says which side: under 0
 * the price fell through the bottom and the position is all token X, over 1 it
 * ran past the top and the position is all token Y.
 */
export function rangeProgress(activeBinId, lowerBinId, upperBinId) {
  const active = num(activeBinId);
  const lower = num(lowerBinId);
  const upper = num(upperBinId);
  if (active === null || lower === null || upper === null) return null;

  // A single-bin position has no width to divide by; it is either on or off.
  const width = upper - lower;
  if (width <= 0) return active === lower ? 0.5 : (active < lower ? -1 : 2);
  return (active - lower) / width;
}

/**
 * The one-word verdict the UI and the alert both read off.
 *
 * "edge" is not a separate state on chain — it is still in range and still
 * earning. It exists because the useful moment to act on a DLMM position is
 * before it goes flat, not after, and the distance to the edge is the only
 * warning the position gives.
 */
export function rangeState(progress) {
  if (progress === null) return "unknown";
  if (progress < 0) return "below";
  if (progress > 1) return "above";
  if (progress < EDGE_MARGIN || progress > 1 - EDGE_MARGIN) return "edge";
  return "inside";
}

export const RANGE_LABEL = Object.freeze({
  inside: "Dalam range",
  edge: "Dekat tepi",
  below: "Keluar bawah",
  above: "Keluar atas",
  unknown: "Tidak diketahui",
});

/** True while the active bin is inside the position, i.e. the position still earns fees. */
export const isEarning = (state) => state === "inside" || state === "edge";

/**
 * One position + its pool metadata → the record the dashboard renders.
 *
 * Token prices come from Meteora's own pool endpoint, so a pool it cannot price
 * yields null values rather than a confident zero — the same fail-open-to-null
 * shape the security columns already use.
 */
export function summarizePosition(position, pool) {
  const decimalsX = num(pool?.tokenX?.decimals);
  const decimalsY = num(pool?.tokenY?.decimals);
  const priceX = num(pool?.tokenX?.price);
  const priceY = num(pool?.tokenY?.price);
  const binStep = num(pool?.binStep) ?? num(position?.binStep);

  const amountX = toDecimalAmount(position?.totalXAmount, decimalsX);
  const amountY = toDecimalAmount(position?.totalYAmount, decimalsY);
  const feeX = toDecimalAmount(position?.feeX, decimalsX);
  const feeY = toDecimalAmount(position?.feeY, decimalsY);
  const claimedX = toDecimalAmount(position?.claimedFeeX, decimalsX);
  const claimedY = toDecimalAmount(position?.claimedFeeY, decimalsY);

  const value = (amount, price) =>
    amount === null || price === null ? null : amount * price;

  // A side that cannot be priced makes the whole total a guess, so the total is
  // null unless both sides are known. Half a position's value shown as the
  // whole is worse than showing nothing.
  const sum = (left, right) => (left === null || right === null ? null : left + right);

  const valueUsd = sum(value(amountX, priceX), value(amountY, priceY));
  const unclaimedFeesUsd = sum(value(feeX, priceX), value(feeY, priceY));
  const claimedFeesUsd = sum(value(claimedX, priceX), value(claimedY, priceY));

  const progress = rangeProgress(position?.activeBinId, position?.lowerBinId, position?.upperBinId);
  const state = rangeState(progress);

  const upperBinId = num(position?.upperBinId);
  const lowerPrice = binIdToPrice(position?.lowerBinId, binStep, decimalsX, decimalsY);
  // The top of the range is the *upper edge* of the last bin, not its floor.
  const upperPrice = upperBinId === null
    ? null
    : binIdToPrice(upperBinId + 1, binStep, decimalsX, decimalsY);
  const activePrice = binIdToPrice(position?.activeBinId, binStep, decimalsX, decimalsY);

  return {
    positionKey: position?.positionKey ?? null,
    poolAddress: position?.poolAddress ?? null,
    pair: pool?.name ?? null,
    symbolX: pool?.tokenX?.symbol ?? null,
    symbolY: pool?.tokenY?.symbol ?? null,
    // Mints and decimals ride along because leaving a position needs them:
    // the swap leg is priced in base units against a specific mint, and the
    // target picker has to offer the pool's own two tokens by address.
    mintX: pool?.tokenX?.address ?? null,
    mintY: pool?.tokenY?.address ?? null,
    decimalsX,
    decimalsY,
    binStep,

    amountX,
    amountY,
    valueUsd,
    unclaimedFeesUsd,
    claimedFeesUsd,
    totalFeesUsd: sum(unclaimedFeesUsd, claimedFeesUsd),

    lowerBinId: num(position?.lowerBinId),
    upperBinId,
    activeBinId: num(position?.activeBinId),
    lowerPrice,
    upperPrice,
    activePrice,
    rangeProgress: progress,
    rangeState: state,
    earning: isEarning(state),

    poolTvl: num(pool?.tvl),
    poolApr: num(pool?.apr),
    poolFeeTvl1h: num(pool?.feeTvl1h),
    lastUpdatedAt: num(position?.lastUpdatedAt),
  };
}

/**
 * Which range changes are worth a message.
 *
 * The scanner alerts on pools getting better; this alerts on positions getting
 * worse, which is the half it never had. Only two transitions qualify:
 *
 *   - a position that was earning has gone out of range — it is now flat, held
 *     entirely in one token, and every minute it stays there earns nothing;
 *   - a centred position has drifted to the edge — still earning, but this is
 *     the last warning before the above.
 *
 * Recovery back into range is deliberately silent. It needs no decision, and a
 * position oscillating around its edge would otherwise alert on every bounce.
 */
export function collectPositionAlerts(positions, previousStates = new Map()) {
  const currentStates = new Map();
  const entries = [];

  for (const position of positions) {
    const key = position.positionKey;
    if (!key) continue;

    const state = position.rangeState;
    const previous = previousStates.get(key);
    currentStates.set(key, state);

    // No previous reading means this is the first time we have seen the
    // position — on a restart, or a position opened since the last read. Its
    // current state is the baseline, not an event: alerting here would
    // announce every position the server has ever seen each time it boots.
    if (previous === undefined || state === previous || state === "unknown") continue;

    if (isEarning(previous) && !isEarning(state)) {
      entries.push({ position, state, previousState: previous, kind: "out-of-range" });
    } else if (previous === "inside" && state === "edge") {
      entries.push({ position, state, previousState: previous, kind: "near-edge" });
    }
  }

  return { currentStates, entries };
}

/**
 * Roll the positions up into the totals the header shows.
 *
 * `valueUsd` deliberately skips positions that could not be priced instead of
 * treating them as zero, and `pricedCount` says how many made it in — a total
 * that quietly omits a position would read as a loss.
 */
export function summarizeWallet(positions) {
  const priced = positions.filter((position) => position.valueUsd !== null);
  const sumOf = (key) => positions.reduce(
    (total, position) => (position[key] === null ? total : total + position[key]), 0,
  );

  const earning = positions.filter((position) => position.earning);
  return {
    positionCount: positions.length,
    pricedCount: priced.length,
    earningCount: earning.length,
    outOfRangeCount: positions.filter((position) => !position.earning && position.rangeState !== "unknown").length,
    valueUsd: priced.length ? sumOf("valueUsd") : null,
    unclaimedFeesUsd: sumOf("unclaimedFeesUsd"),
    claimedFeesUsd: sumOf("claimedFeesUsd"),
    totalFeesUsd: sumOf("totalFeesUsd"),
  };
}
