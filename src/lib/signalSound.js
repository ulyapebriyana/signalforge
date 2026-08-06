let audioContext;

export async function playProfitSignal(AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext) {
  if (!AudioContextClass) return false;

  audioContext ||= new AudioContextClass();
  if (audioContext.state === "suspended") await audioContext.resume();

  const startedAt = audioContext.currentTime;
  const master = audioContext.createGain();
  master.gain.setValueAtTime(0.0001, startedAt);
  master.gain.exponentialRampToValueAtTime(0.9, startedAt + 0.025);
  master.gain.setValueAtTime(0.9, startedAt + 0.72);
  master.gain.exponentialRampToValueAtTime(0.0001, startedAt + 1.15);
  master.connect(audioContext.destination);

  [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const noteAt = startedAt + index * 0.16;
    oscillator.type = index === 3 ? "square" : "sawtooth";
    oscillator.frequency.setValueAtTime(frequency, noteAt);
    oscillator.connect(master);
    oscillator.start(noteAt);
    oscillator.stop(noteAt + 0.5);
  });

  return true;
}
