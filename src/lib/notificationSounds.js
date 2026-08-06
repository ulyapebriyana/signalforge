import { SIGNAL_SOUNDS } from "./signalSound.js";

export const NOTIFICATION_SOUND_OFF = "off";
export const DEFAULT_NOTIFICATION_SOUND = "fight";

export const NOTIFICATION_SOUNDS = SIGNAL_SOUNDS;

export const NOTIFICATION_SOUND_OPTIONS = [
  { value: NOTIFICATION_SOUND_OFF, label: "Bunyi mati" },
  ...Object.entries(NOTIFICATION_SOUNDS).map(([value, sound]) => ({ value, label: sound.label })),
];

export function resolveNotificationSoundChoice(savedChoice, legacySoundEnabled, legacyChoice) {
  const migratedChoice = { sayaAkanLawan: "fight", hidupJokowi: "jokowi" }[savedChoice] || savedChoice;
  if (migratedChoice === NOTIFICATION_SOUND_OFF || NOTIFICATION_SOUNDS[migratedChoice]) return migratedChoice;
  if (NOTIFICATION_SOUNDS[legacyChoice]) return legacyChoice;
  return legacySoundEnabled === "false" ? NOTIFICATION_SOUND_OFF : DEFAULT_NOTIFICATION_SOUND;
}
