import { PRESETS } from "./scoring.js";

/**
 * Which presets a pool is alert-worthy for right now.
 *
 * Alerts used to run against one server-wide preset with one shared score floor.
 * That could not survive more than one preset: the ladders genuinely differ —
 * Auzhinta-like tops out in the fifties by design because unverified memecoins
 * cannot score higher — so a shared floor silences whole presets instead of
 * tuning them. Every preset is therefore judged against its own numbers.
 *
 * Cooldown is keyed per pool *and* preset so one preset firing never suppresses
 * another's view of the same pool. A pool clearing several screens still yields
 * a single message naming all of them; the same alert twice reads as a bug.
 */
export function alertPresetsFor(pool, cooldowns, now = Date.now()) {
  return Object.values(PRESETS).filter((preset) => {
    if (!pool?.qualifies?.[preset.id]?.passed) return false;
    if (!Number.isFinite(pool.score) || pool.score < preset.minScore) return false;
    if (!Number.isFinite(pool.risk) || pool.risk > preset.maxRisk) return false;
    const lastSent = cooldowns?.get(cooldownKey(pool.address, preset.id)) || 0;
    return now - lastSent >= preset.cooldownMinutes * 60_000;
  });
}

export const cooldownKey = (address, presetId) => `${address}:${presetId}`;

/** Presets a pool clears on gate alone, ignoring score, risk, and cooldown. */
export function presetsCleared(pool) {
  return Object.values(PRESETS).filter((preset) => pool?.qualifies?.[preset.id]?.passed);
}
