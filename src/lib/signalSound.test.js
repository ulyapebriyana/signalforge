import { expect, it, vi } from "vitest";
import { playSignalSound } from "./signalSound.js";

it("schedules the selected notification sound", async () => {
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

  expect(await playSignalSound("fight", FakeAudioContext)).toBe(true);
  expect(starts).toEqual([10, 10.22, 10.44]);
  starts.length = 0;

  expect(await playSignalSound("profit", FakeAudioContext)).toBe(true);
  expect(starts).toEqual([10, 10.16, 10.32, 10.48]);
});
