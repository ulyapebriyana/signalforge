/**
 * GMGN token payload → the fields the Swanny-like rubric screens on.
 *
 * Kept separate from the fetching so the mapping can be tested without a key or
 * a network. The shapes here were read off live responses from
 * openapi.gmgn.ai/v1/token/info.
 *
 * Two of these are computed rather than read straight off the payload, matching
 * how the DLMM Checker presents them:
 *   - insider share is the count of rat-trader wallets over holders, not
 *     `top_rat_trader_percentage` (which measures supply, and reads an order of
 *     magnitude higher);
 *   - bundler and phishing shares are the supply ratios, which do line up.
 */

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const pct = (ratio) => {
  const parsed = num(ratio);
  return parsed === null ? null : parsed * 100;
};

/** Auth query params. Server checks timestamp within ±5s and rejects replays. */
export function gmgnAuthQuery(randomUUID, now = Date.now()) {
  return { timestamp: String(Math.floor(now / 1000)), client_id: randomUUID() };
}

export function normalizeGmgnToken(payload) {
  const data = payload?.data;
  if (!data) return null;

  const stat = data.stat || {};
  const tags = data.wallet_tags_stat || {};
  const price = data.price || {};

  const holders = num(stat.holder_count ?? data.holder_count);
  const ratWallets = num(tags.rat_trader_wallets);

  return {
    gmgnSniperWallets: num(tags.sniper_wallets),
    gmgnSniperPct: pct(stat.top70_sniper_hold_rate),
    // Wallet share, not supply share — see the note above.
    gmgnInsidersPct: holders > 0 && ratWallets !== null ? (ratWallets / holders) * 100 : null,
    gmgnBundlerPct: pct(stat.top_bundler_trader_percentage),
    gmgnPhishingPct: pct(stat.top_entrapment_trader_percentage),
    gmgnFreshWalletPct: pct(stat.fresh_wallet_rate),
    gmgnTop10Pct: pct(stat.top_10_holder_rate),
    gmgnTotalFeesSol: num(data.total_fee),
    // Finer than anything Meteora exposes; Meteora stops at one hour.
    gmgnVolume1m: num(price.volume_1m),
    gmgnVolume5m: num(price.volume_5m),
    gmgnSwaps5m: num(price.swaps_5m),
    gmgnHolders: holders,
  };
}

/** Field names this module contributes, so callers can null them out cleanly. */
export const GMGN_FIELDS = Object.freeze(Object.keys(normalizeGmgnToken({ data: {} }) || {}));

/** Every GMGN field as null — used when no key is configured or a call fails. */
export const emptyGmgnFields = () =>
  Object.fromEntries(GMGN_FIELDS.map((field) => [field, null]));
