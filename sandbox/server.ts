import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";

const DIST = join(import.meta.dirname, "dist");
const API_TARGET = process.env.API_URL || "http://app:3000";
const PORT = Number(process.env.PORT) || 5173;

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  // Proxy /api/* to the MCP API server
  if (url.pathname.startsWith("/api/")) {
    try {
      const target = API_TARGET + url.pathname + url.search;
      const proxyRes = await fetch(target, {
        method: req.method,
        headers: { ...Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === "string") as [string, string][]) },
        body: req.method !== "GET" && req.method !== "HEAD" ? await readBody(req) : undefined,
      });

      res.writeHead(proxyRes.status, Object.fromEntries(proxyRes.headers.entries()));
      const buf = Buffer.from(await proxyRes.arrayBuffer());
      res.end(buf);
    } catch (err) {
      res.writeHead(502);
      res.end("Proxy error");
    }
    return;
  }

  // Serve static files
  let filePath = join(DIST, url.pathname === "/" ? "index.html" : url.pathname);
  try {
    const s = await stat(filePath);
    if (s.isDirectory()) filePath = join(filePath, "index.html");
  } catch {
    filePath = join(DIST, "index.html"); // SPA fallback
  }

  try {
    const data = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

function readBody(req: import("node:http").IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Sandbox running at http://0.0.0.0:${PORT}`);
  console.log(`Proxying /api/* to ${API_TARGET}`);
});
