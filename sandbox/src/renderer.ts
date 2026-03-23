export type Background = "checker" | "black" | "white" | "green";

export class SpriteRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private image: HTMLImageElement | null = null;
  private zoom = 4;
  private bg: Background = "checker";
  private offsetX = 0;
  private offsetY = 0;

  // Spritesheet animation state
  private frameW = 32;
  private frameH = 32;
  private cols = 1;
  private rows = 1;
  private totalFrames = 1;
  private currentFrame = 0;
  private playing = false;
  private fps = 10;
  private animId = 0;
  private lastFrameTime = 0;
  private mode: "static" | "spritesheet" = "static";

  onChange: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
  }

  async loadImage(url: string): Promise<void> {
    this.stop();
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = url;
    });
    this.image = img;
    this.recalcFrames();
    this.currentFrame = 0;
    this.render();
  }

  setMode(mode: "static" | "spritesheet") {
    this.mode = mode;
    if (mode === "static") this.stop();
    this.recalcFrames();
    this.currentFrame = 0;
    this.render();
  }

  setFrameSize(w: number, h: number) {
    this.frameW = Math.max(1, w);
    this.frameH = Math.max(1, h);
    this.recalcFrames();
    this.currentFrame = 0;
    this.render();
  }

  setFps(fps: number) {
    this.fps = Math.max(1, Math.min(60, fps));
  }

  setZoom(z: number) {
    this.zoom = z;
    this.render();
  }

  setBg(bg: Background) {
    this.bg = bg;
    this.render();
  }

  getImage(): HTMLImageElement | null {
    return this.image;
  }

  setOffset(x: number, y: number) {
    this.offsetX = x;
    this.offsetY = y;
    this.recalcFrames();
    this.currentFrame = 0;
    this.render();
  }

  getState() {
    return {
      totalFrames: this.totalFrames,
      currentFrame: this.currentFrame,
      playing: this.playing,
      imageW: this.image?.naturalWidth ?? 0,
      imageH: this.image?.naturalHeight ?? 0,
    };
  }

  play() {
    if (this.mode !== "spritesheet" || this.totalFrames <= 1) return;
    this.playing = true;
    this.lastFrameTime = performance.now();
    this.tick();
    this.onChange?.();
  }

  stop() {
    this.playing = false;
    cancelAnimationFrame(this.animId);
    this.onChange?.();
  }

  togglePlay() {
    if (this.playing) this.stop();
    else this.play();
  }

  nextFrame() {
    this.currentFrame = (this.currentFrame + 1) % this.totalFrames;
    this.render();
    this.onChange?.();
  }

  prevFrame() {
    this.currentFrame = (this.currentFrame - 1 + this.totalFrames) % this.totalFrames;
    this.render();
    this.onChange?.();
  }

  private recalcFrames() {
    if (!this.image || this.mode === "static") {
      this.cols = 1;
      this.rows = 1;
      this.totalFrames = 1;
      return;
    }
    const availW = this.image.naturalWidth - this.offsetX;
    const availH = this.image.naturalHeight - this.offsetY;
    this.cols = Math.max(1, Math.floor(availW / this.frameW));
    this.rows = Math.max(1, Math.floor(availH / this.frameH));
    this.totalFrames = this.cols * this.rows;
    if (this.currentFrame >= this.totalFrames) this.currentFrame = 0;
    this.onChange?.();
  }

  private tick() {
    if (!this.playing) return;
    this.animId = requestAnimationFrame((now) => {
      const elapsed = now - this.lastFrameTime;
      const interval = 1000 / this.fps;
      if (elapsed >= interval) {
        this.currentFrame = (this.currentFrame + 1) % this.totalFrames;
        this.lastFrameTime = now - (elapsed % interval);
        this.render();
        this.onChange?.();
      }
      this.tick();
    });
  }

  render() {
    if (!this.image) return;

    const z = this.zoom;
    let drawW: number, drawH: number;
    let sx: number, sy: number, sw: number, sh: number;

    if (this.mode === "spritesheet") {
      const col = this.currentFrame % this.cols;
      const row = Math.floor(this.currentFrame / this.cols);
      sx = this.offsetX + col * this.frameW;
      sy = this.offsetY + row * this.frameH;
      sw = this.frameW;
      sh = this.frameH;
      drawW = this.frameW * z;
      drawH = this.frameH * z;
    } else {
      sx = 0;
      sy = 0;
      sw = this.image.naturalWidth;
      sh = this.image.naturalHeight;
      drawW = sw * z;
      drawH = sh * z;
    }

    this.canvas.width = drawW;
    this.canvas.height = drawH;
    this.ctx.imageSmoothingEnabled = false;

    // Background
    this.drawBackground(drawW, drawH);

    // Sprite
    this.ctx.drawImage(this.image, sx, sy, sw, sh, 0, 0, drawW, drawH);
  }

  private drawBackground(w: number, h: number) {
    switch (this.bg) {
      case "black":
        this.ctx.fillStyle = "#000";
        this.ctx.fillRect(0, 0, w, h);
        break;
      case "white":
        this.ctx.fillStyle = "#fff";
        this.ctx.fillRect(0, 0, w, h);
        break;
      case "green":
        this.ctx.fillStyle = "#00ff00";
        this.ctx.fillRect(0, 0, w, h);
        break;
      case "checker": {
        const size = Math.max(8, this.zoom * 4);
        for (let y = 0; y < h; y += size) {
          for (let x = 0; x < w; x += size) {
            const dark = ((x / size) + (y / size)) % 2 === 0;
            this.ctx.fillStyle = dark ? "#1a1a24" : "#12121a";
            this.ctx.fillRect(x, y, size, size);
          }
        }
        break;
      }
    }
  }
}
