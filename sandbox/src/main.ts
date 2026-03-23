import { searchAssets, getContentList, getFileUrl, type Asset, type ContentFile } from "./api";
import { SpriteRenderer, type Background } from "./renderer";
import { autoDetect } from "./detect";
import { initSettingsUI } from "./settings";
import { ChatEngine, initChatUI } from "./chat";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

// Elements
const searchForm = $<HTMLFormElement>("#searchForm");
const searchQuery = $<HTMLInputElement>("#searchQuery");
const searchSource = $<HTMLSelectElement>("#searchSource");
const searchStatus = $<HTMLDivElement>("#searchStatus");
const searchResults = $<HTMLDivElement>("#searchResults");
const loadMoreBtn = $<HTMLButtonElement>("#loadMore");
const filesPanel = $<HTMLElement>("#filesPanel");
const assetTitle = $<HTMLDivElement>("#assetTitle");
const fileList = $<HTMLDivElement>("#fileList");
const backToSearch = $<HTMLButtonElement>("#backToSearch");
const emptyState = $<HTMLDivElement>("#emptyState");
const controls = $<HTMLDivElement>("#controls");

const modeSelect = $<HTMLSelectElement>("#modeSelect");
const sheetControls = $<HTMLDivElement>("#sheetControls");
const frameWInput = $<HTMLInputElement>("#frameW");
const frameHInput = $<HTMLInputElement>("#frameH");
const fpsInput = $<HTMLInputElement>("#fps");
const frameCountEl = $<HTMLSpanElement>("#frameCount");
const currentFrameEl = $<HTMLSpanElement>("#currentFrame");
const playPauseBtn = $<HTMLButtonElement>("#playPause");
const prevFrameBtn = $<HTMLButtonElement>("#prevFrame");
const nextFrameBtn = $<HTMLButtonElement>("#nextFrame");
const zoomInput = $<HTMLInputElement>("#zoom");
const zoomLabel = $<HTMLSpanElement>("#zoomLabel");
const bgSelect = $<HTMLSelectElement>("#bgSelect");

const offsetXInput = $<HTMLInputElement>("#offsetX");
const offsetYInput = $<HTMLInputElement>("#offsetY");
const assetLink = $<HTMLAnchorElement>("#assetLink");

const autoDetectBtn = $<HTMLButtonElement>("#autoDetect");
const detectStatus = $<HTMLSpanElement>("#detectStatus");

const canvas = $<HTMLCanvasElement>("#canvas");
const renderer = new SpriteRenderer(canvas);

// State
let offset = 0;
let total = 0;
let currentAsset: Asset | null = null;
let currentFilePath: string | null = null;

// --- Search ---
searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  offset = 0;
  searchResults.innerHTML = "";
  doSearch();
});

loadMoreBtn.addEventListener("click", () => doSearch(true));

async function doSearch(append = false) {
  const query = searchQuery.value.trim();
  if (!query) return;

  searchStatus.textContent = append ? "Loading more..." : "Searching...";
  loadMoreBtn.style.display = "none";

  try {
    const result = await searchAssets(query, {
      source: searchSource.value || undefined,
      type: "sprite",
      limit: 20,
      offset,
    });
    total = result.total;
    offset += result.assets.length;

    if (!append && result.assets.length === 0) {
      searchStatus.textContent = "No results found.";
      return;
    }

    searchStatus.textContent = `${offset} of ~${total} results`;
    loadMoreBtn.style.display = offset < total ? "block" : "none";

    for (const asset of result.assets) {
      searchResults.appendChild(createResultItem(asset));
    }
  } catch (err: any) {
    searchStatus.textContent = "Error: " + err.message;
  }
}

function createResultItem(asset: Asset): HTMLElement {
  assetsById.set(asset.id, asset);
  const el = document.createElement("div");
  el.className = "result-item";
  el.onclick = () => openAsset(asset);

  el.innerHTML = `
    <div class="result-thumb">
      ${asset.previewUrl ? `<img src="${esc(asset.previewUrl)}" loading="lazy" alt="">` : ""}
    </div>
    <div class="result-info">
      <h4 title="${esc(asset.title)}">${esc(asset.title)}</h4>
      <div class="result-meta">
        <span class="result-badge">${esc(asset.source)}</span>
        <span class="result-badge">${esc(asset.license)}</span>
        ${asset.author ? esc(asset.author) : ""}
      </div>
    </div>
  `;
  return el;
}

// --- Routing ---
function navigate(hash: string) {
  if (location.hash !== hash) location.hash = hash;
}

// --- Asset files ---
backToSearch.addEventListener("click", () => {
  navigate("");
});

async function openAsset(asset: Asset) {
  currentAsset = asset;
  navigate(`#asset/${encodeURIComponent(asset.id)}`);
  showAssetPanel(asset);
}

async function openAssetById(assetId: string) {
  // Check if we already have it cached
  let asset = assetsById.get(assetId);
  if (!asset) {
    // Fetch from search results or create a minimal stub via content list
    asset = { id: assetId, source: "", title: assetId, type: "sprite", tags: [], license: "", pageUrl: "" } as Asset;
  }
  currentAsset = asset;
  showAssetPanel(asset);
}

const assetsById = new Map<string, Asset>();

async function showAssetPanel(asset: Asset) {
  assetTitle.textContent = asset.title;
  assetLink.href = asset.pageUrl;
  assetLink.textContent = asset.pageUrl ? `Open on ${asset.source}` : "";
  assetLink.style.display = asset.pageUrl ? "" : "none";
  fileList.innerHTML = '<div style="color:#666;font-size:12px">Loading files...</div>';

  // Switch to files panel
  $<HTMLElement>(".panel:first-of-type")!.style.display = "none";
  filesPanel.style.display = "";

  try {
    const content = await getContentList(asset.id);
    const imageFiles = content.files.filter((f) =>
      /\.(png|jpg|jpeg|gif|svg|webp|bmp)$/i.test(f.path),
    );

    if (imageFiles.length === 0) {
      fileList.innerHTML = '<div style="color:#666;font-size:12px">No image files found.</div>';
      return;
    }

    fileList.innerHTML = "";
    for (const file of imageFiles) {
      fileList.appendChild(createFileItem(asset, file));
    }
  } catch (err: any) {
    fileList.innerHTML = `<div style="color:#f66;font-size:12px">Error: ${esc(err.message)}</div>`;
  }
}

function createFileItem(asset: Asset, file: ContentFile): HTMLElement {
  const url = getFileUrl(asset.id, file.path);
  const el = document.createElement("div");
  el.className = "file-item";
  el.onclick = () => {
    if (currentAsset) navigate(`#asset/${encodeURIComponent(currentAsset.id)}/${file.path}`);
    loadSprite(url, el, file.path);
  };

  const sizeStr = file.size > 1024 ? `${(file.size / 1024).toFixed(1)}KB` : `${file.size}B`;
  const name = file.path.split("/").pop() || file.path;

  el.innerHTML = `
    <div class="file-icon"><img src="${esc(url)}" loading="lazy" alt=""></div>
    <span class="file-name" title="${esc(file.path)}">${esc(name)}</span>
    <span class="file-size">${sizeStr}</span>
  `;
  return el;
}

/** Load a sprite by path — finds its element in the file list and highlights it */
function loadSpriteByPath(assetId: string, filePath: string) {
  const url = getFileUrl(assetId, filePath);
  currentFilePath = filePath;

  // Find and highlight the matching file item
  const items = fileList.querySelectorAll<HTMLElement>(".file-item");
  let matched: HTMLElement | null = null;
  items.forEach((el) => {
    const title = el.querySelector(".file-name")?.getAttribute("title");
    if (title === filePath) matched = el;
  });

  if (matched) {
    loadSprite(url, matched, filePath);
  } else {
    // File list might not have it — just load directly
    emptyState.style.display = "none";
    controls.style.display = "";
    renderer.loadImage(url).then(() => updateControlsUI());
  }
}

// --- Canvas / renderer ---
async function loadSprite(url: string, fileEl: HTMLElement, filePath?: string) {
  currentFilePath = filePath || null;
  // Highlight active
  fileList.querySelectorAll(".file-item").forEach((el) => el.classList.remove("active"));
  fileEl.classList.add("active");

  emptyState.style.display = "none";
  controls.style.display = "";

  try {
    await renderer.loadImage(url);
    updateControlsUI();
  } catch (err: any) {
    emptyState.style.display = "";
    emptyState.textContent = "Failed to load: " + err.message;
  }
}

renderer.onChange = () => updateControlsUI();

function updateControlsUI() {
  const state = renderer.getState();
  frameCountEl.textContent = String(state.totalFrames);
  currentFrameEl.textContent = String(state.currentFrame + 1);
  playPauseBtn.textContent = state.playing ? "Pause" : "Play";
}

// Auto-detect
autoDetectBtn.addEventListener("click", async () => {
  const image = renderer.getImage();
  if (!image) return;

  autoDetectBtn.disabled = true;
  detectStatus.textContent = "Analyzing...";

  try {
    const params = await autoDetect(image, currentAsset, currentFilePath);

    // Apply detected params
    frameWInput.value = String(params.frameW);
    frameHInput.value = String(params.frameH);
    offsetXInput.value = String(params.offsetX);
    offsetYInput.value = String(params.offsetY);
    fpsInput.value = String(params.fps);

    renderer.setOffset(params.offsetX, params.offsetY);
    renderer.setFrameSize(params.frameW, params.frameH);
    renderer.setFps(params.fps);

    // Switch to spritesheet mode if multiple frames detected
    const state = renderer.getState();
    if (state.totalFrames > 1) {
      modeSelect.value = "spritesheet";
      renderer.setMode("spritesheet");
      sheetControls.style.display = "";
      renderer.play();
    }

    detectStatus.textContent = params.detail || `${params.source}`;
    detectStatus.title = params.detail || "";
    updateControlsUI();
  } catch (err: any) {
    detectStatus.textContent = "Failed: " + err.message;
  } finally {
    autoDetectBtn.disabled = false;
  }
});

// Controls wiring
modeSelect.addEventListener("change", () => {
  const mode = modeSelect.value as "static" | "spritesheet";
  renderer.setMode(mode);
  sheetControls.style.display = mode === "spritesheet" ? "" : "none";
  updateControlsUI();
});

frameWInput.addEventListener("change", () => {
  renderer.setFrameSize(Number(frameWInput.value), Number(frameHInput.value));
  updateControlsUI();
});
frameHInput.addEventListener("change", () => {
  renderer.setFrameSize(Number(frameWInput.value), Number(frameHInput.value));
  updateControlsUI();
});
fpsInput.addEventListener("change", () => {
  renderer.setFps(Number(fpsInput.value));
});

playPauseBtn.addEventListener("click", () => {
  renderer.togglePlay();
  updateControlsUI();
});
prevFrameBtn.addEventListener("click", () => renderer.prevFrame());
nextFrameBtn.addEventListener("click", () => renderer.nextFrame());

offsetXInput.addEventListener("change", () => {
  renderer.setOffset(Number(offsetXInput.value), Number(offsetYInput.value));
  updateControlsUI();
});
offsetYInput.addEventListener("change", () => {
  renderer.setOffset(Number(offsetXInput.value), Number(offsetYInput.value));
  updateControlsUI();
});

zoomInput.addEventListener("input", () => {
  const z = Number(zoomInput.value);
  zoomLabel.textContent = z + "x";
  renderer.setZoom(z);
});

bgSelect.addEventListener("change", () => {
  renderer.setBg(bgSelect.value as Background);
});

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// --- Chat ---
const chatEngine = new ChatEngine(
  {
    onOpenAsset: (assetId, asset) => {
      assetsById.set(assetId, asset);
      navigate(`#asset/${assetId}`);
      openAssetById(assetId);
    },
    onLoadSprite: async (assetId, filePath, asset) => {
      currentAsset = asset;
      currentFilePath = filePath;
      const url = getFileUrl(assetId, filePath);
      emptyState.style.display = "none";
      controls.style.display = "";
      await renderer.loadImage(url);
      updateControlsUI();
    },
    onConfigureAnimation: (params) => {
      frameWInput.value = String(params.frameW);
      frameHInput.value = String(params.frameH);
      fpsInput.value = String(params.fps);
      offsetXInput.value = String(params.offsetX);
      offsetYInput.value = String(params.offsetY);
      renderer.setOffset(params.offsetX, params.offsetY);
      renderer.setFrameSize(params.frameW, params.frameH);
      renderer.setFps(params.fps);
      const state = renderer.getState();
      if (state.totalFrames > 1) {
        modeSelect.value = "spritesheet";
        renderer.setMode("spritesheet");
        sheetControls.style.display = "";
        renderer.play();
      }
      updateControlsUI();
    },
    onAutoDetect: async () => {
      const image = renderer.getImage();
      if (!image) return "No image loaded in viewer.";
      const params = await autoDetect(image, currentAsset, currentFilePath);
      frameWInput.value = String(params.frameW);
      frameHInput.value = String(params.frameH);
      offsetXInput.value = String(params.offsetX);
      offsetYInput.value = String(params.offsetY);
      fpsInput.value = String(params.fps);
      renderer.setOffset(params.offsetX, params.offsetY);
      renderer.setFrameSize(params.frameW, params.frameH);
      renderer.setFps(params.fps);
      const state = renderer.getState();
      if (state.totalFrames > 1) {
        modeSelect.value = "spritesheet";
        renderer.setMode("spritesheet");
        sheetControls.style.display = "";
        renderer.play();
      }
      updateControlsUI();
      return `Detected: ${params.frameW}x${params.frameH} @ ${params.fps}fps (${params.source}). ${params.detail || ""}`;
    },
  },
  () => {},
);
initChatUI(chatEngine);

// --- Hash routing ---
function handleHash() {
  const hash = location.hash;
  if (!hash || hash === "#") {
    // Show search panel
    filesPanel.style.display = "none";
    $<HTMLElement>(".panel:first-of-type")!.style.display = "";
    return;
  }

  const match = hash.match(/^#asset\/([^/]+)(?:\/(.+))?$/);
  if (match) {
    const [, rawAssetId, filePath] = match;
    const assetId = decodeURIComponent(rawAssetId);
    openAssetById(assetId).then(() => {
      if (filePath) {
        loadSpriteByPath(assetId, filePath);
      }
    });
  }
}

window.addEventListener("hashchange", handleHash);

// Init
initSettingsUI();
if (location.hash && location.hash !== "#") {
  handleHash();
} else {
  doSearch();
}
