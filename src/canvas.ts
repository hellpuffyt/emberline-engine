/** Canvas2D renderer with a camera, integer pixel snapping for crisp
 * sprites, and a device-pixel-ratio-aware backing store. Browser only. */

import type { Camera, ImageRef, Renderer, TextStyle } from './render.js';

export class CanvasRenderer implements Renderer {
  private ctx: CanvasRenderingContext2D;
  private cam: Camera = { x: 0, y: 0, zoom: 1 };
  private inScreenSpace = true;
  private dpr: number;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly logicalW: number,
    private readonly logicalH: number,
    readonly pixelArt = true,
  ) {
    this.dpr = Math.max(1, Math.floor(globalThis.devicePixelRatio ?? 1));
    canvas.width = logicalW * this.dpr;
    canvas.height = logicalH * this.dpr;
    canvas.style.width = `${logicalW}px`;
    canvas.style.height = `${logicalH}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas2D not available');
    this.ctx = ctx;
    ctx.imageSmoothingEnabled = !pixelArt;
  }

  size(): { w: number; h: number } {
    return { w: this.logicalW, h: this.logicalH };
  }

  clear(color: string): void {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.logicalW, this.logicalH);
    this.inScreenSpace = true;
  }

  camera(cam: Camera): void {
    this.cam = { ...cam };
    this.inScreenSpace = false;
    this.applyTransform();
  }

  screenSpace(): void {
    this.inScreenSpace = true;
    this.applyTransform();
  }

  private applyTransform(): void {
    const d = this.dpr;
    if (this.inScreenSpace) {
      this.ctx.setTransform(d, 0, 0, d, 0, 0);
      return;
    }
    const z = this.cam.zoom * d;
    // Camera position is the world point at the centre of the screen.
    const tx = Math.round((this.logicalW / 2 - this.cam.x * this.cam.zoom) * d);
    const ty = Math.round((this.logicalH / 2 - this.cam.y * this.cam.zoom) * d);
    this.ctx.setTransform(z, 0, 0, z, tx, ty);
  }

  private snap(n: number): number {
    return this.pixelArt ? Math.round(n) : n;
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(this.snap(x), this.snap(y), w, h);
  }

  sprite(img: ImageRef, x: number, y: number, w = img.w, h = img.h, sx = 0, sy = 0, sw = img.w, sh = img.h, flipX = false): void {
    const el = img.handle as CanvasImageSource | undefined;
    if (!el) {
      this.rect(x, y, w, h, '#f0f'); // missing image: loud magenta box
      return;
    }
    if (flipX) {
      this.ctx.save();
      this.ctx.translate(this.snap(x) + w, this.snap(y));
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(el, sx, sy, sw, sh, 0, 0, w, h);
      this.ctx.restore();
    } else {
      this.ctx.drawImage(el, sx, sy, sw, sh, this.snap(x), this.snap(y), w, h);
    }
  }

  text(str: string, x: number, y: number, style: TextStyle = {}): void {
    this.ctx.font = `${style.size ?? 14}px ${style.font ?? 'system-ui, sans-serif'}`;
    this.ctx.fillStyle = style.color ?? '#fff';
    this.ctx.textAlign = style.align ?? 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(str, this.snap(x), this.snap(y));
  }
}
