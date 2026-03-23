export interface Asset {
  id: string;
  source: string;
  title: string;
  description?: string;
  type: string;
  tags: string[];
  license: string;
  author?: string;
  previewUrl?: string;
  downloadUrl?: string;
  pageUrl: string;
  fileFormat?: string;
  fileSize?: number;
}

export interface SearchResult {
  assets: Asset[];
  total: number;
  offset: number;
  limit: number;
}

export interface ContentFile {
  path: string;
  size: number;
  mimeType: string;
}

export interface ContentResult {
  type: "single" | "archive";
  files: ContentFile[];
}

export async function searchAssets(
  query: string,
  opts: { source?: string; type?: string; limit?: number; offset?: number } = {},
): Promise<SearchResult> {
  const params = new URLSearchParams({ query });
  if (opts.source) params.set("source", opts.source);
  if (opts.type) params.set("type", opts.type || "sprite");
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.offset) params.set("offset", String(opts.offset));

  const res = await fetch("/api/v1/assets/search?" + params);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

export async function getContentList(assetId: string): Promise<ContentResult> {
  const res = await fetch("/api/v1/assets/content/list/" + encodeURIComponent(assetId));
  if (!res.ok) throw new Error(`Content list failed: ${res.status}`);
  return res.json();
}

export function getFileUrl(assetId: string, filePath: string): string {
  return "/api/v1/assets/content/" + encodeURIComponent(assetId) + "?file=" + encodeURIComponent(filePath);
}
