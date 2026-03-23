import { getContentList, getFileUrl, type Asset, type ContentFile } from "./api";

export interface DetectedParams {
  frameW: number;
  frameH: number;
  offsetX: number;
  offsetY: number;
  fps: number;
  source: "ai" | "manifest" | "heuristic";
  detail?: string;
}

// --- Entry point ---

export async function autoDetect(
  image: HTMLImageElement,
  asset: Asset | null,
  currentFile: string | null,
): Promise<DetectedParams> {
  // 1. Try AI vision
  const fromAI = await tryAiDetect(image, currentFile);
  if (fromAI) return fromAI;

  // 2. Try manifest files from asset
  if (asset) {
    const fromManifest = await tryManifest(asset, currentFile);
    if (fromManifest) return fromManifest;
  }

  // 3. Simple fallback
  return fallback(image);
}

// --- 1. AI vision detection ---

async function tryAiDetect(image: HTMLImageElement, currentFile: string | null): Promise<DetectedParams | null> {
  try {
    const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const buffer = await blob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

    const res = await fetch("/api/v1/ai/detect-spritesheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: base64,
        mimeType: "image/png",
        fileName: currentFile?.split("/").pop() || undefined,
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    return {
      frameW: data.frameW,
      frameH: data.frameH,
      offsetX: data.offsetX,
      offsetY: data.offsetY,
      fps: data.fps,
      source: "ai",
      detail: data.detail,
    };
  } catch {
    return null;
  }
}

// --- 2. Manifest parsing ---

async function tryManifest(asset: Asset, currentFile: string | null): Promise<DetectedParams | null> {
  try {
    const content = await getContentList(asset.id);
    const manifestFiles = content.files.filter((f) =>
      /\.(json|xml)$/i.test(f.path),
    );

    for (const mf of manifestFiles) {
      const result = await tryParseManifest(asset, mf, currentFile);
      if (result) return result;
    }
  } catch {
    // ignore
  }
  return null;
}

async function tryParseManifest(
  asset: Asset,
  file: ContentFile,
  _currentFile: string | null,
): Promise<DetectedParams | null> {
  try {
    const url = getFileUrl(asset.id, file.path);
    const res = await fetch(url);
    const text = await res.text();

    if (file.path.endsWith(".json")) return parseJsonManifest(text, file.path);
    if (file.path.endsWith(".xml")) return parseXmlManifest(text, file.path);
  } catch {
    // ignore
  }
  return null;
}

function parseJsonManifest(text: string, path: string): DetectedParams | null {
  try {
    const data = JSON.parse(text);

    // Aseprite: { frames: [...] or {name: {frame:{x,y,w,h}}} }
    if (data.frames) {
      const frames = Array.isArray(data.frames)
        ? data.frames.map((f: any) => f.frame).filter(Boolean)
        : Object.values(data.frames).map((f: any) => (f as any).frame).filter(Boolean);

      if (frames.length > 0) {
        const w = frames[0].w, h = frames[0].h;
        if (frames.every((f: any) => f.w === w && f.h === h)) {
          const first: any = Array.isArray(data.frames) ? data.frames[0] : Object.values(data.frames)[0];
          const fps = first?.duration ? Math.round(1000 / first.duration) : 10;
          return {
            frameW: w, frameH: h,
            offsetX: Math.min(...frames.map((f: any) => f.x)),
            offsetY: Math.min(...frames.map((f: any) => f.y)),
            fps: Math.max(1, fps),
            source: "manifest",
            detail: `Aseprite/TexturePacker (${path})`,
          };
        }
      }
    }

    // Generic: frameWidth/tilewidth etc
    const fw = data.frameWidth ?? data.frame_width ?? data.tilewidth ?? data.tileWidth;
    const fh = data.frameHeight ?? data.frame_height ?? data.tileheight ?? data.tileHeight;
    if (typeof fw === "number" && typeof fh === "number" && fw > 0 && fh > 0) {
      return {
        frameW: fw, frameH: fh,
        offsetX: 0, offsetY: 0,
        fps: data.fps ?? 10,
        source: "manifest",
        detail: `JSON metadata (${path})`,
      };
    }
  } catch { /* ignore */ }
  return null;
}

function parseXmlManifest(text: string, path: string): DetectedParams | null {
  const doc = new DOMParser().parseFromString(text, "text/xml");

  const sub = doc.querySelector("SubTexture, sprite, spr");
  if (sub) {
    const w = Number(sub.getAttribute("width") || sub.getAttribute("w"));
    const h = Number(sub.getAttribute("height") || sub.getAttribute("h"));
    if (w > 0 && h > 0) {
      return { frameW: w, frameH: h, offsetX: 0, offsetY: 0, fps: 10, source: "manifest", detail: `XML atlas (${path})` };
    }
  }

  const map = doc.querySelector("map");
  if (map) {
    const tw = Number(map.getAttribute("tilewidth"));
    const th = Number(map.getAttribute("tileheight"));
    if (tw > 0 && th > 0) {
      return { frameW: tw, frameH: th, offsetX: 0, offsetY: 0, fps: 10, source: "manifest", detail: `Tiled TMX (${path})` };
    }
  }

  return null;
}

// --- 3. Fallback ---

function fallback(image: HTMLImageElement): DetectedParams {
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  return {
    frameW: w,
    frameH: h,
    offsetX: 0,
    offsetY: 0,
    fps: 10,
    source: "heuristic",
    detail: `No detection available, showing full image ${w}x${h}`,
  };
}
