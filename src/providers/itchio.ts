import * as cheerio from "cheerio";
import { BaseProvider } from "./base.js";
import type {
  Asset,
  AssetType,
  Category,
  DownloadResult,
  SearchParams,
  SearchResult,
  SourceStatus,
} from "../types/assets.js";

export class ItchioProvider extends BaseProvider {
  readonly source = "itchio" as const;
  private baseUrl = "https://itch.io";

  async search(params: SearchParams): Promise<SearchResult> {
    const cacheKey = `itchio:search:${JSON.stringify(params)}`;
    const cached = this.cache.get<SearchResult>(cacheKey);
    if (cached) return cached;

    try {
      const typeTag = params.type ? this.mapTypeTag(params.type) : "";
      const url = `${this.baseUrl}/game-assets/free${typeTag}?q=${encodeURIComponent(params.query)}&page=${Math.floor(params.offset / params.limit) + 1}`;

      const html = await this.fetchHtml(url);
      const $ = cheerio.load(html);
      const assets: Asset[] = [];

      $(".game_cell").each((_, el) => {
        const $el = $(el);
        const titleEl = $el.find(".title a, .game_title a").first();
        const title = titleEl.text().trim();
        const href = titleEl.attr("href");
        if (!title || !href) return;

        const rawId = this.extractItchioId(href);
        const img = $el.find("img").first().attr("data-lazy_src") || $el.find("img").first().attr("src");
        const author = $el.find(".game_author a").first().text().trim();

        assets.push({
          id: this.prefixId(rawId),
          source: "itchio",
          title,
          type: params.type || "other",
          tags: [],
          license: "unknown",
          author: author || undefined,
          previewUrl: img || undefined,
          pageUrl: href,
        });
      });

      const result: SearchResult = {
        assets: assets.slice(0, params.limit),
        total: assets.length,
        offset: params.offset,
        limit: params.limit,
      };

      this.cache.set(cacheKey, result);
      return result;
    } catch {
      return { assets: [], total: 0, offset: params.offset, limit: params.limit };
    }
  }

  async getDetails(id: string): Promise<Asset | null> {
    const rawId = this.stripPrefix(id);
    const cacheKey = `itchio:detail:${rawId}`;
    const cached = this.cache.get<Asset>(cacheKey);
    if (cached) return cached;

    try {
      const pageUrl = this.idToUrl(rawId);
      const html = await this.fetchHtml(pageUrl);
      const $ = cheerio.load(html);

      const title = $(".game_title, h1.object_title").first().text().trim();
      if (!title) return null;

      const description = $(".formatted_description, .object_description").first().text().trim();
      const author = $(".game_author a").first().text().trim();
      const img = $(".screenshot_list img, .header img").first().attr("src");
      const tags: string[] = [];
      $(".game_info_panel_widget a[href*='/game-assets/tag-']").each((_, el) => {
        tags.push($(el).text().trim());
      });

      // Get download URL via itch.io's download_url API
      const downloadUrl = await this.resolveDownloadUrl(pageUrl);

      const asset: Asset = {
        id: this.prefixId(rawId),
        source: "itchio",
        title,
        description: description || undefined,
        type: this.guessType(tags, title),
        tags,
        license: "unknown",
        author: author || undefined,
        previewUrl: img || undefined,
        downloadUrl: downloadUrl || undefined,
        pageUrl,
      };

      this.cache.set(cacheKey, asset);
      return asset;
    } catch {
      return null;
    }
  }

  async download(id: string, destPath: string): Promise<DownloadResult> {
    try {
      const asset = await this.getDetails(id);
      if (!asset?.downloadUrl) {
        return { success: false, error: "Could not resolve download URL" };
      }
      await this.downloadFile(asset.downloadUrl, destPath);
      return { success: true, filePath: destPath };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async getCategories(): Promise<Category[]> {
    return [
      { name: "Sprites", source: "itchio" },
      { name: "3D Models", source: "itchio" },
      { name: "Sound Effects", source: "itchio" },
      { name: "Music", source: "itchio" },
      { name: "Tilesets", source: "itchio" },
      { name: "Fonts", source: "itchio" },
      { name: "Textures", source: "itchio" },
    ];
  }

  async getStatus(): Promise<SourceStatus> {
    return {
      source: "itchio",
      available: true,
      description: "itch.io — free game assets marketplace",
      url: `${this.baseUrl}/game-assets/free`,
    };
  }

  /**
   * itch.io free assets have a /download_url POST endpoint that returns
   * a temporary download page URL. From that page we extract the upload_id
   * and build a direct file download URL.
   */
  private async resolveDownloadUrl(pageUrl: string): Promise<string | null> {
    try {
      // Step 1: Get download page URL
      const res = await fetch(`${pageUrl}/download_url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "FreeGameAssetMCP/1.0",
        },
      });
      if (!res.ok) return null;

      const data = await res.json() as { url?: string };
      if (!data.url) return null;

      // Step 2: Fetch the download page to find upload_id and file info
      const downloadPageHtml = await this.fetchHtml(data.url);
      const $ = cheerio.load(downloadPageHtml);

      const uploadId = $("[data-upload_id]").first().attr("data-upload_id");
      if (!uploadId) return null;

      // Build the file download URL
      // Extract the download token from the URL path
      const urlMatch = data.url.match(/\/download\/(.+)$/);
      if (!urlMatch) return null;

      return `${pageUrl}/file/${uploadId}?source=download&key=${urlMatch[1]}`;
    } catch {
      return null;
    }
  }

  private mapTypeTag(type: AssetType): string {
    const map: Record<string, string> = {
      sprite: "/tag-sprites",
      "3d_model": "/tag-3d",
      sound: "/tag-sound-effects",
      music: "/tag-music",
      tilemap: "/tag-tilemap",
      texture: "/tag-textures",
      font: "/tag-fonts",
    };
    return map[type] || "";
  }

  private extractItchioId(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.hostname}${parsed.pathname}`.replace(/\/$/, "");
    } catch {
      return url.replace(/https?:\/\//, "").replace(/\/$/, "");
    }
  }

  private idToUrl(rawId: string): string {
    return `https://${rawId}`;
  }

  private guessType(tags: string[], title: string): AssetType {
    const text = [...tags, title].join(" ").toLowerCase();
    if (text.includes("sprite")) return "sprite";
    if (text.includes("3d") || text.includes("model")) return "3d_model";
    if (text.includes("sound") || text.includes("sfx")) return "sound";
    if (text.includes("music") || text.includes("ost")) return "music";
    if (text.includes("tile") || text.includes("tilemap")) return "tilemap";
    if (text.includes("texture")) return "texture";
    if (text.includes("font")) return "font";
    return "other";
  }
}
