# FreeGameAssetMCP — Implementation Plan

## Context
Создаём MCP-сервер + REST API с Swagger UI, который предоставляет AI-агентам и LLM доступ к бесплатным игровым ассетам (спрайты, 3D-модели, звуки, тайлмапы). Репозиторий пустой — строим с нуля. **Docker-first** — всё работает в Docker, локально ничего не ставится.

## Architecture

```
┌──────────────────────────────────────────────┐
│                src/index.ts                   │
│                                               │
│   ┌──────────┐         ┌──────────────────┐  │
│   │ MCP      │         │ Fastify REST     │  │
│   │ Server   │         │ /api/v1/...      │  │
│   │ (stdio + │         │ /docs (Swagger)  │  │
│   │  HTTP)   │         └───────┬──────────┘  │
│   └────┬─────┘                 │             │
│        └────────┬──────────────┘             │
│                 ▼                             │
│        ┌─────────────────┐                   │
│        │  AssetService   │                   │
│        └───────┬─────────┘                   │
│     ┌──────┬───┴───┬──────────┐              │
│     ▼      ▼       ▼          ▼              │
│  Freesound OGA   itch.io   Kenney           │
│  (API)    (scrape)(scrape) (scrape)          │
└──────────────────────────────────────────────┘
```

Single process. Shared service layer. Provider pattern.

## Project Structure

```
FreeGameAssetMCP/
├── Dockerfile                # Multi-stage: build + runtime
├── docker-compose.yml        # Dev + prod profiles
├── .dockerignore
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── index.ts              # Entry point
│   ├── config.ts             # Env vars
│   ├── types/
│   │   ├── assets.ts         # Domain types + Zod schemas
│   │   └── provider.ts       # AssetProvider interface
│   ├── providers/
│   │   ├── base.ts           # Abstract base (HTTP, error handling)
│   │   ├── freesound.ts      # Freesound API
│   │   ├── opengameart.ts    # OpenGameArt scraper
│   │   ├── itchio.ts         # itch.io scraper
│   │   └── kenney.ts         # Kenney scraper
│   ├── services/
│   │   ├── asset-service.ts  # Orchestrates providers
│   │   └── cache.ts          # TTL in-memory cache
│   ├── mcp/
│   │   └── server.ts         # MCP server + tool registration
│   └── rest/
│       ├── app.ts            # Fastify + Swagger
│       └── routes/
│           └── assets.ts     # REST endpoints
```

## Docker Setup

**Dockerfile** — multi-stage build:
- Stage 1 (`builder`): Node 22-alpine, `npm ci`, `tsc` compile
- Stage 2 (`runtime`): Node 22-alpine, copy only `dist/` + `node_modules` (prod), expose port 3000

**docker-compose.yml**:
```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    env_file: .env
    # Dev mode: mount src, use tsx watch
  dev:
    build:
      target: builder
    volumes:
      - ./src:/app/src
    ports:
      - "3000:3000"
    env_file: .env
    command: npx tsx watch src/index.ts
```

Все команды через `docker compose`:
- `docker compose up dev` — разработка с hot-reload
- `docker compose up app` — production build
- `docker compose build` — сборка

## Tech Stack

| Package | Purpose |
|---|---|
| `@modelcontextprotocol/sdk` | MCP server + transports |
| `zod` | Schema validation (shared by MCP + REST) |
| `fastify` | REST API |
| `@fastify/swagger` + `@fastify/swagger-ui` | OpenAPI spec + Swagger UI |
| `zod-to-json-schema` | Zod → JSON Schema for Fastify |
| `cheerio` | HTML scraping (OGA, itch.io, Kenney) |
| `typescript` + `tsx` | Build + dev |

Node 22 Alpine в Docker. Native fetch.

## MCP Tools

| Tool | Description |
|---|---|
| `search_assets` | Search across all sources by query, type, tags |
| `get_asset_details` | Full metadata + preview + license for one asset |
| `download_asset` | Download asset file to local path |
| `list_categories` | Available categories per source |
| `get_asset_sources` | List sources and their status |

## REST Endpoints

| Method | Path | Maps to |
|---|---|---|
| GET | `/api/v1/assets/search` | search_assets |
| GET | `/api/v1/assets/:id` | get_asset_details |
| POST | `/api/v1/assets/:id/download` | download_asset |
| GET | `/api/v1/categories` | list_categories |
| GET | `/api/v1/sources` | get_asset_sources |

Swagger UI at `/docs`.

## Key Design Decisions

- **Docker-first** — Dockerfile + docker-compose.yml, всё запускается через `docker compose`
- **Zod as single source of truth** — schemas used by MCP SDK and converted to JSON Schema for Fastify/Swagger
- **Provider-prefixed IDs** (e.g. `freesound:12345`) — globally unique, self-routing
- **Single process** — shared in-memory cache, no IPC needed
- **MCP streamable HTTP** mounted on Fastify at `/mcp` route

## Implementation Order

### Phase 1 — Project skeleton + Docker
1. `package.json`, `tsconfig.json`, `.env.example`
2. `Dockerfile` (multi-stage) + `docker-compose.yml` + `.dockerignore`
3. `src/types/assets.ts` — domain types + Zod schemas
4. `src/types/provider.ts` — AssetProvider interface
5. `src/config.ts` — env loading
6. `src/services/cache.ts` — TTL cache

### Phase 2 — Service layer + first provider
7. `src/providers/base.ts` — abstract base
8. `src/providers/freesound.ts` — Freesound API provider
9. `src/services/asset-service.ts` — orchestrator

### Phase 3 — MCP server
10. `src/mcp/server.ts` — tool registration + transports
11. `src/index.ts` — entry point

### Phase 4 — REST API
12. `src/rest/app.ts` — Fastify + Swagger
13. `src/rest/routes/assets.ts` — endpoints
14. Wire REST into `src/index.ts`

### Phase 5 — Additional providers
15. `src/providers/opengameart.ts`
16. `src/providers/itchio.ts`
17. `src/providers/kenney.ts`

### Phase 6 — Polish
18. README.md with Docker setup instructions
19. Streamable HTTP transport on Fastify `/mcp`

## Verification

1. `docker compose up dev` — server starts without errors
2. `docker compose up app` — production build works
3. REST: `curl http://localhost:3000/api/v1/assets/search?query=sword`
4. Swagger UI: open `http://localhost:3000/docs` in browser
5. Search returns results from Freesound with valid asset structure
6. MCP: test tools via streamable HTTP at `http://localhost:3000/mcp`
