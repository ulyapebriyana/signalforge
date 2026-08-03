import { describe, expect, it } from "vitest";
import { NOTIFICATION_SOUND_URL } from "./notificationSound.js";

describe("notification sound", () => {
  it("embeds a valid MP3 data URL", () => {
    const [mediaType, encodedAudio] = NOTIFICATION_SOUND_URL.split(",");
    const decodedAudio = Buffer.from(encodedAudio, "base64");

    expect(mediaType).toBe("data:audio/mpeg;base64");
    expect(decodedAudio.length).toBeGreaterThan(20_000);
    expect(decodedAudio.subarray(0, 3).toString()).toBe("ID3");
  });
});
