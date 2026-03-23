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

export class AssetService {
  private providers = new Map<AssetSource, AssetProvider>();

  register(provider: AssetProvider): void {
    this.providers.set(provider.source, provider);
  }

  async search(params: SearchParams): Promise<SearchResult> {
    const targets = params.source
      ? [this.providers.get(params.source)].filter(Boolean) as AssetProvider[]
      : Array.from(this.providers.values());

    if (targets.length === 0) {
      return { assets: [], total: 0, offset: params.offset, limit: params.limit };
    }

    const perProvider = Math.ceil(params.limit / targets.length);
    const results = await Promise.allSettled(
      targets.map((p) => p.search({ ...params, limit: perProvider }))
    );

    const allAssets: Asset[] = [];
    let total = 0;

    for (const r of results) {
      if (r.status === "fulfilled") {
        allAssets.push(...r.value.assets);
        total += r.value.total;
      }
    }

    return {
      assets: allAssets.slice(0, params.limit),
      total,
      offset: params.offset,
      limit: params.limit,
    };
  }

  async getDetails(id: string): Promise<Asset | null> {
    const provider = this.resolveProvider(id);
    if (!provider) return null;
    return provider.getDetails(id);
  }

  async download(id: string, destPath: string): Promise<DownloadResult> {
    const provider = this.resolveProvider(id);
    if (!provider) {
      return { success: false, error: `Unknown provider for id: ${id}` };
    }
    return provider.download(id, destPath);
  }

  async getCategories(source?: AssetSource): Promise<Category[]> {
    const targets = source
      ? [this.providers.get(source)].filter(Boolean) as AssetProvider[]
      : Array.from(this.providers.values());

    const results = await Promise.allSettled(
      targets.map((p) => p.getCategories())
    );

    return results.flatMap((r) =>
      r.status === "fulfilled" ? r.value : []
    );
  }

  async getSources(): Promise<SourceStatus[]> {
    const results = await Promise.allSettled(
      Array.from(this.providers.values()).map((p) => p.getStatus())
    );

    return results.flatMap((r) =>
      r.status === "fulfilled" ? [r.value] : []
    );
  }

  private resolveProvider(id: string): AssetProvider | undefined {
    const colonIdx = id.indexOf(":");
    if (colonIdx === -1) return undefined;
    const source = id.slice(0, colonIdx) as AssetSource;
    return this.providers.get(source);
  }
}
