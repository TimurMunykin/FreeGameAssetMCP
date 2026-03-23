import * as cheerio from "cheerio";
import { BaseProvider } from "./base.js";
import type {
  Asset,
  AssetType,
  Category,
  DownloadResult,
  License,
  SearchParams,
  SearchResult,
  SourceStatus,
} from "../types/assets.js";

export class OpenGameArtProvider extends BaseProvider {
  readonly source = "opengameart" as const;
  private baseUrl = "https://opengameart.org";

  async search(params: SearchParams): Promise<SearchResult> {
    const cacheKey = `oga:search:${JSON.stringify(params)}`;
    const cached = this.cache.get<SearchResult>(cacheKey);
    if (cached) return cached;

    try {
      const url = new URL(`${this.baseUrl}/art-search-advanced`);
      url.searchParams.set("keys", params.query);
      if (params.type) {
        const ogaType = this.mapTypeToOGA(params.type);
        if (ogaType) url.searchParams.set("field_art_type_tid[]", ogaType);
      }
      url.searchParams.set("page", String(Math.floor(params.offset / params.limit)));

      const html = await this.fetchHtml(url.toString());
      const $ = cheerio.load(html);
      const assets: Asset[] = [];

      $(".view-opengameart-search .views-row").each((_, el) => {
        const $el = $(el);
        const titleEl = $el.find(".art-list-title a, h3 a, .field-content a").first();
        const title = titleEl.text().trim();
        const href = titleEl.attr("href");
        if (!title || !href) return;

        const rawId = href.replace("/content/", "").replace(/^\//, "");
        const img = $el.find("img").first().attr("src");

        assets.push({
          id: this.prefixId(rawId),
          source: "opengameart",
          title,
          type: params.type || "other",
          tags: [],
          license: "unknown",
          previewUrl: img || undefined,
          pageUrl: `${this.baseUrl}${href}`,
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
    const cacheKey = `oga:detail:${rawId}`;
    const cached = this.cache.get<Asset>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(`${this.baseUrl}/content/${rawId}`);
      const $ = cheerio.load(html);

      const title = $("h1#page-title, h1.title").first().text().trim();
      if (!title) return null;

      const description = $(".field-name-body .field-item").first().text().trim();
      const author = $(".field-name-author-name a, .username").first().text().trim();
      const licenseText = $(".field-name-field-art-licenses .field-item, .license-name").first().text().trim();
      const img = $(".field-name-field-art-preview img, .art-preview img").first().attr("src");
      const tags: string[] = [];
      $(".field-name-field-art-tags .field-item a").each((_, el) => {
        tags.push($(el).text().trim());
      });

      const typeText = $(".field-name-field-art-type .field-item").first().text().trim().toLowerCase();
      // Find download links — prefer zip/archive, fallback to any file link
      let downloadLink: string | undefined;
      const fileLinks: string[] = [];
      $("a[href*='/sites/default/files/']").each((_, el) => {
        const href = $(el).attr("href");
        if (href) fileLinks.push(href.startsWith("http") ? href : `${this.baseUrl}${href}`);
      });
      // Prefer archives
      downloadLink = fileLinks.find((l) => /\.(zip|tar\.gz|7z)$/i.test(l));
      // Fallback to first image/audio file
      if (!downloadLink) {
        downloadLink = fileLinks.find((l) => /\.(png|jpg|jpeg|gif|svg|wav|mp3|ogg)$/i.test(l));
      }

      const asset: Asset = {
        id: this.prefixId(rawId),
        source: "opengameart",
        title,
        description: description || undefined,
        type: this.parseOGAType(typeText),
        tags,
        license: this.parseLicense(licenseText),
        author: author || undefined,
        previewUrl: img || undefined,
        downloadUrl: downloadLink || undefined,
        pageUrl: `${this.baseUrl}/content/${rawId}`,
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
        return { success: false, error: "No download URL found" };
      }
      await this.downloadFile(asset.downloadUrl, destPath);
      return { success: true, filePath: destPath };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async getCategories(): Promise<Category[]> {
    return [
      { name: "2D Art", source: "opengameart" },
      { name: "3D Art", source: "opengameart" },
      { name: "Music", source: "opengameart" },
      { name: "Sound Effects", source: "opengameart" },
      { name: "Textures", source: "opengameart" },
    ];
  }

  async getStatus(): Promise<SourceStatus> {
    return {
      source: "opengameart",
      available: true,
      description: "OpenGameArt.org — free game art community",
      url: this.baseUrl,
    };
  }

  private mapTypeToOGA(type: AssetType): string | null {
    const map: Record<string, string> = {
      sprite: "9",
      "3d_model": "10",
      sound: "13",
      music: "12",
      texture: "14",
    };
    return map[type] || null;
  }

  private parseOGAType(text: string): AssetType {
    if (text.includes("2d")) return "sprite";
    if (text.includes("3d")) return "3d_model";
    if (text.includes("music")) return "music";
    if (text.includes("sound")) return "sound";
    if (text.includes("texture")) return "texture";
    return "other";
  }

  private parseLicense(text: string): License {
    const t = text.toLowerCase();
    if (t.includes("cc0") || t.includes("public domain")) return "CC0";
    if (t.includes("cc-by-sa") || t.includes("cc by-sa")) return "CC-BY-SA";
    if (t.includes("cc-by-nc-sa")) return "CC-BY-NC-SA";
    if (t.includes("cc-by-nc")) return "CC-BY-NC";
    if (t.includes("cc-by") || t.includes("cc by")) return "CC-BY";
    if (t.includes("oga-by") || t.includes("oga by")) return "OGA-BY";
    if (t.includes("gpl")) return "GPL";
    return "unknown";
  }
}
