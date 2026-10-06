#!/usr/bin/env node
/**
 * Zero-dependency static server for local development.
 *
 *   npm run dev
 *
 * Serves the project root and serves `js/env.js` straight from `.env`, so
 * `js/env.js` never has to exist on disk while you are developing.
 * Replaces `npx serve .` (which downloaded a package on every run).
 */
import { createServer, request as httpRequest } from "node:http";
import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import {
  ROOT,
  ENV_FILE,
  loadEnvFile,
  renderEnvJs,
} from "./lib/env.mjs";

const PORT = Number(process.env.PORT || loadEnvFile().PORT || 5173);
const API_PORT = Number(process.env.API_PORT || loadEnvFile().API_PORT || 3000);

// The API (server/index.js) runs as a child of this process so one Ctrl+C
// stops both.
let api = null;
const stopApi = () => {
  try {
    api?.kill();
  } catch {
    /* already gone */
  }
};
process.on("exit", stopApi);
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    stopApi();
    process.exit(sig === "SIGINT" ? 130 : 143);
  });
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".sql": "text/plain; charset=utf-8",
};

// Environment changes should show up without restarting the server.
let cachedKey = null;
let cachedJs = null;
function envJs() {
  const src = existsSync(ENV_FILE) ? ENV_FILE : null;
  const stamp = src ? String(statSync(src).mtimeMs) : "none";
  if (stamp !== cachedKey) {
    cachedKey = stamp;
    const env = loadEnvFile();
    cachedJs = renderEnvJs(
      (env.SUPABASE_URL || "").trim(),
      (env.SUPABASE_ANON_KEY || "").trim(),
    );
  }
  return cachedJs;
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);

  // /api belongs to the API server (spawned below). Without this the
  // frontend's relative fetch("/api/...") would hit the static server 404.
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    const upstream = httpRequest(
      {
        host: "127.0.0.1",
        port: API_PORT,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${API_PORT}` },
      },
      (up) => {
        res.writeHead(up.statusCode || 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            code: "API_DOWN",
            message: `API not reachable on port ${API_PORT} - run: npm run dev:api`,
          },
        }),
      );
    });
    req.pipe(upstream);
    return;
  }

  // Special case: build js/env.js on the fly from .env.
  if (pathname === "/js/env.js") {
    res.writeHead(200, {
      "Content-Type": TYPES[".js"],
      "Cache-Control": "no-store",
    });
    return res.end(envJs());
  }
  // Never serve .env, .git, node_modules, the SQL schema, the scripts, the
  // server sources, the docs or the package manifests - the same rule
  // server/app.js applies.
  if (
    /(^|\/)(\.env|\.git|node_modules|supabase|scripts|server|docs|package(?:-lock)?\.json)($|\/)/.test(pathname)
  ) {
    res.writeHead(404, { "Content-Type": TYPES[".txt"] });
    return res.end("Not found");
  }
  if (pathname.endsWith("/")) pathname += "index.html";

  // Block path traversal: everything must stay inside ROOT.
  const target = resolve(join(ROOT, normalize(pathname)));
  if (target !== ROOT && !target.startsWith(ROOT + sep)) {
    res.writeHead(403, { "Content-Type": TYPES[".txt"] });
    return res.end("Forbidden");
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    res.writeHead(404, { "Content-Type": TYPES[".html"] });
    return res.end(
      '<h1>404</h1><p>Not found. <a href="/">Back to the site</a></p>',
    );
  }

  const ext = extname(target).toLowerCase();
  res.writeHead(200, {
    "Content-Type": TYPES[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-store" : "no-cache",
  });
  createReadStream(target).pipe(res);
});

// Spawn the API before the static server starts (its own banner prints when
// it is ready). If it fails - missing deps, port clash - the site keeps
// working and the error streams through stdio above.
api = spawn(process.execPath, [resolve(ROOT, "server", "index.js")], {
  stdio: ["ignore", "inherit", "inherit"],
});
api.on("error", (e) => console.error(`  ! API could not start: ${e.message}`));
api.on("exit", (code) => {
  if (code)
    console.error(`  ! API exited with code ${code}. Run \`npm run dev:api\` to see why.`);
});

server.listen(PORT);

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(
      `\nPort ${PORT} is already in use. Try: PORT=5174 npm run dev\n`,
    );
    process.exit(1);
  }
  throw e;
});
