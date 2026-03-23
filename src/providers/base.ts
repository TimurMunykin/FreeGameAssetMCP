import type { AssetProvider } from "../types/provider.js";
import type {
  Asset,
  AssetSource,
  Category,
  DownloadResult,
  SearchParams,
  SearchResult,
  SourceStatus,
} from "../types/assets.js";
import { TTLCache } from "../services/cache.js";
import { config } from "../config.js";

export abstract class BaseProvider implements AssetProvider {
  abstract readonly source: AssetSource;
  protected cache = new TTLCache(config.cacheTtl);

  abstract search(params: SearchParams): Promise<SearchResult>;
  abstract getDetails(id: string): Promise<Asset | null>;
  abstract download(id: string, destPath: string): Promise<DownloadResult>;
  abstract getCategories(): Promise<Category[]>;
  abstract getStatus(): Promise<SourceStatus>;

  protected prefixId(rawId: string): string {
    return `${this.source}:${rawId}`;
  }

  protected stripPrefix(id: string): string {
    const parts = id.split(":");
    return parts.length > 1 ? parts.slice(1).join(":") : id;
  }

  protected async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...init?.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}: ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  protected async fetchHtml(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html",
        "User-Agent": "FreeGameAssetMCP/1.0",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}: ${response.statusText}`);
    }
    return response.text();
  }

  protected async downloadFile(url: string, destPath: string): Promise<void> {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");

    await mkdir(dirname(destPath), { recursive: true });

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(destPath, buffer);
  }
}
