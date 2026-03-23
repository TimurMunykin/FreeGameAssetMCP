import { getContentList, getFileUrl, type Asset, type ContentFile } from "./api";
import { loadSettings } from "./settings";

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

const AI_PROMPT = `You are a sprite sheet analyzer. You receive an image of a game sprite sheet.

Analyze the image and determine the animation frame parameters:
- frameW: width of a single frame in pixels
- frameH: height of a single frame in pixels
- offsetX: x pixel offset where the first frame starts (usually 0)
- offsetY: y pixel offset where the first frame starts (usually 0)
- fps: recommended playback speed (frames per second)

The image dimensions are provided. Look for:
- Grid patterns of repeating character poses / animation frames
- Transparency gaps between frames
- Consistent frame sizes across the sheet
- Whether it's a horizontal strip, vertical strip, or grid

Respond with ONLY a JSON object, no markdown, no explanation:
{"frameW": N, "frameH": N, "offsetX": N, "offsetY": N, "fps": N, "detail": "brief description"}`;

async function imageToBase64(image: HTMLImageElement): Promise<string> {
  const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  const buffer = await blob.arrayBuffer();
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function parseAiResponse(content: string): DetectedParams {
  const jsonStr = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(jsonStr);
  return {
    frameW: Number(parsed.frameW) || 32,
    frameH: Number(parsed.frameH) || 32,
    offsetX: Number(parsed.offsetX) || 0,
    offsetY: Number(parsed.offsetY) || 0,
    fps: Number(parsed.fps) || 10,
    source: "ai",
    detail: parsed.detail || "AI detected",
  };
}

/** Newer models (o-series, gpt-4.5+) require max_completion_tokens instead of max_tokens */
function tokenParam(model: string, n: number): Record<string, number> {
  const usesNew = /^(o[1-9]|gpt-4\.[1-9]|gpt-4\.5|gpt-5|chatgpt-4o-latest)/.test(model);
  return usesNew ? { max_completion_tokens: n } : { max_tokens: n };
}

async function tryAiDetect(image: HTMLImageElement, currentFile: string | null): Promise<DetectedParams | null> {
  const settings = loadSettings();
  if (!settings.openaiApiKey) return null;

  try {
    const base64 = await imageToBase64(image);
    const userText = `${AI_PROMPT}\n\nImage dimensions: ${image.naturalWidth}x${image.naturalHeight} pixels${currentFile ? `, filename: ${currentFile.split("/").pop()}` : ""}`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        ...tokenParam(settings.model, 300),
        messages: [{
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: `data:image/png;base64,${base64}`, detail: "high" } },
          ],
        }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI ${res.status}: ${err}`);
    }

    const data = await res.json() as any;
    return parseAiResponse(data.choices?.[0]?.message?.content || "");
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
