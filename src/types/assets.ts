import { z } from "zod";

export const AssetType = z.enum([
  "sprite",
  "3d_model",
  "sound",
  "music",
  "tilemap",
  "texture",
  "font",
  "other",
]);
export type AssetType = z.infer<typeof AssetType>;

export const AssetSource = z.enum([
  "freesound",
  "opengameart",
  "itchio",
  "kenney",
]);
export type AssetSource = z.infer<typeof AssetSource>;

export const License = z.enum([
  "CC0",
  "CC-BY",
  "CC-BY-SA",
  "CC-BY-NC",
  "CC-BY-NC-SA",
  "OGA-BY",
  "MIT",
  "GPL",
  "unknown",
]);
export type License = z.infer<typeof License>;

export const AssetSchema = z.object({
  id: z.string().describe("Provider-prefixed ID (e.g. freesound:12345)"),
  source: AssetSource,
  title: z.string(),
  description: z.string().optional(),
  type: AssetType,
  tags: z.array(z.string()),
  license: License,
  author: z.string().optional(),
  previewUrl: z.string().url().optional(),
  downloadUrl: z.string().url().optional(),
  pageUrl: z.string().url(),
  fileFormat: z.string().optional(),
  fileSize: z.number().optional(),
  createdAt: z.string().optional(),
});
export type Asset = z.infer<typeof AssetSchema>;

export const SearchParamsSchema = z.object({
  query: z.string().describe("Search query"),
  type: AssetType.optional().describe("Filter by asset type"),
  source: AssetSource.optional().describe("Filter by source"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  license: License.optional().describe("Filter by license"),
  limit: z.number().min(1).max(50).default(20).describe("Max results"),
  offset: z.number().min(0).default(0).describe("Pagination offset"),
});
export type SearchParams = z.infer<typeof SearchParamsSchema>;

export const SearchResultSchema = z.object({
  assets: z.array(AssetSchema),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const DownloadResultSchema = z.object({
  success: z.boolean(),
  filePath: z.string().optional(),
  error: z.string().optional(),
});
export type DownloadResult = z.infer<typeof DownloadResultSchema>;

export const CategorySchema = z.object({
  name: z.string(),
  count: z.number().optional(),
  source: AssetSource,
});
export type Category = z.infer<typeof CategorySchema>;

export const SourceStatusSchema = z.object({
  source: AssetSource,
  available: z.boolean(),
  description: z.string(),
  url: z.string().url(),
});
export type SourceStatus = z.infer<typeof SourceStatusSchema>;
