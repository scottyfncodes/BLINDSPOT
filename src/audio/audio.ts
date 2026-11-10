/**
 * Synthesised sound: no audio files. Station hum, a tension pulse that rises
 * with the site's alert, and short cues for theft and security.
 *
 * Built on the approach of LIFT's audio.js and Big Score's audio.ts. LIFT's
 * crash is fixed: nothing touches the AudioContext until it exists, so a cue
 * before the first tap is silently dropped instead of throwing.
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private pulseTimer = 0;
  private intensity = 0;
  muted = false;

  /** Call from a user gesture (iOS will not start audio otherwise). */
  unlock(): void {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch { return; }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.music = ctx.createGain();
    this.music.gain.value = 0.5;
    this.music.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; data[i] = b * 3.5; }
    this.ambience();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  /** Station hum: brown noise through a low band, and the hum of the lamps. */
  private ambience(): void {
    const ctx = this.ctx!, out = this.master!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const g = ctx.createGain(); g.gain.value = 0.16;
    src.connect(lp).connect(g).connect(out);
    src.start();
    const hum = ctx.createOscillator(); hum.frequency.value = 100; hum.type = 'sine';
    const hg = ctx.createGain(); hg.gain.value = 0.012;
    hum.connect(hg).connect(out); hum.start();
  }

  /** 0 calm .. 3 lockdown. Drives the pulse. */
  setIntensity(level: number): void { this.intensity = level; }

  /** Call every frame; schedules the tension pulse. */
  tick(dt: number, exposure: number): void {
    if (!this.ctx || this.muted) return;
    this.pulseTimer -= dt;
    const drive = Math.max(this.intensity / 3, exposure);
    if (drive < 0.12) return;
    if (this.pulseTimer <= 0) {
      this.pulseTimer = 1.1 - drive * 0.6;
      this.tone(55 + drive * 18, 0.18, 'triangle', 0.05 + drive * 0.09, this.music!);
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, dest?: AudioNode, slide?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private noise(dur: number, freq: number, vol: number, q = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  cue(name: string): void {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'brush': this.noise(0.18, 1800, 0.5, 2); break;
      case 'grip': this.tone(660, 0.08, 'sine', 0.12); break;
      case 'out': this.noise(0.25, 900, 0.35, 1); break;
      case 'stir': this.tone(220, 0.25, 'sine', 0.08, undefined, 180); break;
      case 'freeze': this.tone(120, 0.2, 'square', 0.06); break;
      case 'cover': this.noise(0.6, 400, 0.25, 0.7); break;
      case 'lift': this.tone(523, 0.12, 'triangle', 0.12); setTimeout(() => this.tone(784, 0.16, 'triangle', 0.1), 90); break;
      case 'fumble': this.tone(160, 0.35, 'sawtooth', 0.08, undefined, 90); break;
      case 'flag': this.tone(880, 0.16, 'square', 0.07); setTimeout(() => this.tone(660, 0.22, 'square', 0.07), 170); break;
      case 'shout': this.tone(300, 0.12, 'triangle', 0.06, undefined, 240); break;
      case 'buy': this.tone(988, 0.06, 'square', 0.05); break;
      case 'accept': this.tone(1320, 0.1, 'sine', 0.08); setTimeout(() => this.tone(1760, 0.12, 'sine', 0.07), 110); break;
      case 'deny': this.tone(196, 0.3, 'square', 0.07); break;
      case 'tamper': this.noise(0.3, 3000, 0.2, 4); break;
      case 'cut': this.noise(0.08, 5000, 0.5, 2); this.tone(90, 0.4, 'sawtooth', 0.08, undefined, 40); break;
      case 'hood': this.noise(0.2, 1200, 0.2, 1); break;
      case 'fact': this.tone(740, 0.08, 'sine', 0.06); setTimeout(() => this.tone(988, 0.1, 'sine', 0.05), 80); break;
      case 'caught': this.tone(98, 0.8, 'sawtooth', 0.12, undefined, 60); break;
      case 'tap': this.tone(1200, 0.03, 'square', 0.03); break;
    }
  }
}
