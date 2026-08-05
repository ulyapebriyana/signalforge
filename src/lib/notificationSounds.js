import { HIDUP_JOKOWI_SOUND_URL } from "./hidupJokowiSound.js";
import { SAYA_AKAN_LAWAN_SOUND_URL } from "./notificationSound.js";

export const NOTIFICATION_SOUND_OFF = "off";
export const DEFAULT_NOTIFICATION_SOUND = "sayaAkanLawan";

export const NOTIFICATION_SOUNDS = {
  hidupJokowi: {
    label: "Hidup Jokowi",
    url: HIDUP_JOKOWI_SOUND_URL,
  },
  sayaAkanLawan: {
    label: "Saya Akan Lawan",
    url: SAYA_AKAN_LAWAN_SOUND_URL,
  },
};

export const NOTIFICATION_SOUND_OPTIONS = [
  { value: NOTIFICATION_SOUND_OFF, label: "Bunyi mati" },
  ...Object.entries(NOTIFICATION_SOUNDS).map(([value, sound]) => ({ value, label: sound.label })),
];

export function resolveNotificationSoundChoice(savedChoice, legacySoundEnabled) {
  if (savedChoice === NOTIFICATION_SOUND_OFF || NOTIFICATION_SOUNDS[savedChoice]) return savedChoice;
  return legacySoundEnabled === "false" ? NOTIFICATION_SOUND_OFF : DEFAULT_NOTIFICATION_SOUND;
}
