import { searchAssets, getContentList, getFileUrl, type Asset } from "./api";
import { loadSettings } from "./settings";

// --- Types ---

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

// --- Tool definitions for OpenAI function calling ---

const tools = [
  {
    type: "function" as const,
    function: {
      name: "search_assets",
      description: "Search for free game assets (sprites, tilesets, characters, etc.) on itch.io",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query, e.g. 'pixel art knight run animation'" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_asset_files",
      description: "Get the list of image files inside an asset package. Returns file paths.",
      parameters: {
        type: "object",
        properties: {
          asset_id: { type: "string", description: "The asset ID from search results" },
        },
        required: ["asset_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "open_asset",
      description: "Open an asset pack in the sidebar so the user can browse all its files. This navigates the app to the asset view.",
      parameters: {
        type: "object",
        properties: {
          asset_id: { type: "string", description: "The asset ID from search results" },
        },
        required: ["asset_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "load_sprite",
      description: "Load a specific sprite file into the canvas viewer. Use open_asset first to let the user browse, or this to load a specific file directly.",
      parameters: {
        type: "object",
        properties: {
          asset_id: { type: "string", description: "The asset ID" },
          file_path: { type: "string", description: "Path to the image file within the asset" },
        },
        required: ["asset_id", "file_path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "configure_animation",
      description: "Configure spritesheet animation parameters and start playback",
      parameters: {
        type: "object",
        properties: {
          frame_width: { type: "number", description: "Width of a single frame in pixels" },
          frame_height: { type: "number", description: "Height of a single frame in pixels" },
          fps: { type: "number", description: "Frames per second for animation playback" },
          offset_x: { type: "number", description: "X offset where first frame starts (default 0)" },
          offset_y: { type: "number", description: "Y offset where first frame starts (default 0)" },
        },
        required: ["frame_width", "frame_height"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "auto_detect",
      description: "Run AI auto-detection on the currently loaded sprite to detect frame size, offset, and FPS automatically",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

const SYSTEM_PROMPT = `You are a helpful game asset assistant inside a sprite sandbox tool. You help users find and preview free game sprites and assets.

You have access to these tools:
- search_assets: Search for assets on itch.io
- get_asset_files: List image files in an asset package
- open_asset: Open an asset pack in the sidebar so the user can browse its files
- load_sprite: Load a specific sprite file into the canvas viewer
- configure_animation: Set up spritesheet animation (frame size, fps, offset)
- auto_detect: Auto-detect spritesheet parameters using AI vision

Typical workflow:
1. User describes what they need
2. You search for matching assets
3. Open the most promising asset pack with open_asset so the user can browse files
4. Optionally load a specific sprite with load_sprite if the user asks

IMPORTANT RULES:
- ALWAYS use open_asset to show results — NEVER use load_sprite unless the user explicitly names a specific file.
- open_asset opens the asset pack in the sidebar so the user can browse all files themselves.
- Be concise. Briefly describe what you found and open the best match.`;

// --- Callbacks for tool execution ---

export interface ChatCallbacks {
  onOpenAsset: (assetId: string, asset: Asset) => void;
  onLoadSprite: (assetId: string, filePath: string, asset: Asset) => Promise<void>;
  onConfigureAnimation: (params: { frameW: number; frameH: number; fps: number; offsetX: number; offsetY: number }) => void;
  onAutoDetect: () => Promise<string>;
}

// --- Chat engine ---

export class ChatEngine {
  private messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
  private callbacks: ChatCallbacks;
  private onUpdate: (messages: ChatMessage[]) => void;
  private assetsCache = new Map<string, Asset>();

  constructor(callbacks: ChatCallbacks, onUpdate: (messages: ChatMessage[]) => void) {
    this.callbacks = callbacks;
    this.onUpdate = onUpdate;
  }

  getVisibleMessages(): Array<{ role: string; content: string }> {
    return this.messages
      .filter((m) => (m.role === "user" || m.role === "assistant") && m.content)
      .map((m) => ({ role: m.role, content: m.content! }));
  }

  async send(userMessage: string): Promise<void> {
    this.messages.push({ role: "user", content: userMessage });
    this.onUpdate(this.messages);

    await this.runLoop();
  }

  private async runLoop(): Promise<void> {
    const settings = loadSettings();
    if (!settings.openaiApiKey) {
      this.messages.push({ role: "assistant", content: "Please set your OpenAI API key in Settings (gear icon) first." });
      this.onUpdate(this.messages);
      return;
    }

    // Loop to handle multi-turn tool calls
    for (let i = 0; i < 10; i++) {
      const usesNew = /^(o[1-9]|gpt-4\.[1-9]|gpt-4\.5|gpt-5|chatgpt-4o-latest)/.test(settings.model);
      const tokenParam = usesNew ? { max_completion_tokens: 1000 } : { max_tokens: 1000 };

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: settings.model,
          ...tokenParam,
          tools,
          messages: this.messages,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        this.messages.push({ role: "assistant", content: `API error: ${res.status} — ${err}` });
        this.onUpdate(this.messages);
        return;
      }

      const data = await res.json() as any;
      const choice = data.choices?.[0];
      if (!choice) break;

      const msg = choice.message;

      // Add assistant message
      this.messages.push(msg);
      this.onUpdate(this.messages);

      // If no tool calls, we're done
      if (!msg.tool_calls || msg.tool_calls.length === 0) break;

      // Execute tool calls
      for (const tc of msg.tool_calls) {
        const result = await this.executeTool(tc.function.name, tc.function.arguments);
        this.messages.push({ role: "tool", tool_call_id: tc.id, content: result });
      }
      this.onUpdate(this.messages);
    }
  }

  private async executeTool(name: string, argsJson: string): Promise<string> {
    try {
      const args = JSON.parse(argsJson);

      switch (name) {
        case "search_assets": {
          const result = await searchAssets(args.query, { source: "itchio", type: "sprite", limit: 10 });
          // Cache assets for later reference
          for (const a of result.assets) this.assetsCache.set(a.id, a);
          return JSON.stringify({
            total: result.total,
            assets: result.assets.map((a) => ({
              id: a.id,
              title: a.title,
              author: a.author,
              license: a.license,
              preview: a.previewUrl,
              page: a.pageUrl,
            })),
          });
        }

        case "get_asset_files": {
          const content = await getContentList(args.asset_id);
          const imageFiles = content.files.filter((f) =>
            /\.(png|jpg|jpeg|gif|svg|webp|bmp)$/i.test(f.path),
          );
          return JSON.stringify({
            total_files: content.files.length,
            image_files: imageFiles.map((f) => ({
              path: f.path,
              size: f.size,
              url: getFileUrl(args.asset_id, f.path),
            })),
          });
        }

        case "open_asset": {
          const asset = this.assetsCache.get(args.asset_id);
          if (asset) {
            this.callbacks.onOpenAsset(args.asset_id, asset);
            return `Opened asset pack "${asset.title}" in the sidebar. The user can now browse its files.`;
          }
          return "Asset not found in cache. Search for it first.";
        }

        case "load_sprite": {
          const asset = this.assetsCache.get(args.asset_id) || null;
          if (asset) {
            await this.callbacks.onLoadSprite(args.asset_id, args.file_path, asset);
            return `Loaded "${args.file_path}" into the viewer.`;
          }
          return "Asset not found in cache. Search for it first.";
        }

        case "configure_animation": {
          this.callbacks.onConfigureAnimation({
            frameW: args.frame_width,
            frameH: args.frame_height,
            fps: args.fps || 10,
            offsetX: args.offset_x || 0,
            offsetY: args.offset_y || 0,
          });
          return `Animation configured: ${args.frame_width}x${args.frame_height} @ ${args.fps || 10}fps`;
        }

        case "auto_detect": {
          const result = await this.callbacks.onAutoDetect();
          return result;
        }

        default:
          return `Unknown tool: ${name}`;
      }
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  }
}

// --- Chat UI ---

export function initChatUI(engine: ChatEngine): void {
  const panel = document.querySelector<HTMLDivElement>("#chatPanel")!;
  const messages = document.querySelector<HTMLDivElement>("#chatMessages")!;
  const form = document.querySelector<HTMLFormElement>("#chatForm")!;
  const input = document.querySelector<HTMLInputElement>("#chatInput")!;
  const toggleBtn = document.querySelector<HTMLButtonElement>("#chatToggle")!;

  let isOpen = false;

  toggleBtn.addEventListener("click", () => {
    isOpen = !isOpen;
    panel.classList.toggle("open", isOpen);
    if (isOpen) input.focus();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    input.disabled = true;

    try {
      await engine.send(text);
    } finally {
      input.disabled = false;
      input.focus();
    }
  });

  // Render on updates
  engine["onUpdate"] = () => {
    renderMessages(messages, engine.getVisibleMessages());
  };
}

function renderMessages(container: HTMLDivElement, msgs: Array<{ role: string; content: string }>) {
  container.innerHTML = "";
  for (const msg of msgs) {
    const el = document.createElement("div");
    el.className = `chat-msg chat-msg-${msg.role}`;
    el.textContent = msg.content;
    container.appendChild(el);
  }
  container.scrollTop = container.scrollHeight;
}
