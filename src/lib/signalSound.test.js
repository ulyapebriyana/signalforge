import { expect, it, vi } from "vitest";
import { playProfitSignal } from "./signalSound.js";

it("schedules a loud four-note profit signal", async () => {
  const starts = [];
  class FakeAudioContext {
    state = "running";
    currentTime = 10;
    destination = {};
    createGain = () => ({
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    });
    createOscillator = () => ({
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: (at) => starts.push(at),
      stop: vi.fn(),
    });
  }

  expect(await playProfitSignal(FakeAudioContext)).toBe(true);
  expect(starts).toEqual([10, 10.16, 10.32, 10.48]);
});
