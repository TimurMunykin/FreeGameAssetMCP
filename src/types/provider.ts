import type {
  Asset,
  AssetSource,
  Category,
  DownloadResult,
  SearchParams,
  SearchResult,
  SourceStatus,
} from "./assets.js";

export interface AssetProvider {
  readonly source: AssetSource;

  search(params: SearchParams): Promise<SearchResult>;
  getDetails(id: string): Promise<Asset | null>;
  download(id: string, destPath: string): Promise<DownloadResult>;
  getCategories(): Promise<Category[]>;
  getStatus(): Promise<SourceStatus>;
}
