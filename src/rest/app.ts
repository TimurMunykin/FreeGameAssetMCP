import Fastify from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { registerAssetRoutes } from "./routes/assets.js";
import { registerUI } from "./ui.js";
import type { AssetService } from "../services/asset-service.js";
import type { ContentService } from "../services/content.js";

export async function createApp(assetService: AssetService, contentService: ContentService) {
  const app = Fastify({ logger: true });

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "FreeGameAssetMCP",
        description: "REST API for searching and downloading free game assets",
        version: "1.0.0",
      },
      servers: [{ url: "/" }],
      tags: [
        { name: "assets", description: "Asset search and details" },
        { name: "meta", description: "Categories and sources" },
      ],
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: "/docs",
  });

  app.decorate("assetService", assetService);

  registerAssetRoutes(app, assetService, contentService);
  registerUI(app);

  return app;
}
