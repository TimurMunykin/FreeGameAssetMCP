import type { FastifyInstance } from "fastify";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  SearchParamsSchema,
  SearchResultSchema,
  AssetSchema,
  DownloadResultSchema,
  CategorySchema,
  SourceStatusSchema,
  AssetSource,
} from "../../types/assets.js";
import { z } from "zod";
import type { AssetService } from "../../services/asset-service.js";
import type { ContentService } from "../../services/content.js";

function extractId(request: { params: unknown }): string {
  const params = request.params as { id?: string; "*"?: string };
  return params.id || params["*"] || "";
}

export function registerAssetRoutes(app: FastifyInstance, assetService: AssetService, contentService: ContentService) {
  app.get("/api/v1/assets/search", {
    schema: {
      tags: ["assets"],
      summary: "Search for free game assets",
      querystring: zodToJsonSchema(SearchParamsSchema),
      response: {
        200: zodToJsonSchema(SearchResultSchema),
      },
    },
    handler: async (request, reply) => {
      const raw = request.query as Record<string, unknown>;
      const params = SearchParamsSchema.parse({
        query: raw.query,
        type: raw.type || undefined,
        source: raw.source || undefined,
        tags: raw.tags ? (Array.isArray(raw.tags) ? raw.tags : [raw.tags]) : undefined,
        license: raw.license || undefined,
        limit: raw.limit ? Number(raw.limit) : undefined,
        offset: raw.offset ? Number(raw.offset) : undefined,
      });
      const result = await assetService.search(params);
      return reply.send(result);
    },
  });

  app.get("/api/v1/assets/details/*", {
    schema: {
      tags: ["assets"],
      summary: "Get asset metadata by ID",
      response: {
        200: zodToJsonSchema(AssetSchema),
        404: zodToJsonSchema(z.object({ error: z.string() })),
      },
    },
    handler: async (request, reply) => {
      const id = extractId(request);
      const asset = await assetService.getDetails(id);
      if (!asset) {
        return reply.code(404).send({ error: "Asset not found" });
      }
      return reply.send(asset);
    },
  });

  // List files inside an asset (useful for archives with many files)
  app.get("/api/v1/assets/content/list/*", {
    schema: {
      tags: ["assets"],
      summary: "List files inside an asset. For archives returns all contained files, for single files returns one entry.",
    },
    handler: async (request, reply) => {
      const id = extractId(request);
      const asset = await assetService.getDetails(id);
      if (!asset) {
        return reply.code(404).send({ error: "Asset not found" });
      }
      try {
        const content = await contentService.getContentList(asset);
        return reply.send(content);
      } catch (err) {
        return reply.code(502).send({ error: `Failed to fetch asset: ${err}` });
      }
    },
  });

  // Serve actual asset file content
  // ?file=path/to/sprite.png — specific file from archive
  // without ?file — returns the first/only file directly
  app.get("/api/v1/assets/content/*", {
    schema: {
      tags: ["assets"],
      summary: "Get actual asset file content. Without ?file param returns first file; with ?file=path returns specific file from archive.",
      querystring: zodToJsonSchema(z.object({
        file: z.string().optional().describe("Path to specific file inside asset (from /content/list/)"),
      })),
    },
    handler: async (request, reply) => {
      const id = extractId(request);
      const query = request.query as { file?: string };

      const asset = await assetService.getDetails(id);
      if (!asset) {
        return reply.code(404).send({ error: "Asset not found" });
      }

      try {
        const result = await contentService.getFile(asset, query.file);
        if (!result) {
          return reply.code(404).send({ error: "File not found in asset" });
        }
        return reply
          .header("Content-Type", result.mimeType)
          .header("Content-Disposition", `inline; filename="${result.fileName}"`)
          .send(result.buffer);
      } catch (err) {
        return reply.code(502).send({ error: `Failed to fetch asset: ${err}` });
      }
    },
  });

  app.post("/api/v1/assets/download", {
    schema: {
      tags: ["assets"],
      summary: "Download an asset to a local path on the server",
      body: zodToJsonSchema(z.object({
        id: z.string().describe("Asset ID (e.g. freesound:12345)"),
        destPath: z.string().describe("Local destination path"),
      })),
      response: {
        200: zodToJsonSchema(DownloadResultSchema),
      },
    },
    handler: async (request, reply) => {
      const { id, destPath } = request.body as { id: string; destPath: string };
      const result = await assetService.download(id, destPath);
      return reply.send(result);
    },
  });

  app.get("/api/v1/categories", {
    schema: {
      tags: ["meta"],
      summary: "List available categories",
      querystring: zodToJsonSchema(z.object({
        source: AssetSource.optional(),
      })),
      response: {
        200: zodToJsonSchema(z.array(CategorySchema)),
      },
    },
    handler: async (request, reply) => {
      const { source } = request.query as { source?: string };
      const parsed = source ? AssetSource.parse(source) : undefined;
      const categories = await assetService.getCategories(parsed);
      return reply.send(categories);
    },
  });

  app.get("/api/v1/sources", {
    schema: {
      tags: ["meta"],
      summary: "List asset sources and status",
      response: {
        200: zodToJsonSchema(z.array(SourceStatusSchema)),
      },
    },
    handler: async (_request, reply) => {
      const sources = await assetService.getSources();
      return reply.send(sources);
    },
  });
}
