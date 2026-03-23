import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import AdmZip from "adm-zip";
import { lookup } from "mime-types";

const execFileAsync = promisify(execFile);
import type { Asset } from "../types/assets.js";

export interface ContentFile {
  path: string;
  size: number;
  mimeType: string;
}

export interface ContentResult {
  type: "single" | "archive";
  files: ContentFile[];
}

const ASSET_CACHE_DIR = join(tmpdir(), "fga-cache");
const ARCHIVE_EXTENSIONS = new Set([".zip", ".7z", ".rar", ".tar", ".gz"]);
const ASSET_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp",
  ".wav", ".mp3", ".ogg", ".flac", ".aac",
  ".obj", ".fbx", ".gltf", ".glb", ".blend",
  ".ttf", ".otf", ".woff", ".woff2",
  ".json", ".xml", ".tmx", ".tsx",
]);

export class ContentService {
  private downloadCache = new Map<string, string>(); // assetId -> extracted dir path

  async getContentList(asset: Asset): Promise<ContentResult> {
    const dir = await this.ensureExtracted(asset);

    const files = await this.listFilesRecursive(dir, dir);
    const assetFiles = files.filter((f) => {
      const ext = extname(f.path).toLowerCase();
      return ASSET_EXTENSIONS.has(ext);
    });

    return {
      type: assetFiles.length > 1 ? "archive" : "single",
      files: assetFiles,
    };
  }

  async getFile(asset: Asset, filePath?: string): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
    const dir = await this.ensureExtracted(asset);

    if (filePath) {
      // Prevent path traversal
      const normalized = filePath.replace(/\.\./g, "").replace(/^\//, "");
      const fullPath = join(dir, normalized);
      if (!fullPath.startsWith(dir)) return null;

      try {
        const buffer = await readFile(fullPath);
        const mimeType = lookup(fullPath) || "application/octet-stream";
        return { buffer, mimeType, fileName: basename(fullPath) };
      } catch {
        return null;
      }
    }

    // No filePath — return the first asset file (for single-file assets)
    const content = await this.getContentList(asset);
    if (content.files.length === 0) return null;

    const first = content.files[0];
    const fullPath = join(dir, first.path);
    const buffer = await readFile(fullPath);
    const mimeType = lookup(fullPath) || "application/octet-stream";
    return { buffer, mimeType, fileName: basename(first.path) };
  }

  private async ensureExtracted(asset: Asset): Promise<string> {
    const cacheKey = asset.id.replace(/[^a-zA-Z0-9._-]/g, "_");
    const cached = this.downloadCache.get(asset.id);
    if (cached) {
      try {
        await stat(cached);
        return cached;
      } catch {
        this.downloadCache.delete(asset.id);
      }
    }

    const destDir = join(ASSET_CACHE_DIR, cacheKey);
    await mkdir(destDir, { recursive: true });

    let url = asset.downloadUrl || asset.previewUrl;
    if (!url) throw new Error("No download or preview URL available");

    // For itch.io, resolve a fresh download URL on-the-fly
    if (asset.source === "itchio") {
      const freshUrl = await this.resolveItchioDownload(asset.pageUrl);
      if (freshUrl) url = freshUrl;
    }

    const response = await fetch(url, {
      headers: { "User-Agent": "FreeGameAssetMCP/1.0" },
      redirect: "follow",
    });
    if (!response.ok) {
      throw new Error(`Failed to download: HTTP ${response.status} from ${url}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "";
    const contentDisposition = response.headers.get("content-disposition") || "";

    // Determine filename
    let fileName = this.extractFilename(contentDisposition) || basename(new URL(url).pathname) || "asset";
    const ext = extname(fileName).toLowerCase();

    const isArchive = ARCHIVE_EXTENSIONS.has(ext) || contentType.includes("zip") || contentType.includes("compressed") || contentType.includes("rar");

    if (isArchive) {
      // Save archive to disk first
      const archivePath = join(destDir, fileName);
      await writeFile(archivePath, buffer);

      try {
        if (ext === ".rar" || contentType.includes("rar")) {
          await this.extractRar(buffer, destDir);
        } else if (ext === ".zip") {
          const zip = new AdmZip(buffer);
          zip.extractAllTo(destDir, true);
        } else {
          // Try zip first, then 7z
          try {
            const zip = new AdmZip(buffer);
            zip.extractAllTo(destDir, true);
          } catch {
            await execFileAsync("7z", ["x", `-o${destDir}`, "-y", archivePath]);
          }
        }
        // Remove the archive after extraction
        const { unlink } = await import("node:fs/promises");
        await unlink(archivePath).catch(() => {});
      } catch {
        // Extraction failed — keep the raw file
      }
    } else {
      // Single file — save directly
      if (!ext && contentType) {
        // Add extension from content-type
        const mimeExt = this.mimeToExt(contentType);
        if (mimeExt) fileName += mimeExt;
      }
      await writeFile(join(destDir, fileName), buffer);
    }

    this.downloadCache.set(asset.id, destDir);
    return destDir;
  }

  private async listFilesRecursive(dir: string, root: string): Promise<ContentFile[]> {
    const files: ContentFile[] = [];
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return files;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.listFilesRecursive(fullPath, root));
      } else if (entry.isFile()) {
        const s = await stat(fullPath);
        const relativePath = fullPath.slice(root.length + 1);
        files.push({
          path: relativePath,
          size: s.size,
          mimeType: lookup(fullPath) || "application/octet-stream",
        });
      }
    }
    return files;
  }

  private extractFilename(contentDisposition: string): string | null {
    const match = contentDisposition.match(/filename[^;=\n]*=(['"]?)([^'";\n]*)\1/);
    return match?.[2] || null;
  }

  private async extractRar(buffer: Buffer, destDir: string): Promise<void> {
    const { createExtractorFromData } = await import("node-unrar-js");
    const extractor = await createExtractorFromData({ data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer });
    const extracted = extractor.extract();
    for (const file of [...extracted.files]) {
      if (file.fileHeader.flags.directory) continue;
      const filePath = join(destDir, file.fileHeader.name);
      await mkdir(join(filePath, ".."), { recursive: true });
      if (file.extraction) {
        await writeFile(filePath, Buffer.from(file.extraction));
      }
    }
  }

  private async resolveItchioDownload(pageUrl: string): Promise<string | null> {
    try {
      // Step 1: Get download page URL
      const res = await fetch(`${pageUrl}/download_url`, {
        method: "POST",
        headers: { "User-Agent": "FreeGameAssetMCP/1.0" },
      });
      if (!res.ok) return null;

      const data = await res.json() as { url?: string };
      if (!data.url) return null;

      // Step 2: Fetch download page to get upload_id and cookies
      const pageRes = await fetch(data.url, {
        headers: { "User-Agent": "FreeGameAssetMCP/1.0" },
      });
      if (!pageRes.ok) return null;

      const html = await pageRes.text();
      const uploadIdMatch = html.match(/data-upload_id="(\d+)"/);
      if (!uploadIdMatch) return null;
      const uploadId = uploadIdMatch[1];

      // Get cookies from response
      const cookies = pageRes.headers.getSetCookie?.() || [];
      const cookieHeader = cookies.map((c: string) => c.split(";")[0]).join("; ");

      // Step 3: POST to /file/{upload_id} like the JS download button does
      const fileRes = await fetch(`${pageUrl}/file/${uploadId}`, {
        method: "POST",
        headers: {
          "User-Agent": "FreeGameAssetMCP/1.0",
          "X-Requested-With": "XMLHttpRequest",
          "Cookie": cookieHeader,
        },
      });
      if (!fileRes.ok) return null;

      const fileData = await fileRes.json() as { url?: string };
      return fileData.url || null;
    } catch {
      return null;
    }
  }

  private mimeToExt(contentType: string): string | null {
    if (contentType.includes("png")) return ".png";
    if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
    if (contentType.includes("gif")) return ".gif";
    if (contentType.includes("svg")) return ".svg";
    if (contentType.includes("webp")) return ".webp";
    if (contentType.includes("wav")) return ".wav";
    if (contentType.includes("mp3") || contentType.includes("mpeg")) return ".mp3";
    if (contentType.includes("ogg")) return ".ogg";
    return null;
  }
}
