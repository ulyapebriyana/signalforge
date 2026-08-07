import { DEFAULT_PRESET, PRESETS } from "../../shared/scoring.js";
import { SIGNAL_SOUNDS } from "./signalSound.js";

export const NOTIFICATION_SOUND_OFF = "off";
export const DEFAULT_NOTIFICATION_SOUND = "fight";

export const NOTIFICATION_SOUNDS = SIGNAL_SOUNDS;

export const NOTIFICATION_SOUND_OPTIONS = [
  { value: NOTIFICATION_SOUND_OFF, label: "Bunyi mati" },
  ...Object.entries(NOTIFICATION_SOUNDS).map(([value, sound]) => ({ value, label: sound.label })),
];

/**
 * Each preset gets its own alarm so the sound alone says which strategy fired —
 * useful precisely because the two gates surface different pools at different
 * times of day. Anything not listed falls back to DEFAULT_NOTIFICATION_SOUND.
 */
export const PRESET_DEFAULT_SOUND = Object.freeze({
  yanman: "fight",
  auzhinta: "jokowi",
});

const isPlayable = (choice) => choice === NOTIFICATION_SOUND_OFF || Boolean(NOTIFICATION_SOUNDS[choice]);

/** Ids used by builds before the sounds were renamed. */
const LEGACY_ALIASES = { sayaAkanLawan: "fight", hidupJokowi: "jokowi" };

export function resolveNotificationSoundChoice(savedChoice, legacySoundEnabled, legacyChoice) {
  const migratedChoice = LEGACY_ALIASES[savedChoice] || savedChoice;
  if (isPlayable(migratedChoice)) return migratedChoice;
  if (NOTIFICATION_SOUNDS[legacyChoice]) return legacyChoice;
  return legacySoundEnabled === "false" ? NOTIFICATION_SOUND_OFF : DEFAULT_NOTIFICATION_SOUND;
}

/**
 * Build the per-preset sound map from whatever localStorage holds.
 *
 * `savedMap` is the current format. Older builds stored one choice for the whole
 * app, and that value has to be spread across presets carefully:
 *
 *  - An explicit mute applies everywhere. Someone who silenced the app should
 *    not be handed a new alarm because a preset was added.
 *  - An explicit sound applies only to the default preset — the one that choice
 *    was actually made against. A preset that did not exist when the user picked
 *    it inherits nothing, and takes its own default instead.
 */
export function resolveNotificationSoundMap(savedMap, savedChoice, legacySoundEnabled, legacyChoice) {
  let parsed = null;
  try {
    parsed = savedMap ? JSON.parse(savedMap) : null;
  } catch {
    parsed = null; // A malformed preference falls back to the defaults below.
  }

  const hadChoice = Boolean(savedChoice) || Boolean(legacyChoice);
  const legacy = hadChoice || legacySoundEnabled === "false"
    ? resolveNotificationSoundChoice(savedChoice, legacySoundEnabled, legacyChoice)
    : null;
  const mutedEverywhere = legacy === NOTIFICATION_SOUND_OFF;

  return Object.fromEntries(
    Object.keys(PRESETS).map((presetId) => {
      const stored = LEGACY_ALIASES[parsed?.[presetId]] || parsed?.[presetId];
      if (isPlayable(stored)) return [presetId, stored];
      if (mutedEverywhere) return [presetId, NOTIFICATION_SOUND_OFF];
      if (legacy && presetId === DEFAULT_PRESET) return [presetId, legacy];
      return [presetId, PRESET_DEFAULT_SOUND[presetId] || DEFAULT_NOTIFICATION_SOUND];
    }),
  );
}

/** Read one preset's sound out of a map, tolerating a missing or stale entry. */
export function soundForPreset(soundMap, presetId) {
  const choice = soundMap?.[presetId];
  return isPlayable(choice) ? choice : PRESET_DEFAULT_SOUND[presetId] || DEFAULT_NOTIFICATION_SOUND;
}
