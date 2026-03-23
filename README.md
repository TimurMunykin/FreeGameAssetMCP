# FreeGameAssetMCP

MCP-сервер + REST API для поиска и скачивания бесплатных игровых ассетов (спрайты, 3D-модели, звуки, тайлмапы).

Сервер скачивает архивы с источников, распаковывает их (ZIP, RAR) и отдаёт отдельные файлы напрямую — PNG, WAV, FBX и т.д.

## Источники

| Источник | Что внутри | API ключ |
|---|---|---|
| **Freesound** | Звуки, музыка | Нужен (`FREESOUND_API_KEY`) |
| **OpenGameArt** | 2D/3D арт, музыка, звуки | Не нужен |
| **itch.io** | Спрайты, модели, звуки, тайлсеты | Не нужен |
| **Kenney** | CC0 ассеты всех типов | Не нужен |

## Быстрый старт

```bash
cp .env.example .env
# Опционально: добавить FREESOUND_API_KEY в .env

# Разработка (hot-reload)
docker compose up dev

# Продакшн
docker compose up app
```

Сервер запустится на `http://localhost:3000`.

## Как пользоваться

### Шаг 1 — Поиск ассетов

```
GET /api/v1/assets/search?query=explosion
```

Можно фильтровать по источнику, типу, лицензии:

```
GET /api/v1/assets/search?query=sword&source=itchio&type=sprite&limit=5
```

Параметры:

| Параметр | Описание |
|---|---|
| `query` | Поисковый запрос (обязательный) |
| `source` | Фильтр по источнику: `freesound`, `opengameart`, `itchio`, `kenney` |
| `type` | Тип ассета: `sprite`, `3d_model`, `sound`, `music`, `tilemap`, `texture`, `font` |
| `license` | Лицензия: `CC0`, `CC-BY`, `CC-BY-SA`, `CC-BY-NC`, `OGA-BY`, `MIT`, `GPL` |
| `tags` | Фильтр по тегам |
| `limit` | Макс. результатов (1-50, по умолчанию 20) |
| `offset` | Смещение для пагинации |

Пример ответа:

```json
{
  "assets": [
    {
      "id": "itchio:untiedgames.itch.io/super-pixel-effects-gigapack",
      "source": "itchio",
      "title": "Super Pixel Effects Gigapack",
      "type": "other",
      "tags": [],
      "license": "unknown",
      "pageUrl": "https://untiedgames.itch.io/super-pixel-effects-gigapack",
      "author": "unTied Games",
      "previewUrl": "https://img.itch.zone/aW1nLzI0MTIxMzY1LmdpZg==/315x250%23c/qM4ReN.gif"
    }
  ],
  "total": 36,
  "offset": 0,
  "limit": 5
}
```

### Шаг 2 — Посмотреть что внутри ассета

Берём `id` из поиска и смотрим список файлов:

```
GET /api/v1/assets/content/list/itchio:untiedgames.itch.io/super-pixel-effects-gigapack
```

Сервер скачивает архив, распаковывает и возвращает список всех файлов:

```json
{
  "type": "archive",
  "files": [
    {
      "path": "Super Pixel Effects Gigapack (Free Version)/PNG/Explosions/epic_explosion_002/epic_explosion_002_small_yellow/frame0012.png",
      "size": 1525,
      "mimeType": "image/png"
    },
    {
      "path": "Super Pixel Effects Gigapack (Free Version)/PNG/Explosions/epic_explosion_002/epic_explosion_002_small_yellow/frame0013.png",
      "size": 1280,
      "mimeType": "image/png"
    }
  ]
}
```

> Первый запрос может занять несколько секунд (скачивание + распаковка). Результат кэшируется.

### Шаг 3 — Скачать конкретный файл

Берём `path` из списка и передаём в параметре `file`:

```
GET /api/v1/assets/content/itchio:untiedgames.itch.io/super-pixel-effects-gigapack?file=Super%20Pixel%20Effects%20Gigapack%20(Free%20Version)/PNG/Explosions/epic_explosion_002/epic_explosion_002_small_yellow/frame0012.png
```

Сервер отдаёт файл напрямую с правильным `Content-Type` (`image/png`, `audio/wav` и т.д.). Можно:
- Открыть в браузере — картинка отобразится
- Скачать через curl:

```bash
curl -o explosion.png "http://localhost:3000/api/v1/assets/content/itchio:untiedgames.itch.io/super-pixel-effects-gigapack?file=Super%20Pixel%20Effects%20Gigapack%20(Free%20Version)/PNG/Explosions/epic_explosion_002/epic_explosion_002_small_yellow/frame0012.png"
```

### Шаг 2.5 (опционально) — Метаданные ассета

Для подробной информации (описание, теги, лицензия, автор):

```
GET /api/v1/assets/details/itchio:untiedgames.itch.io/super-pixel-effects-gigapack
```

```json
{
  "id": "itchio:untiedgames.itch.io/super-pixel-effects-gigapack",
  "source": "itchio",
  "title": "Super Pixel Effects Gigapack",
  "description": "...",
  "type": "sprite",
  "tags": ["2D", "Animation", "Effects", "Pixel Art"],
  "license": "unknown",
  "author": "unTied Games",
  "previewUrl": "https://...",
  "downloadUrl": "https://...",
  "pageUrl": "https://untiedgames.itch.io/super-pixel-effects-gigapack"
}
```

## Полный пример: от поиска до скачивания

```bash
# 1. Ищем фермерские ассеты
curl "http://localhost:3000/api/v1/assets/search?query=farm+rpg&source=itchio&limit=3"

# 2. Смотрим что внутри
curl "http://localhost:3000/api/v1/assets/content/list/itchio:emanuelledev.itch.io/farm-rpg"

# 3. Скачиваем спрайт персонажа
curl -o idle.png "http://localhost:3000/api/v1/assets/content/itchio:emanuelledev.itch.io/farm-rpg?file=Farm%20RPG%20FREE%2016x16%20-%20Tiny%20Asset%20Pack/Character/Idle.png"

# 4. Скачиваем спрайт курицы
curl -o chicken.png "http://localhost:3000/api/v1/assets/content/itchio:emanuelledev.itch.io/farm-rpg?file=Farm%20RPG%20FREE%2016x16%20-%20Tiny%20Asset%20Pack/Farm%20Animals/Baby%20Chicken%20Yellow.png"
```

## Все эндпоинты

### Ассеты

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/api/v1/assets/search?query=...` | Поиск ассетов по всем источникам |
| `GET` | `/api/v1/assets/details/{id}` | Метаданные ассета (JSON) |
| `GET` | `/api/v1/assets/content/list/{id}` | Список файлов внутри ассета |
| `GET` | `/api/v1/assets/content/{id}` | Первый файл из ассета |
| `GET` | `/api/v1/assets/content/{id}?file={path}` | Конкретный файл из ассета |
| `POST` | `/api/v1/assets/download` | Скачать ассет на сервер (body: `{id, destPath}`) |

### Мета

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/api/v1/categories` | Категории по источникам |
| `GET` | `/api/v1/categories?source=kenney` | Категории конкретного источника |
| `GET` | `/api/v1/sources` | Все источники и их статус |

### Сервис

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/docs` | Swagger UI (интерактивная документация) |
| `POST` | `/mcp` | MCP streamable HTTP endpoint |
| `GET` | `/health` | Health check |

## MCP (Model Context Protocol)

Сервер предоставляет 5 инструментов для AI-агентов через MCP:

| Инструмент | Описание |
|---|---|
| `search_assets` | Поиск ассетов по запросу, типу, источнику, тегам |
| `get_asset_details` | Полные метаданные ассета по ID |
| `download_asset` | Скачать файл ассета на локальный путь |
| `list_categories` | Доступные категории по источникам |
| `get_asset_sources` | Список источников и их доступность |

MCP endpoint: `http://localhost:3000/mcp` (streamable HTTP transport).

### Подключение к Claude Desktop

```json
{
  "mcpServers": {
    "free-game-assets": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Формат ID ассетов

ID имеет формат `{источник}:{идентификатор}`:

| Источник | Пример ID |
|---|---|
| Freesound | `freesound:12345` |
| OpenGameArt | `opengameart:dungeon-crawl-32x32-tiles` |
| itch.io | `itchio:emanuelledev.itch.io/farm-rpg` |
| Kenney | `kenney:pirate-kit` |

ID из itch.io содержат слэши — это нормально, API их поддерживает.

## Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `PORT` | `3000` | Порт сервера |
| `HOST` | `0.0.0.0` | Хост сервера |
| `FREESOUND_API_KEY` | — | API ключ Freesound ([получить](https://freesound.org/apiv2/apply)) |
| `CACHE_TTL` | `300` | Время жизни кэша в секундах |

## Docker

```bash
# Разработка с hot-reload
docker compose up dev

# Продакшн
docker compose up app

# Пересборка
docker compose build

# Остановка
docker compose down
```

## Архитектура

```
Fastify REST API (/api/v1/...)  +  MCP Server (/mcp)
                    |                    |
                    v                    v
               AssetService (оркестратор)
                    |
        +-----------+-----------+
        |           |           |
   Freesound   OpenGameArt   itch.io    Kenney
    (API)      (scraping)   (scraping) (scraping)
                    |
               ContentService
          (скачивание, распаковка ZIP/RAR, кэш)
```

Один процесс, общий in-memory кэш, provider pattern.
