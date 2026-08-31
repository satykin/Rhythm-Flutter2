/* ============================================================
 * Ambient-звуки Flow Sessions — Web Audio API, без ассетов.
 * Каждый звук синтезируется: шумовые буферы (white/pink/brown),
 * фильтры, LFO-модуляции, редкие событийные звуки (птицы, чашки).
 * Одновременно — до 3 слоёв, у каждого своя громкость.
 * ============================================================ */

import type { IconName } from "../../components/icons";

export type AmbientId = "rain" | "cafe" | "library" | "white_noise" | "forest" | "waves";

export const AMBIENTS: { id: AmbientId; label: string; icon: IconName; desc: string }[] = [
  { id: "rain", label: "Дождь", icon: "cloud", desc: "мягкий ливень за окном" },
  { id: "cafe", label: "Кафе", icon: "coffee", desc: "гул голосов и посуды" },
  { id: "library", label: "Библиотека", icon: "book", desc: "тишина и страницы" },
  { id: "white_noise", label: "Белый шум", icon: "sliders", desc: "ровный широкополосный" },
  { id: "forest", label: "Лес", icon: "spark", desc: "ветер и птицы" },
  { id: "waves", label: "Волны", icon: "pulse", desc: "медленный прибой" },
];

export const MAX_LAYERS = 3;

interface Layer {
  gain: GainNode;
  cleanup: () => void;
}

type NoiseKind = "white" | "pink" | "brown";

class AmbientEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<NoiseKind, AudioBuffer>();
  private layers = new Map<AmbientId, Layer>();
  private eventTimers = new Map<AmbientId, number[]>();

  /* ---------- инфраструктура ---------- */

  private audio(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private noiseBuffer(kind: NoiseKind): AudioBuffer {
    const ctx = this.audio();
    const cached = this.buffers.get(kind);
    if (cached) return cached;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    if (kind === "white") {
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } else if (kind === "pink") {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    } else {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        data[i] = last * 3.5;
      }
    }
    this.buffers.set(kind, buf);
    return buf;
  }

  private noiseSource(kind: NoiseKind): AudioBufferSourceNode {
    const ctx = this.audio();
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(kind);
    src.loop = true;
    return src;
  }

  /* ---------- управление слоями ---------- */

  active(): AmbientId[] {
    return [...this.layers.keys()];
  }

  isPlaying(id: AmbientId): boolean {
    return this.layers.has(id);
  }

  /** true — слой запущен; false — лимит слоёв */
  start(id: AmbientId, volume = 0.5): boolean {
    if (this.layers.has(id)) return true;
    if (this.layers.size >= MAX_LAYERS) return false;
    const ctx = this.audio();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master!);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 1.2);
    const stops: (() => void)[] = [];
    const timers: number[] = [];

    const build = () => {
      if (id === "rain") {
        const body = this.noiseSource("pink");
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 1300;
        body.connect(lp).connect(gain);
        body.start();
        const patter = this.noiseSource("white");
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 4200;
        bp.Q.value = 0.6;
        const pg = ctx.createGain();
        pg.gain.value = 0.07;
        patter.connect(bp).connect(pg).connect(gain);
        patter.start();
        stops.push(() => { body.stop(); patter.stop(); });
      } else if (id === "waves") {
        const src = this.noiseSource("brown");
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 340;
        src.connect(lp).connect(gain);
        src.start();
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.07;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.3;
        lfo.connect(lfoGain).connect(gain.gain);
        lfo.start();
        gain.gain.value = 0;
        gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 1.5);
        stops.push(() => { src.stop(); lfo.stop(); });
      } else if (id === "white_noise") {
        const src = this.noiseSource("white");
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 7500;
        const g = ctx.createGain();
        g.gain.value = 0.16;
        src.connect(lp).connect(g).connect(gain);
        src.start();
        stops.push(() => src.stop());
      } else if (id === "forest") {
        const wind = this.noiseSource("pink");
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 5200;
        const wg = ctx.createGain();
        wg.gain.value = 0.06;
        wind.connect(hp).connect(wg).connect(gain);
        wind.start();
        stops.push(() => wind.stop());
        const chirp = () => {
          if (!this.layers.has(id)) return;
          const c = this.audio();
          const o = c.createOscillator();
          const g = c.createGain();
          const t = c.currentTime;
          const f = 2300 + Math.random() * 1400;
          o.frequency.setValueAtTime(f, t);
          o.frequency.exponentialRampToValueAtTime(f * 1.45, t + 0.1);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.05, t + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
          o.connect(g).connect(gain);
          o.start(t);
          o.stop(t + 0.25);
          if (Math.random() > 0.4) {
            const o2 = c.createOscillator();
            const g2 = c.createGain();
            o2.frequency.setValueAtTime(f * 0.82, t + 0.28);
            o2.frequency.exponentialRampToValueAtTime(f * 1.1, t + 0.4);
            g2.gain.setValueAtTime(0, t + 0.28);
            g2.gain.linearRampToValueAtTime(0.04, t + 0.3);
            g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
            o2.connect(g2).connect(gain);
            o2.start(t + 0.28);
            o2.stop(t + 0.55);
          }
          timers.push(window.setTimeout(chirp, 3500 + Math.random() * 6000));
        };
        timers.push(window.setTimeout(chirp, 1200));
      } else if (id === "cafe") {
        const rumble = this.noiseSource("brown");
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 260;
        const rg = ctx.createGain();
        rg.gain.value = 0.5;
        rumble.connect(lp).connect(rg).connect(gain);
        rumble.start();
        const murmur = this.noiseSource("pink");
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 750;
        bp.Q.value = 0.9;
        const mg = ctx.createGain();
        mg.gain.value = 0.1;
        murmur.connect(bp).connect(mg).connect(gain);
        murmur.start();
        stops.push(() => { rumble.stop(); murmur.stop(); });
        const clink = () => {
          if (!this.layers.has(id)) return;
          const c = this.audio();
          const o = c.createOscillator();
          const g = c.createGain();
          const t = c.currentTime;
          o.type = "triangle";
          o.frequency.value = 1750 + Math.random() * 700;
          g.gain.setValueAtTime(0.05, t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
          o.connect(g).connect(gain);
          o.start(t);
          o.stop(t + 0.3);
          timers.push(window.setTimeout(clink, 5000 + Math.random() * 9000));
        };
        timers.push(window.setTimeout(clink, 2500));
      } else {
        /* library */
        const hum = this.noiseSource("brown");
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 200;
        const hg = ctx.createGain();
        hg.gain.value = 0.22;
        hum.connect(lp).connect(hg).connect(gain);
        hum.start();
        stops.push(() => hum.stop());
        const page = () => {
          if (!this.layers.has(id)) return;
          const c = this.audio();
          const src = c.createBufferSource();
          src.buffer = this.noiseBuffer("white");
          const hp = c.createBiquadFilter();
          hp.type = "highpass";
          hp.frequency.value = 1300;
          const g = c.createGain();
          const t = c.currentTime;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.06, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
          src.connect(hp).connect(g).connect(gain);
          src.start(t);
          src.stop(t + 0.2);
          timers.push(window.setTimeout(page, 8000 + Math.random() * 14000));
        };
        timers.push(window.setTimeout(page, 4000));
      }
    };

    build();
    this.eventTimers.set(id, timers);
    this.layers.set(id, { gain, cleanup: () => stops.forEach((fn) => fn()) });
    return true;
  }

  setVolume(id: AmbientId, v: number) {
    const layer = this.layers.get(id);
    if (!layer || !this.ctx) return;
    layer.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    layer.gain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, v)), this.ctx.currentTime + 0.15);
  }

  stop(id: AmbientId) {
    const layer = this.layers.get(id);
    if (!layer || !this.ctx) return;
    const t = this.ctx.currentTime;
    layer.gain.gain.cancelScheduledValues(t);
    layer.gain.gain.setValueAtTime(layer.gain.gain.value, t);
    layer.gain.gain.linearRampToValueAtTime(0, t + 0.5);
    const timers = this.eventTimers.get(id) ?? [];
    timers.forEach(clearTimeout);
    this.eventTimers.delete(id);
    this.layers.delete(id);
    window.setTimeout(() => layer.cleanup(), 600);
  }

  stopAll() {
    this.active().forEach((id) => this.stop(id));
  }

  /** Плавное приглушение/восстановление всей шины (пауза → 0.2, перерыв → 0.8, mute → 0). */
  duck(factor: number) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0.9 * Math.max(0, Math.min(1, factor)), t + 0.6);
  }

  /* ---------- колокольчики ---------- */

  private tone(freq: number, at: number, dur: number, vol: number) {
    const ctx = this.audio();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.master ?? ctx.destination);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  bell(kind: "phase" | "end") {
    try {
      const ctx = this.audio();
      const t = ctx.currentTime;
      if (kind === "phase") {
        this.tone(740, t, 1.0, 0.12);
        this.tone(1108, t + 0.02, 0.8, 0.05);
      } else {
        this.tone(659, t, 1.2, 0.14);
        this.tone(880, t + 0.22, 1.2, 0.13);
        this.tone(1318, t + 0.44, 1.6, 0.11);
      }
    } catch {
      /* аудио недоступно — остаётся визуальное оповещение */
    }
  }

  haptic(pattern: number[] = [70, 40, 70]) {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* не поддерживается */
    }
  }
}

export const ambient = new AmbientEngine();
