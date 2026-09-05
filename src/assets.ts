/** Asset pipeline: a manifest describes every image, sound and data file
 * with its dimensions, produced by `tools/pack` from the assets directory
 * (it reads PNG headers, no image library needed). The loader fetches
 * everything up front with progress, so scenes never await mid-frame. */

import type { ImageRef } from './render.js';

export interface Manifest {
  images: Record<string, { src: string; w: number; h: number; frames?: number }>;
  sounds: Record<string, { src: string }>;
  data: Record<string, { src: string }>;
}

/** Reads width/height from a PNG's IHDR chunk. Throws on non-PNG bytes. */
export function readPngSize(bytes: Uint8Array): { w: number; h: number } {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || sig.some((b, i) => bytes[i] !== b)) throw new Error('not a PNG');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') throw new Error('PNG without IHDR');
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
}

/** Builds a manifest from (relative path, bytes) pairs. Names are the file
 * name without extension; `name@N.png` marks a horizontal strip of N frames. */
export function packManifest(files: Array<{ path: string; bytes: Uint8Array }>): Manifest {
  const m: Manifest = { images: {}, sounds: {}, data: {} };
  for (const f of files) {
    const file = f.path.replace(/\\/g, '/').split('/').pop()!;
    const dot = file.lastIndexOf('.');
    const ext = dot >= 0 ? file.slice(dot + 1).toLowerCase() : '';
    let name = dot >= 0 ? file.slice(0, dot) : file;
    if (ext === 'png') {
      const size = readPngSize(f.bytes);
      let frames: number | undefined;
      const at = name.match(/^(.*)@(\d+)$/);
      if (at) {
        name = at[1];
        frames = Number(at[2]);
      }
      m.images[name] = { src: f.path.replace(/\\/g, '/'), w: frames ? size.w / frames : size.w, h: size.h, ...(frames ? { frames } : {}) };
    } else if (ext === 'wav' || ext === 'ogg' || ext === 'mp3') {
      m.sounds[name] = { src: f.path.replace(/\\/g, '/') };
    } else if (ext === 'json') {
      m.data[name] = { src: f.path.replace(/\\/g, '/') };
    }
  }
  return m;
}

export interface AssetBackend {
  loadImage(url: string): Promise<unknown>;
  loadSound(url: string): Promise<unknown>;
  loadData(url: string): Promise<unknown>;
}

/** Headless backend: resolves immediately with no handles. */
export const nullBackend: AssetBackend = {
  loadImage: async () => undefined,
  loadSound: async () => undefined,
  loadData: async () => ({}),
};

export class Assets {
  private images = new Map<string, ImageRef>();
  private sounds = new Map<string, unknown>();
  private dataFiles = new Map<string, unknown>();
  loaded = 0;
  total = 0;

  constructor(
    readonly manifest: Manifest,
    private readonly backend: AssetBackend = nullBackend,
    private readonly baseUrl = '',
  ) {
    this.total = Object.keys(manifest.images).length + Object.keys(manifest.sounds).length + Object.keys(manifest.data).length;
  }

  async load(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const tick = (): void => {
      this.loaded++;
      onProgress?.(this.loaded, this.total);
    };
    const jobs: Promise<void>[] = [];
    for (const [name, img] of Object.entries(this.manifest.images)) {
      jobs.push(
        this.backend.loadImage(this.baseUrl + img.src).then((handle) => {
          this.images.set(name, { name, w: img.w, h: img.h, handle });
          tick();
        }),
      );
    }
    for (const [name, s] of Object.entries(this.manifest.sounds)) {
      jobs.push(
        this.backend.loadSound(this.baseUrl + s.src).then((h) => {
          this.sounds.set(name, h);
          tick();
        }),
      );
    }
    for (const [name, d] of Object.entries(this.manifest.data)) {
      jobs.push(
        this.backend.loadData(this.baseUrl + d.src).then((v) => {
          this.dataFiles.set(name, v);
          tick();
        }),
      );
    }
    await Promise.all(jobs);
  }

  image(name: string): ImageRef {
    const i = this.images.get(name);
    if (!i) throw new Error(`unknown image ${name}`);
    return i;
  }
  /** Sub-rectangle of frame `n` for strip images. */
  frame(name: string, n: number): { sx: number; sy: number; sw: number; sh: number } {
    const img = this.image(name);
    const frames = this.manifest.images[name].frames ?? 1;
    return { sx: (n % frames) * img.w, sy: 0, sw: img.w, sh: img.h };
  }
  sound(name: string): unknown {
    return this.sounds.get(name);
  }
  data<T = unknown>(name: string): T {
    if (!this.dataFiles.has(name)) throw new Error(`unknown data ${name}`);
    return this.dataFiles.get(name) as T;
  }
}

/** Browser backend using Image and fetch. */
export const browserBackend: AssetBackend = {
  loadImage: (url) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`failed to load ${url}`));
      img.src = url;
    }),
  loadSound: (url) => fetch(url).then((r) => r.arrayBuffer()),
  loadData: (url) => fetch(url).then((r) => r.json()),
};
