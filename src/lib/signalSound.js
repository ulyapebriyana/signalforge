let audioContext;

export const SIGNAL_SOUNDS = Object.freeze({
  fight: { id: "fight", label: "Saya Akan Lawan", frequencies: [392, 523.25, 659.25], step: 0.22, duration: 0.42, volume: 0.65, type: "triangle" },
  jokowi: { id: "jokowi", label: "Hidup Jokowi", frequencies: [440, 554.37, 659.25, 880], step: 0.14, duration: 0.36, volume: 0.75, type: "square" },
  profit: { id: "profit", label: "Cuan Keras", frequencies: [523.25, 659.25, 783.99, 1046.5], step: 0.16, duration: 0.5, volume: 0.9, type: "sawtooth" },
});

export async function playSignalSound(sound = "fight", AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext) {
  if (!AudioContextClass) return false;

  audioContext ||= new AudioContextClass();
  if (audioContext.state === "suspended") await audioContext.resume();

  const profile = SIGNAL_SOUNDS[sound] || SIGNAL_SOUNDS.fight;
  const startedAt = audioContext.currentTime;
  const releaseAt = startedAt + (profile.frequencies.length - 1) * profile.step + profile.duration;
  const master = audioContext.createGain();
  master.gain.setValueAtTime(0.0001, startedAt);
  master.gain.exponentialRampToValueAtTime(profile.volume, startedAt + 0.025);
  master.gain.setValueAtTime(profile.volume, releaseAt - 0.15);
  master.gain.exponentialRampToValueAtTime(0.0001, releaseAt);
  master.connect(audioContext.destination);

  profile.frequencies.forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const noteAt = startedAt + index * profile.step;
    oscillator.type = profile.type;
    oscillator.frequency.setValueAtTime(frequency, noteAt);
    oscillator.connect(master);
    oscillator.start(noteAt);
    oscillator.stop(noteAt + profile.duration);
  });

  return true;
}
