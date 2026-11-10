// CommitCraft AI — zero-dependency Node server.
// Serves the web UI and a small JSON API backed by the BharatCode model API.

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { generate, aiMode } from "./lib/ai.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const pub = join(root, "public");
const PORT = process.env.PORT || 4173;

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/api/health") {
      return json(res, 200, { ok: true, mode: aiMode() });
    }
    if (req.method === "POST" && req.url === "/api/generate") {
      let body = "";
      req.on("data", (c) => {
        body += c;
        if (body.length > 512_000) req.destroy();
      });
      req.on("end", async () => {
        try {
          const { kind, input } = JSON.parse(body || "{}");
          const out = await generate(kind, input);
          json(res, 200, out);
        } catch (err) {
          json(res, 400, { error: err.message });
        }
      });
      return;
    }
    if (req.method === "GET") {
      const path = req.url === "/" ? "/index.html" : req.url.split("?")[0];
      const file = normalize(join(pub, path));
      if (!file.startsWith(pub)) return json(res, 403, { error: "forbidden" });
      const data = await readFile(file);
      res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
      return res.end(data);
    }
    json(res, 405, { error: "method not allowed" });
  } catch {
    json(res, 404, { error: "not found" });
  }
});

function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

server.listen(PORT, () => {
  console.log(`CommitCraft AI → http://localhost:${PORT}  [${aiMode()}]`);
});
