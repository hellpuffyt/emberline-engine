/** Renderer interface plus a recording renderer for tests. The Canvas2D
 * implementation lives in canvas.ts so this module stays DOM-free. */

export interface ImageRef {
  name: string;
  w: number;
  h: number;
  /** Backend handle (HTMLImageElement in the browser, undefined headless). */
  handle?: unknown;
}

export interface TextStyle {
  size?: number;
  color?: string;
  font?: string;
  align?: 'left' | 'center' | 'right';
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Renderer {
  size(): { w: number; h: number };
  clear(color: string): void;
  camera(cam: Camera): void;
  /** Draw in screen space (UI) regardless of camera until the next camera() call. */
  screenSpace(): void;
  rect(x: number, y: number, w: number, h: number, color: string): void;
  sprite(img: ImageRef, x: number, y: number, w?: number, h?: number, sx?: number, sy?: number, sw?: number, sh?: number, flipX?: boolean): void;
  text(str: string, x: number, y: number, style?: TextStyle): void;
}

export interface DrawCall {
  op: 'clear' | 'camera' | 'screen' | 'rect' | 'sprite' | 'text';
  args: unknown[];
}

/** Records draw calls; used by tests and the headless demo run. */
export class NullRenderer implements Renderer {
  calls: DrawCall[] = [];
  constructor(
    private w = 800,
    private h = 450,
  ) {}
  size(): { w: number; h: number } {
    return { w: this.w, h: this.h };
  }
  clear(color: string): void {
    this.calls = [{ op: 'clear', args: [color] }];
  }
  camera(cam: Camera): void {
    this.calls.push({ op: 'camera', args: [{ ...cam }] });
  }
  screenSpace(): void {
    this.calls.push({ op: 'screen', args: [] });
  }
  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.calls.push({ op: 'rect', args: [x, y, w, h, color] });
  }
  sprite(img: ImageRef, x: number, y: number, w?: number, h?: number): void {
    this.calls.push({ op: 'sprite', args: [img.name, x, y, w ?? img.w, h ?? img.h] });
  }
  text(str: string, x: number, y: number, style?: TextStyle): void {
    this.calls.push({ op: 'text', args: [str, x, y, style ?? {}] });
  }
  count(op: DrawCall['op']): number {
    return this.calls.filter((c) => c.op === op).length;
  }
}
