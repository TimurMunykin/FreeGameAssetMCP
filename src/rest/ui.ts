import type { FastifyInstance } from "fastify";

export function registerUI(app: FastifyInstance) {
  app.get("/", async (_request, reply) => {
    reply.header("Content-Type", "text/html; charset=utf-8");
    return reply.send(HTML);
  });
}

const HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FreeGameAssetMCP — Sprite Preview</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    background: #0f0f13;
    color: #e0e0e0;
    min-height: 100vh;
  }
  header {
    background: #1a1a24;
    border-bottom: 1px solid #2a2a3a;
    padding: 16px 24px;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  header h1 {
    font-size: 18px;
    color: #8b8bff;
    white-space: nowrap;
  }
  .search-form {
    display: flex;
    gap: 8px;
    flex: 1;
    min-width: 300px;
  }
  .search-form input[type="text"] {
    flex: 1;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid #3a3a4a;
    background: #12121a;
    color: #e0e0e0;
    font-size: 14px;
    outline: none;
  }
  .search-form input[type="text"]:focus { border-color: #6b6bff; }
  .search-form select {
    padding: 8px;
    border-radius: 6px;
    border: 1px solid #3a3a4a;
    background: #12121a;
    color: #e0e0e0;
    font-size: 14px;
  }
  .search-form button {
    padding: 8px 20px;
    border-radius: 6px;
    border: none;
    background: #6b6bff;
    color: #fff;
    font-size: 14px;
    cursor: pointer;
    white-space: nowrap;
  }
  .search-form button:hover { background: #5a5aee; }

  .status {
    padding: 8px 24px;
    font-size: 13px;
    color: #888;
  }

  /* Asset grid */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 16px;
    padding: 24px;
  }
  .card {
    background: #1a1a24;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .card:hover { border-color: #6b6bff; }
  .card-thumb {
    width: 100%;
    height: 160px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #12121a;
    overflow: hidden;
  }
  .card-thumb img {
    max-width: 100%;
    max-height: 100%;
    image-rendering: pixelated;
    object-fit: contain;
  }
  .card-thumb .no-preview {
    color: #555;
    font-size: 13px;
  }
  .card-info {
    padding: 10px 12px;
  }
  .card-info h3 {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card-info .meta {
    font-size: 11px;
    color: #888;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    background: #2a2a3a;
    font-size: 10px;
  }

  /* Detail modal */
  .overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.8);
    z-index: 100;
    overflow-y: auto;
  }
  .overlay.open { display: block; }
  .detail {
    max-width: 1000px;
    margin: 40px auto;
    background: #1a1a24;
    border: 1px solid #2a2a3a;
    border-radius: 12px;
    overflow: hidden;
  }
  .detail-header {
    padding: 16px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #2a2a3a;
  }
  .detail-header h2 { font-size: 16px; }
  .detail-header .close-btn {
    background: none;
    border: none;
    color: #888;
    font-size: 24px;
    cursor: pointer;
    padding: 0 4px;
  }
  .detail-header .close-btn:hover { color: #fff; }
  .detail-meta {
    padding: 12px 20px;
    font-size: 12px;
    color: #888;
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    border-bottom: 1px solid #2a2a3a;
  }
  .detail-meta a { color: #8b8bff; text-decoration: none; }
  .detail-meta a:hover { text-decoration: underline; }
  .detail-loading {
    padding: 40px;
    text-align: center;
    color: #666;
  }
  .sprite-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
    padding: 20px;
  }
  .sprite-item {
    background: #12121a;
    border: 1px solid #2a2a3a;
    border-radius: 6px;
    overflow: hidden;
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .sprite-item:hover { border-color: #6b6bff; }
  .sprite-item img {
    width: 100%;
    height: 120px;
    object-fit: contain;
    image-rendering: pixelated;
    background: repeating-conic-gradient(#1a1a24 0% 25%, #12121a 0% 50%) 0 0 / 16px 16px;
  }
  .sprite-item .sprite-name {
    padding: 6px 8px;
    font-size: 11px;
    color: #aaa;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Fullscreen sprite viewer */
  .viewer-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.9);
    z-index: 200;
    cursor: zoom-out;
    overflow: auto;
    padding: 40px;
  }
  .viewer-overlay.open {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .viewer-overlay img {
    max-width: 90vw;
    max-height: 90vh;
    image-rendering: pixelated;
    object-fit: contain;
    background: repeating-conic-gradient(#222 0% 25%, #333 0% 50%) 0 0 / 20px 20px;
    border-radius: 4px;
  }

  .load-more {
    display: block;
    margin: 0 auto 40px;
    padding: 10px 32px;
    border-radius: 6px;
    border: 1px solid #3a3a4a;
    background: #1a1a24;
    color: #e0e0e0;
    font-size: 14px;
    cursor: pointer;
  }
  .load-more:hover { border-color: #6b6bff; }
</style>
</head>
<body>

<header>
  <h1>FreeGameAssetMCP</h1>
  <form class="search-form" id="searchForm">
    <input type="text" name="query" placeholder="Search sprites..." value="pixel art" autofocus>
    <select name="source">
      <option value="">All sources</option>
      <option value="itchio">itch.io</option>
      <option value="opengameart">OpenGameArt</option>
      <option value="kenney">Kenney</option>
    </select>
    <select name="type">
      <option value="sprite" selected>Sprites</option>
      <option value="texture">Textures</option>
      <option value="tilemap">Tilemaps</option>
      <option value="">All types</option>
    </select>
    <button type="submit">Search</button>
  </form>
</header>

<div class="status" id="status"></div>
<div class="grid" id="grid"></div>
<button class="load-more" id="loadMore" style="display:none">Load more</button>

<div class="overlay" id="overlay">
  <div class="detail" id="detail"></div>
</div>

<div class="viewer-overlay" id="viewer">
  <img id="viewerImg" src="" alt="">
</div>

<script>
const $ = (sel) => document.querySelector(sel);
const grid = $("#grid");
const status = $("#status");
const overlay = $("#overlay");
const viewer = $("#viewer");
const loadMoreBtn = $("#loadMore");

let currentOffset = 0;
let currentTotal = 0;
let lastParams = {};

$("#searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  currentOffset = 0;
  grid.innerHTML = "";
  doSearch();
});

loadMoreBtn.addEventListener("click", () => {
  doSearch(true);
});

overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeDetail();
});

viewer.addEventListener("click", () => {
  viewer.classList.remove("open");
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (viewer.classList.contains("open")) {
      viewer.classList.remove("open");
    } else if (overlay.classList.contains("open")) {
      closeDetail();
    }
  }
});

async function doSearch(append) {
  const form = new FormData($("#searchForm"));
  const query = form.get("query") || "";
  const source = form.get("source") || "";
  const type = form.get("type") || "";

  if (!query) return;

  const params = new URLSearchParams({ query, limit: "20", offset: String(currentOffset) });
  if (source) params.set("source", source);
  if (type) params.set("type", type);

  lastParams = { query, source, type };
  status.textContent = append ? "Loading more..." : "Searching...";

  try {
    const res = await fetch("/api/v1/assets/search?" + params);
    const data = await res.json();
    currentTotal = data.total;
    currentOffset += data.assets.length;

    if (!append && data.assets.length === 0) {
      status.textContent = "No results found.";
      loadMoreBtn.style.display = "none";
      return;
    }

    status.textContent = "Showing " + currentOffset + " of ~" + currentTotal + " results";
    loadMoreBtn.style.display = currentOffset < currentTotal ? "block" : "none";

    for (const asset of data.assets) {
      grid.appendChild(createCard(asset));
    }
  } catch (err) {
    status.textContent = "Error: " + err.message;
  }
}

function createCard(asset) {
  const card = document.createElement("div");
  card.className = "card";
  card.onclick = () => openDetail(asset);

  const thumb = document.createElement("div");
  thumb.className = "card-thumb";

  if (asset.previewUrl) {
    const img = document.createElement("img");
    img.src = asset.previewUrl;
    img.alt = asset.title;
    img.loading = "lazy";
    img.onerror = () => { img.replaceWith(noPreview()); };
    thumb.appendChild(img);
  } else {
    thumb.appendChild(noPreview());
  }

  const info = document.createElement("div");
  info.className = "card-info";
  info.innerHTML =
    '<h3 title="' + esc(asset.title) + '">' + esc(asset.title) + '</h3>' +
    '<div class="meta">' +
      '<span class="badge">' + esc(asset.source) + '</span>' +
      '<span class="badge">' + esc(asset.license) + '</span>' +
      (asset.author ? '<span>' + esc(asset.author) + '</span>' : '') +
    '</div>';

  card.appendChild(thumb);
  card.appendChild(info);
  return card;
}

function noPreview() {
  const el = document.createElement("span");
  el.className = "no-preview";
  el.textContent = "No preview";
  return el;
}

async function openDetail(asset) {
  const detail = $("#detail");
  detail.innerHTML =
    '<div class="detail-header">' +
      '<h2>' + esc(asset.title) + '</h2>' +
      '<button class="close-btn" onclick="closeDetail()">&times;</button>' +
    '</div>' +
    '<div class="detail-meta">' +
      '<span>Source: ' + esc(asset.source) + '</span>' +
      '<span>License: ' + esc(asset.license) + '</span>' +
      (asset.author ? '<span>Author: ' + esc(asset.author) + '</span>' : '') +
      '<a href="' + esc(asset.pageUrl) + '" target="_blank" rel="noopener">Open page</a>' +
    '</div>' +
    '<div class="detail-loading" id="detailLoading">Loading asset contents...</div>';

  overlay.classList.add("open");

  try {
    const res = await fetch("/api/v1/assets/content/list/" + encodeURIComponent(asset.id));
    const data = await res.json();

    const loading = $("#detailLoading");
    if (!data.files || data.files.length === 0) {
      loading.textContent = "No viewable files found in this asset.";
      return;
    }

    const imageFiles = data.files.filter((f) =>
      /\\.(png|jpg|jpeg|gif|svg|webp|bmp)$/i.test(f.path)
    );

    if (imageFiles.length === 0) {
      loading.textContent = "No image files found. Files: " + data.files.map(f => f.path).join(", ");
      return;
    }

    loading.remove();
    const spriteGrid = document.createElement("div");
    spriteGrid.className = "sprite-grid";

    for (const file of imageFiles) {
      const url = "/api/v1/assets/content/" + encodeURIComponent(asset.id) + "?file=" + encodeURIComponent(file.path);
      const item = document.createElement("div");
      item.className = "sprite-item";
      item.onclick = () => {
        $("#viewerImg").src = url;
        viewer.classList.add("open");
      };

      const img = document.createElement("img");
      img.src = url;
      img.alt = file.path;
      img.loading = "lazy";

      const name = document.createElement("div");
      name.className = "sprite-name";
      name.title = file.path;
      name.textContent = file.path.split("/").pop();

      item.appendChild(img);
      item.appendChild(name);
      spriteGrid.appendChild(item);
    }

    detail.appendChild(spriteGrid);
  } catch (err) {
    const loading = $("#detailLoading");
    if (loading) loading.textContent = "Error loading content: " + err.message;
  }
}

function closeDetail() {
  overlay.classList.remove("open");
}

function esc(s) {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Auto-search on load
doSearch();
</script>

</body>
</html>`;
