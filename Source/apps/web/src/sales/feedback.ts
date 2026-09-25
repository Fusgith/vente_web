let audio: AudioContext | null = null;

/**
 * Beep and vibration when an article is added by code or scan (RG-DEV-06 §3): a short high
 * beep when added, a low double buzz when the code is unknown. Silent where the device cannot.
 */
export function scanFeedback(ok: boolean): void {
  if ('vibrate' in navigator) navigator.vibrate(ok ? 60 : [80, 60, 80]);
  if (typeof AudioContext === 'undefined') return;
  try {
    audio ??= new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = ok ? 1760 : 220;
    gain.gain.value = 0.1;
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + (ok ? 0.08 : 0.3));
  } catch {
    // Autoplay policy or no audio output: the vibration and the message remain.
  }
}
