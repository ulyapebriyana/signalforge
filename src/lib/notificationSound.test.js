import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_SOUND,
  NOTIFICATION_SOUNDS,
  NOTIFICATION_SOUND_OFF,
  NOTIFICATION_SOUND_OPTIONS,
  resolveNotificationSoundChoice,
} from "./notificationSounds.js";

describe("notification sound", () => {
  it.each(Object.entries(NOTIFICATION_SOUNDS))("embeds %s as a valid MP3 data URL", (_, sound) => {
    const [mediaType, encodedAudio] = sound.url.split(",");
    const decodedAudio = Buffer.from(encodedAudio, "base64");

    expect(mediaType).toBe("data:audio/mpeg;base64");
    expect(decodedAudio.length).toBeGreaterThan(20_000);
    expect(decodedAudio.subarray(0, 3).toString()).toBe("ID3");
  });

  it("offers off and both notification sounds", () => {
    expect(NOTIFICATION_SOUND_OPTIONS.map((option) => option.value)).toEqual([
      NOTIFICATION_SOUND_OFF,
      "hidupJokowi",
      "sayaAkanLawan",
    ]);
  });

  it("restores saved choices and migrates the legacy sound toggle", () => {
    expect(resolveNotificationSoundChoice("hidupJokowi", "true")).toBe("hidupJokowi");
    expect(resolveNotificationSoundChoice(NOTIFICATION_SOUND_OFF, "true")).toBe(NOTIFICATION_SOUND_OFF);
    expect(resolveNotificationSoundChoice(null, "false")).toBe(NOTIFICATION_SOUND_OFF);
    expect(resolveNotificationSoundChoice("unknown", "true")).toBe(DEFAULT_NOTIFICATION_SOUND);
  });
});
