import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_SOUND,
  NOTIFICATION_SOUNDS,
  NOTIFICATION_SOUND_OFF,
  NOTIFICATION_SOUND_OPTIONS,
  resolveNotificationSoundChoice,
} from "./notificationSounds.js";

describe("notification sound", () => {
  it("keeps the approved sound labels and default", () => {
    expect(DEFAULT_NOTIFICATION_SOUND).toBe("fight");
    expect(Object.values(NOTIFICATION_SOUNDS).map((sound) => sound.label)).toEqual([
      "Saya Akan Lawan",
      "Hidup Jokowi",
      "Cuan Keras",
    ]);
  });

  it("offers off and all three notification sounds", () => {
    expect(NOTIFICATION_SOUND_OPTIONS.map((option) => option.value)).toEqual([
      NOTIFICATION_SOUND_OFF,
      "fight",
      "jokowi",
      "profit",
    ]);
  });

  it("restores saved choices and migrates the legacy sound toggle", () => {
    expect(resolveNotificationSoundChoice("hidupJokowi", "true")).toBe("jokowi");
    expect(resolveNotificationSoundChoice("sayaAkanLawan", "true")).toBe("fight");
    expect(resolveNotificationSoundChoice(null, "true", "profit")).toBe("profit");
    expect(resolveNotificationSoundChoice(NOTIFICATION_SOUND_OFF, "true")).toBe(NOTIFICATION_SOUND_OFF);
    expect(resolveNotificationSoundChoice(null, "false")).toBe(NOTIFICATION_SOUND_OFF);
    expect(resolveNotificationSoundChoice("unknown", "true")).toBe(DEFAULT_NOTIFICATION_SOUND);
  });
});
