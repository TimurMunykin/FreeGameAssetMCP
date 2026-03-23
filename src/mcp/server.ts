import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AssetService } from "../services/asset-service.js";
import { AssetType, AssetSource, License } from "../types/assets.js";

export function createMcpServer(assetService: AssetService): McpServer {
  const server = new McpServer({
    name: "FreeGameAssetMCP",
    version: "1.0.0",
  });

  server.tool(
    "search_assets",
    "Search for free game assets across multiple sources",
    {
      query: z.string().describe("Search query"),
      type: AssetType.optional().describe("Filter by asset type"),
      source: AssetSource.optional().describe("Filter by source"),
      tags: z.array(z.string()).optional().describe("Filter by tags"),
      license: License.optional().describe("Filter by license"),
      limit: z.number().min(1).max(50).default(20).describe("Max results"),
      offset: z.number().min(0).default(0).describe("Pagination offset"),
    },
    async (params) => {
      const result = await assetService.search(params);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "get_asset_details",
    "Get full details for a specific asset by its provider-prefixed ID",
    {
      id: z.string().describe("Asset ID (e.g. freesound:12345)"),
    },
    async ({ id }) => {
      const asset = await assetService.getDetails(id);
      if (!asset) {
        return {
          content: [{ type: "text" as const, text: "Asset not found" }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(asset, null, 2) }],
      };
    }
  );

  server.tool(
    "download_asset",
    "Download an asset file to a local path",
    {
      id: z.string().describe("Asset ID (e.g. freesound:12345)"),
      destPath: z.string().describe("Local destination path"),
    },
    async ({ id, destPath }) => {
      const result = await assetService.download(id, destPath);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        isError: !result.success,
      };
    }
  );

  server.tool(
    "list_categories",
    "List available categories per source",
    {
      source: AssetSource.optional().describe("Filter by source"),
    },
    async ({ source }) => {
      const categories = await assetService.getCategories(source);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(categories, null, 2) }],
      };
    }
  );

  server.tool(
    "get_asset_sources",
    "List all asset sources and their availability status",
    {},
    async () => {
      const sources = await assetService.getSources();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(sources, null, 2) }],
      };
    }
  );

  return server;
}
