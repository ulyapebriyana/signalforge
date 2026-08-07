import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_SOUND,
  NOTIFICATION_SOUNDS,
  NOTIFICATION_SOUND_OFF,
  NOTIFICATION_SOUND_OPTIONS,
  resolveNotificationSoundChoice,
  resolveNotificationSoundMap,
  soundForPreset,
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

describe("per-preset notification sound", () => {
  it("gives each preset its own default alarm", () => {
    expect(resolveNotificationSoundMap(null, null, null, null)).toEqual({
      yanman: "fight",
      auzhinta: "jokowi",
    });
  });

  it("restores a saved per-preset map", () => {
    const saved = JSON.stringify({ yanman: "profit", auzhinta: NOTIFICATION_SOUND_OFF });
    expect(resolveNotificationSoundMap(saved, null, null, null)).toEqual({
      yanman: "profit",
      auzhinta: NOTIFICATION_SOUND_OFF,
    });
  });

  it("applies an earlier single choice only to the preset it was made against", () => {
    // Someone who picked Cuan Keras keeps it on the default preset, but a preset
    // that did not exist back then inherits nothing and takes its own default.
    expect(resolveNotificationSoundMap(null, "profit", "true", null)).toEqual({
      yanman: "profit",
      auzhinta: "jokowi",
    });
  });

  it("carries the legacy off toggle across to every preset", () => {
    expect(resolveNotificationSoundMap(null, null, "false", null)).toEqual({
      yanman: NOTIFICATION_SOUND_OFF,
      auzhinta: NOTIFICATION_SOUND_OFF,
    });
  });

  it("migrates old sound ids stored inside the map", () => {
    const saved = JSON.stringify({ yanman: "hidupJokowi", auzhinta: "sayaAkanLawan" });
    expect(resolveNotificationSoundMap(saved, null, null, null)).toEqual({
      yanman: "jokowi",
      auzhinta: "fight",
    });
  });

  it("falls back per preset when the map is malformed or partial", () => {
    expect(resolveNotificationSoundMap("{not json", null, null, null)).toEqual({
      yanman: "fight",
      auzhinta: "jokowi",
    });
    expect(resolveNotificationSoundMap(JSON.stringify({ yanman: "bogus" }), null, null, null)).toEqual({
      yanman: "fight",
      auzhinta: "jokowi",
    });
  });

  it("reads a single preset out of the map and tolerates gaps", () => {
    expect(soundForPreset({ auzhinta: "profit" }, "auzhinta")).toBe("profit");
    expect(soundForPreset({}, "auzhinta")).toBe("jokowi");
    expect(soundForPreset(null, "yanman")).toBe("fight");
  });
});
