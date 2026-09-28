let audio: AudioContext | null = null;

/**
 * A short two-tone chime for news at a counter (RG-LIV-01: sound and visual). Silent where the
 * device cannot play it; the message in the band remains.
 */
export function chime(): void {
  if (typeof AudioContext === 'undefined') return;
  try {
    audio ??= new AudioContext();
    for (const [index, frequency] of [880, 1320].entries()) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.value = 0.1;
      oscillator.connect(gain).connect(audio.destination);
      const start = audio.currentTime + index * 0.15;
      oscillator.start(start);
      oscillator.stop(start + 0.12);
    }
  } catch {
    // Autoplay policy or no audio output: the message remains.
  }
}
