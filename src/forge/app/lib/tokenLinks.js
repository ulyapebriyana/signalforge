/**
 * Token logo and quick-open links, sourced without any server round trip —
 * both come from CDNs that key off the mint address alone, so a pool renders
 * its logo and its link row the moment the scan itself arrives.
 *
 * The logo is DexScreener's own token-image CDN, which redirects to a sized,
 * pre-optimised webp whether the mint is a blue chip or a pump.fun launch from
 * five minutes ago. A mint DexScreener has never indexed 404s, which
 * `PoolAvatar` falls back on to its plain initials.
 */
export const tokenLogoUrl = (mint, size = "sm") =>
  mint ? `https://dd.dexscreener.com/ds-data/tokens/solana/${mint}.png?size=${size}` : null;

/** Each site's own favicon, fetched through Google's public favicon proxy — no logo assets to bundle or keep in sync. */
const favicon = (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

/** The favicon of whatever domain a social URL actually points to, not a fixed one — a project's own site varies per token. */
const faviconFor = (url) => {
  try {
    return favicon(new URL(url).hostname);
  } catch {
    return null;
  }
};

const SOCIAL_META = {
  twitter: { label: "X / Komunitas" },
  telegram: { label: "Telegram" },
  website: { label: "Situs resmi" },
  instagram: { label: "Instagram" },
  discord: { label: "Discord" },
};

/**
 * Social links live on `pool.socials` — set server-side from DexScreener's
 * token-info payload (see `fetchDexscreenerSocials` in server/index.mjs) —
 * rather than fetched here, because the same handful of mints repeat across
 * every visible pool and the server already holds the long-lived cache that
 * makes that cheap. `null` means "not read yet or none on file", both of
 * which render as simply not adding the icon.
 */
const socialLinks = (socials) => {
  if (!socials) return [];
  return Object.entries(SOCIAL_META)
    .filter(([type]) => socials[type])
    .map(([type, meta]) => ({ key: type, label: meta.label, favicon: faviconFor(socials[type]), href: socials[type] }));
};

/**
 * The row fabriq.trade shows per pool: whatever socials the project itself
 * published, then its DEX, a swap shortcut, and the screener/intel tools
 * people actually flip between mid-trade. Ordered by how often each gets
 * clicked while working a pool — chart and swap before the explorer.
 */
export function poolLinks(pool) {
  const mint = pool.baseAddress;
  const links = [
    ...socialLinks(pool.socials),
    { key: "meteora", label: "Meteora", favicon: favicon("meteora.ag"), href: `https://www.meteora.ag/dlmm/${pool.address}` },
  ];
  if (!mint) return links;
  links.push(
    { key: "jupiter", label: "Swap di Jupiter", favicon: favicon("jup.ag"), href: `https://jup.ag/swap/SOL-${mint}` },
    { key: "dexscreener", label: "DexScreener", favicon: favicon("dexscreener.com"), href: `https://dexscreener.com/solana/${mint}` },
    { key: "gmgn", label: "GMGN", favicon: favicon("gmgn.ai"), href: `https://gmgn.ai/sol/token/${mint}` },
    { key: "solscan", label: "Solscan", favicon: favicon("solscan.io"), href: `https://solscan.io/token/${mint}` },
  );
  return links;
}
