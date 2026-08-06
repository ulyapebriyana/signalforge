let audioContext;
let audioPlayer;

export const SIGNAL_SOUNDS = Object.freeze({
  fight: { id: "fight", label: "Saya Akan Lawan", src: "/sounds/saya-akan-lawan.mp3" },
  jokowi: { id: "jokowi", label: "Hidup Jokowi", src: "/sounds/hidup-jokowi.mp3" },
  profit: { id: "profit", label: "Cuan Keras", frequencies: [523.25, 659.25, 783.99, 1046.5], step: 0.16, duration: 0.5, volume: 0.9, type: "sawtooth" },
});

export async function playSignalSound(sound = "fight", AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext, AudioClass = globalThis.Audio) {
  const profile = SIGNAL_SOUNDS[sound] || SIGNAL_SOUNDS.fight;
  if (profile.src) {
    if (!AudioClass) return false;
    audioPlayer ||= new AudioClass();
    audioPlayer.src = profile.src;
    audioPlayer.currentTime = 0;
    audioPlayer.volume = 1;
    await audioPlayer.play();
    return true;
  }
  if (!AudioContextClass) return false;

  audioContext ||= new AudioContextClass();
  if (audioContext.state === "suspended") await audioContext.resume();

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
