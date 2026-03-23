import { BaseProvider } from "./base.js";
import { config } from "../config.js";
import type {
  Asset,
  Category,
  DownloadResult,
  SearchParams,
  SearchResult,
  SourceStatus,
} from "../types/assets.js";

interface FreesoundSearchResult {
  count: number;
  results: FreesoundSound[];
}

interface FreesoundSound {
  id: number;
  name: string;
  description: string;
  tags: string[];
  license: string;
  username: string;
  previews?: Record<string, string>;
  download?: string;
  url: string;
  type: string;
  filesize: number;
  created: string;
}

export class FreesoundProvider extends BaseProvider {
  readonly source = "freesound" as const;
  private baseUrl = "https://freesound.org/apiv2";

  async search(params: SearchParams): Promise<SearchResult> {
    if (!config.freesoundApiKey) {
      return { assets: [], total: 0, offset: params.offset, limit: params.limit };
    }

    const cacheKey = `freesound:search:${JSON.stringify(params)}`;
    const cached = this.cache.get<SearchResult>(cacheKey);
    if (cached) return cached;

    const queryParts = [params.query];
    if (params.tags?.length) queryParts.push(...params.tags);

    const url = new URL(`${this.baseUrl}/search/text/`);
    url.searchParams.set("query", queryParts.join(" "));
    url.searchParams.set("page_size", String(params.limit));
    url.searchParams.set("page", String(Math.floor(params.offset / params.limit) + 1));
    url.searchParams.set("fields", "id,name,description,tags,license,username,previews,download,url,type,filesize,created");
    url.searchParams.set("token", config.freesoundApiKey);

    const data = await this.fetchJson<FreesoundSearchResult>(url.toString());

    const assets: Asset[] = data.results.map((s) => this.mapSound(s));
    const result: SearchResult = {
      assets,
      total: data.count,
      offset: params.offset,
      limit: params.limit,
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  async getDetails(id: string): Promise<Asset | null> {
    if (!config.freesoundApiKey) return null;

    const rawId = this.stripPrefix(id);
    const cacheKey = `freesound:detail:${rawId}`;
    const cached = this.cache.get<Asset>(cacheKey);
    if (cached) return cached;

    try {
      const url = `${this.baseUrl}/sounds/${rawId}/?fields=id,name,description,tags,license,username,previews,download,url,type,filesize,created&token=${config.freesoundApiKey}`;
      const data = await this.fetchJson<FreesoundSound>(url);
      const asset = this.mapSound(data);
      this.cache.set(cacheKey, asset);
      return asset;
    } catch {
      return null;
    }
  }

  async download(id: string, destPath: string): Promise<DownloadResult> {
    if (!config.freesoundApiKey) {
      return { success: false, error: "Freesound API key not configured" };
    }

    const rawId = this.stripPrefix(id);
    try {
      const url = `${this.baseUrl}/sounds/${rawId}/download/?token=${config.freesoundApiKey}`;
      await this.downloadFile(url, destPath);
      return { success: true, filePath: destPath };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async getCategories(): Promise<Category[]> {
    return [
      { name: "sound-effects", source: "freesound" },
      { name: "ambient", source: "freesound" },
      { name: "music", source: "freesound" },
      { name: "voice", source: "freesound" },
      { name: "nature", source: "freesound" },
      { name: "instruments", source: "freesound" },
    ];
  }

  async getStatus(): Promise<SourceStatus> {
    return {
      source: "freesound",
      available: !!config.freesoundApiKey,
      description: "Freesound.org — collaborative database of Creative Commons licensed sounds",
      url: "https://freesound.org",
    };
  }

  private mapSound(s: FreesoundSound): Asset {
    return {
      id: this.prefixId(String(s.id)),
      source: "freesound",
      title: s.name,
      description: s.description,
      type: "sound",
      tags: s.tags,
      license: this.mapLicense(s.license),
      author: s.username,
      previewUrl: s.previews?.["preview-hq-mp3"] || s.previews?.["preview-lq-mp3"],
      downloadUrl: s.download,
      pageUrl: s.url,
      fileFormat: s.type,
      fileSize: s.filesize,
      createdAt: s.created,
    };
  }

  private mapLicense(license: string): Asset["license"] {
    if (license.includes("Creative Commons 0")) return "CC0";
    if (license.includes("Attribution Noncommercial")) return "CC-BY-NC";
    if (license.includes("Attribution")) return "CC-BY";
    return "unknown";
  }
}
