import type { FastifyInstance } from "fastify";
import { config } from "../../config.js";

interface DetectRequest {
  imageBase64: string;
  mimeType: string;
  fileName?: string;
  imageWidth: number;
  imageHeight: number;
}

interface DetectedParams {
  frameW: number;
  frameH: number;
  offsetX: number;
  offsetY: number;
  fps: number;
  detail: string;
}

const PROMPT = `You are a sprite sheet analyzer. You receive an image of a game sprite sheet.

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
{"frameW": N, "frameH": N, "offsetX": N, "offsetY": N, "fps": N, "detail": "brief description of what you detected"}`;

export function registerAiDetectRoute(app: FastifyInstance) {
  app.post("/api/v1/ai/detect-spritesheet", {
    schema: {
      tags: ["ai"],
      summary: "Use AI vision to detect spritesheet frame parameters",
    },
    handler: async (request, reply) => {
      if (!config.openaiApiKey) {
        return reply.code(503).send({ error: "OPENAI_API_KEY not configured" });
      }

      const body = request.body as DetectRequest;
      if (!body.imageBase64 || !body.mimeType) {
        return reply.code(400).send({ error: "imageBase64 and mimeType required" });
      }

      try {
        const result = await callOpenAI(body);
        return reply.send(result);
      } catch (err) {
        return reply.code(502).send({ error: `AI detection failed: ${err}` });
      }
    },
  });
}

async function callOpenAI(body: DetectRequest): Promise<DetectedParams> {
  const dataUrl = `data:${body.mimeType};base64,${body.imageBase64}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${PROMPT}\n\nImage dimensions: ${body.imageWidth}x${body.imageHeight} pixels${body.fileName ? `, filename: ${body.fileName}` : ""}`,
            },
            {
              type: "image_url",
              image_url: { url: dataUrl, detail: "high" },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${errBody}`);
  }

  const data = await res.json() as any;
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Empty response from OpenAI");

  // Parse JSON from response (strip markdown fences if present)
  const jsonStr = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(jsonStr);

  return {
    frameW: Number(parsed.frameW) || 32,
    frameH: Number(parsed.frameH) || 32,
    offsetX: Number(parsed.offsetX) || 0,
    offsetY: Number(parsed.offsetY) || 0,
    fps: Number(parsed.fps) || 10,
    detail: parsed.detail || "AI detected",
  };
}
