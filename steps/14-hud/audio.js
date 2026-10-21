'use strict';
/*
 * Sound effects, synthesized with the Web Audio API: a few oscillators and
 * some filtered noise, each with a quick fade-out. No sound files, like
 * everything else in this series.
 *
 * Browsers only allow sound after the user has interacted with the page, so
 * the audio context is created on the first play() (which follows a key press).
 */
function createSfx() {
  let ctx = null, master = null, noiseBuffer = null, level = 1;
  const sfx = { enabled: true, play };

  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.25;
    master.connect(ctx.destination);
    // Half a second of white noise, looped wherever it's needed.
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate / 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  /** A tone gliding from f0 to f1 Hz over dur seconds while it fades out. */
  function tone(type, f0, f1, dur, vol, delay = 0) {
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    gain.gain.setValueAtTime(vol * level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + dur);
  }

  /** A burst of noise through a filter whose frequency sweeps from f0 to f1 Hz. */
  function noise(dur, f0, f1, vol, filterType = 'lowpass', delay = 0) {
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    src.buffer = noiseBuffer;
    src.loop = true;
    filter.type = filterType;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
    gain.gain.setValueAtTime(vol * level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t);
    src.stop(t + dur);
  }

  const notes = (type, freqs, gap, dur, vol) => freqs.forEach((f, i) => tone(type, f, f, dur, vol, i * gap));

  const SOUNDS = {
    shoot:      () => { noise(0.2, 4000, 250, 0.8); tone('sine', 150, 45, 0.16, 0.7); },
    robotShoot: () => { tone('square', 900, 220, 0.12, 0.3); noise(0.08, 2500, 900, 0.35, 'bandpass'); },
    pain:       () => tone('square', 330, 140, 0.1, 0.3),
    die:        () => { noise(0.5, 1500, 80, 0.6); tone('sawtooth', 220, 30, 0.45, 0.3); },
    alert:      () => notes('square', [880, 660], 0.08, 0.08, 0.18),
    door:       () => noise(0.7, 500, 180, 0.3),
    pickup:     () => notes('sine', [660, 990], 0.06, 0.1, 0.35),
    treasure:   () => notes('triangle', [784, 988, 1175, 1568], 0.06, 0.12, 0.35),
    key:        () => notes('sine', [1047, 1568], 0.05, 0.25, 0.3),
    hurt:       () => tone('sawtooth', 170, 70, 0.18, 0.4),
    empty:      () => noise(0.03, 3000, 2000, 0.5, 'highpass'),
    locked:     () => notes('square', [200, 150], 0.09, 0.1, 0.25),
    secret:     () => notes('triangle', [523, 659, 784, 1047], 0.09, 0.15, 0.3),
    exit:       () => notes('square', [523, 659, 784, 1047, 784, 1047], 0.12, 0.14, 0.18),
  };

  /** Plays a sound; volume (0 … 1) lets distant robots sound quieter. */
  function play(name, volume = 1) {
    if (!sfx.enabled || !SOUNDS[name]) return;
    try {
      if (!ctx) init();
      if (ctx.state === 'suspended') ctx.resume();
      level = volume;
      SOUNDS[name]();
    } catch {
      sfx.enabled = false;      // no Web Audio here: carry on silently
    }
  }
  return sfx;
}
