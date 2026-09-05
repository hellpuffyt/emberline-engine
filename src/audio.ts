/** Audio is a side effect, not simulation state: scenes react to events
 * after a tick and ask the audio backend to play. The Null backend records
 * what would have played, which is what tests and headless runs use. */

export interface PlayOptions {
  volume?: number;
  /** Playback rate multiplier (pitch). */
  rate?: number;
  loop?: boolean;
}

export interface Audio {
  play(name: string, opts?: PlayOptions): void;
  stopAll(): void;
  setVolume(v: number): void;
  readonly volume: number;
}

export class NullAudio implements Audio {
  played: Array<{ name: string; opts: PlayOptions }> = [];
  volume = 1;
  play(name: string, opts: PlayOptions = {}): void {
    this.played.push({ name, opts });
  }
  stopAll(): void {
    this.played.length = 0;
  }
  setVolume(v: number): void {
    this.volume = v;
  }
}

/** Web Audio backend. Sounds are decoded lazily on first play from the
 * ArrayBuffers the asset loader fetched. Created on first user gesture. */
export class WebAudio implements Audio {
  private ctx?: AudioContext;
  private gain?: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private playing = new Set<AudioBufferSourceNode>();
  volume = 1;

  constructor(private readonly lookup: (name: string) => unknown) {}

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  play(name: string, opts: PlayOptions = {}): void {
    const ctx = this.ensure();
    const start = (buf: AudioBuffer): void => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = opts.rate ?? 1;
      src.loop = opts.loop ?? false;
      const g = ctx.createGain();
      g.gain.value = opts.volume ?? 1;
      src.connect(g).connect(this.gain!);
      src.onended = () => this.playing.delete(src);
      this.playing.add(src);
      src.start();
    };
    const cached = this.buffers.get(name);
    if (cached) return start(cached);
    const raw = this.lookup(name);
    if (!(raw instanceof ArrayBuffer)) return;
    void ctx.decodeAudioData(raw.slice(0)).then((buf) => {
      this.buffers.set(name, buf);
      start(buf);
    });
  }

  stopAll(): void {
    for (const s of this.playing) s.stop();
    this.playing.clear();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.gain) this.gain.gain.value = v;
  }
}
