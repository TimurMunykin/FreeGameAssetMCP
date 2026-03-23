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

export class KenneyProvider extends BaseProvider {
  readonly source = "kenney" as const;
  private baseUrl = "https://kenney.nl";

  async search(params: SearchParams): Promise<SearchResult> {
    const cacheKey = `kenney:search:${JSON.stringify(params)}`;
    const cached = this.cache.get<SearchResult>(cacheKey);
    if (cached) return cached;

    try {
      const url = `${this.baseUrl}/assets/?q=${encodeURIComponent(params.query)}`;
      const html = await this.fetchHtml(url);
      const $ = cheerio.load(html);
      const assets: Asset[] = [];

      $(".asset, .asset-item, article").each((_, el) => {
        const $el = $(el);
        const titleEl = $el.find("a").first();
        const title = titleEl.text().trim() || $el.find("h2, h3").first().text().trim();
        const href = titleEl.attr("href");
        if (!title || !href) return;

        const rawId = href.replace(/.*\/assets\//, "").replace(/\/$/, "");
        if (!rawId) return;

        const img = $el.find("img").first().attr("src");
        const previewUrl = img?.startsWith("http") ? img : img ? `${this.baseUrl}${img}` : undefined;

        assets.push({
          id: this.prefixId(rawId),
          source: "kenney",
          title,
          type: this.guessType(title, rawId),
          tags: [],
          license: "CC0",
          author: "Kenney",
          previewUrl,
          pageUrl: href.startsWith("http") ? href : `${this.baseUrl}${href}`,
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
    const cacheKey = `kenney:detail:${rawId}`;
    const cached = this.cache.get<Asset>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(`${this.baseUrl}/assets/${rawId}/`);
      const $ = cheerio.load(html);

      const title = $("h1").first().text().trim();
      if (!title) return null;

      const description = $(".asset-description, .content p").first().text().trim();
      const img = $("meta[property='og:image']").attr("content")
        || $(".asset-image img, .screenshot img").first().attr("src");
      const previewUrl = img?.startsWith("http") ? img : img ? `${this.baseUrl}${img}` : undefined;

      // Download link is in the #donate-text anchor (direct .zip link)
      let downloadUrl: string | undefined;
      const donateLink = $("#donate-text").attr("href");
      if (donateLink?.includes(".zip")) {
        downloadUrl = donateLink.startsWith("http") ? donateLink : `${this.baseUrl}${donateLink}`;
      }
      if (!downloadUrl) {
        // Fallback: find any .zip link
        $("a[href*='.zip']").each((_, el) => {
          if (!downloadUrl) {
            const href = $(el).attr("href");
            if (href) {
              downloadUrl = href.startsWith("http") ? href : `${this.baseUrl}${href}`;
            }
          }
        });
      }

      const asset: Asset = {
        id: this.prefixId(rawId),
        source: "kenney",
        title,
        description: description || undefined,
        type: this.guessType(title, rawId),
        tags: [],
        license: "CC0",
        author: "Kenney",
        previewUrl,
        downloadUrl,
        pageUrl: `${this.baseUrl}/assets/${rawId}/`,
      };

      this.cache.set(cacheKey, asset);
      return asset;
    } catch {
      return null;
    }
  }

  async download(id: string, destPath: string): Promise<DownloadResult> {
    const rawId = this.stripPrefix(id);
    try {
      const downloadUrl = `${this.baseUrl}/assets/${rawId}/download/`;
      await this.downloadFile(downloadUrl, destPath);
      return { success: true, filePath: destPath };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async getCategories(): Promise<Category[]> {
    return [
      { name: "2D Assets", source: "kenney" },
      { name: "3D Assets", source: "kenney" },
      { name: "Audio", source: "kenney" },
      { name: "UI", source: "kenney" },
      { name: "Tilesets", source: "kenney" },
    ];
  }

  async getStatus(): Promise<SourceStatus> {
    return {
      source: "kenney",
      available: true,
      description: "Kenney.nl — free game assets (CC0 license)",
      url: this.baseUrl,
    };
  }

  private guessType(title: string, id: string): AssetType {
    const text = `${title} ${id}`.toLowerCase();
    if (text.includes("sprite") || text.includes("character") || text.includes("2d")) return "sprite";
    if (text.includes("3d") || text.includes("model")) return "3d_model";
    if (text.includes("sound") || text.includes("audio") || text.includes("sfx")) return "sound";
    if (text.includes("music")) return "music";
    if (text.includes("tile") || text.includes("platformer")) return "tilemap";
    if (text.includes("texture")) return "texture";
    if (text.includes("font") || text.includes("ui")) return "font";
    return "other";
  }
}
