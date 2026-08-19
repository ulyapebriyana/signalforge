import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_SOUND,
  DEFAULT_POSITION_SOUND,
  NOTIFICATION_SOUNDS,
  NOTIFICATION_SOUND_OFF,
  NOTIFICATION_SOUND_OPTIONS,
  PRESET_DEFAULT_SOUND,
  resolveNotificationSoundChoice,
  resolveNotificationSoundMap,
  resolvePositionSoundChoice,
  soundForPreset,
} from "./notificationSounds.js";

describe("notification sound", () => {
  it("keeps the approved sound labels and default", () => {
    expect(DEFAULT_NOTIFICATION_SOUND).toBe("fight");
    expect(Object.values(NOTIFICATION_SOUNDS).map((sound) => sound.label)).toEqual([
      "Saya Akan Lawan",
      "Hidup Jokowi",
      "Wowok Bilang Ndasmu",
      "Cuan Keras",
      "Saya Masih Sanggup",
      "Antek-Antek Asing",
      "Matanya Burem",
      "Sodara-Sodara",
      "Runner Kencang",
      "Migrasi Baru",
    ]);
  });

  it("offers off and every notification sound", () => {
    expect(NOTIFICATION_SOUND_OPTIONS.map((option) => option.value)).toEqual([
      NOTIFICATION_SOUND_OFF,
      "fight",
      "jokowi",
      "wowok",
      "profit",
      "sanggup",
      "antek",
      "burem",
      "sodara",
      "runner",
      "fresh",
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

describe("position sound", () => {
  it("defaults to a sound no preset already claims", () => {
    expect(resolvePositionSoundChoice(null)).toBe(DEFAULT_POSITION_SOUND);
    expect(Object.values(PRESET_DEFAULT_SOUND)).not.toContain(DEFAULT_POSITION_SOUND);
  });

  it("keeps a saved choice, including an explicit mute", () => {
    expect(resolvePositionSoundChoice("profit")).toBe("profit");
    expect(resolvePositionSoundChoice(NOTIFICATION_SOUND_OFF)).toBe(NOTIFICATION_SOUND_OFF);
  });

  it("falls back when the stored id no longer exists", () => {
    expect(resolvePositionSoundChoice("unknown")).toBe(DEFAULT_POSITION_SOUND);
    expect(resolvePositionSoundChoice("")).toBe(DEFAULT_POSITION_SOUND);
  });

  it("migrates the renamed sound ids", () => {
    expect(resolvePositionSoundChoice("hidupJokowi")).toBe("jokowi");
  });
});

describe("per-preset notification sound", () => {
  it("gives each preset its own default alarm", () => {
    expect(resolveNotificationSoundMap(null, null, null, null)).toEqual({
      slowwallet: "burem",
      heartattack: "runner",
    });
  });

  it("restores a saved per-preset map", () => {
    const saved = JSON.stringify({ slowwallet: "profit", heartattack: NOTIFICATION_SOUND_OFF });
    expect(resolveNotificationSoundMap(saved, null, null, null)).toEqual({
      slowwallet: "profit",
      heartattack: NOTIFICATION_SOUND_OFF,
    });
  });

  it("applies an earlier single choice only to the preset it was made against", () => {
    // Someone who picked Cuan Keras keeps it on the default preset, but a preset
    // that did not exist back then inherits nothing and takes its own default.
    expect(resolveNotificationSoundMap(null, "profit", "true", null)).toEqual({
      slowwallet: "profit",
      heartattack: "runner",
    });
  });

  it("carries the legacy off toggle across to every preset", () => {
    expect(resolveNotificationSoundMap(null, null, "false", null)).toEqual({
      slowwallet: NOTIFICATION_SOUND_OFF,
      heartattack: NOTIFICATION_SOUND_OFF,
    });
  });

  it("migrates old sound ids stored inside the map", () => {
    const saved = JSON.stringify({ slowwallet: "hidupJokowi", heartattack: "sayaAkanLawan" });
    expect(resolveNotificationSoundMap(saved, null, null, null)).toEqual({
      slowwallet: "jokowi",
      heartattack: "fight",
    });
  });

  it("falls back per preset when the map is malformed or partial", () => {
    expect(resolveNotificationSoundMap("{not json", null, null, null)).toEqual({
      slowwallet: "burem",
      heartattack: "runner",
    });
    expect(resolveNotificationSoundMap(JSON.stringify({ slowwallet: "bogus" }), null, null, null)).toEqual({
      slowwallet: "burem",
      heartattack: "runner",
    });
  });

  it("reads a single preset out of the map and tolerates gaps", () => {
    expect(soundForPreset({ slowwallet: "profit" }, "slowwallet")).toBe("profit");
    expect(soundForPreset({}, "slowwallet")).toBe("burem");
    expect(soundForPreset(null, "heartattack")).toBe("runner");
  });
});
