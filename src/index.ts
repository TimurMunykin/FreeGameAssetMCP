import { config } from "./config.js";
import { AssetService } from "./services/asset-service.js";
import { FreesoundProvider } from "./providers/freesound.js";
import { OpenGameArtProvider } from "./providers/opengameart.js";
import { ItchioProvider } from "./providers/itchio.js";
import { KenneyProvider } from "./providers/kenney.js";
import { createMcpServer } from "./mcp/server.js";
import { ContentService } from "./services/content.js";
import { createApp } from "./rest/app.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

async function main() {
  const assetService = new AssetService();
  const contentService = new ContentService();

  assetService.register(new FreesoundProvider());
  assetService.register(new OpenGameArtProvider());
  assetService.register(new ItchioProvider());
  assetService.register(new KenneyProvider());

  const mcpServer = createMcpServer(assetService);
  const app = await createApp(assetService, contentService);

  // MCP streamable HTTP transport mounted on Fastify
  app.all("/mcp", async (request, reply) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    reply.hijack();

    await mcpServer.connect(transport);
    await transport.handleRequest(
      request.raw,
      reply.raw,
      request.body as Record<string, unknown> | undefined
    );
  });

  // Health check
  app.get("/health", async () => ({ status: "ok" }));

  await app.listen({ port: config.port, host: config.host });
  console.log(`Server running at http://${config.host}:${config.port}`);
  console.log(`Swagger UI at http://${config.host}:${config.port}/docs`);
  console.log(`MCP endpoint at http://${config.host}:${config.port}/mcp`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
