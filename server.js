const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

let getComparables = null;
try {
  ({ getComparables } = require("./scraper"));
} catch (e) {
  console.log("  [aviso] Playwright no está instalado; los precios de mercado quedarán desactivados. Ejecuta: npm install");
}

const ROOT = __dirname;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);

  if (parsed.pathname === "/api/comparables") {
    const q = parsed.query;
    const query = {
      district: q.district || null,
      city: q.city || null,
      type: q.type || "departamento"
    };
    if (!query.district && !query.city) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Falta district o city" }));
      return;
    }
    if (!getComparables) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Módulo de precios de mercado no disponible (npm install pendiente)", count: 0 }));
      return;
    }
    getComparables(query)
      .then((data) => {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        });
        res.end(JSON.stringify(data));
      })
      .catch((e) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Error al obtener comparables", detail: e.message }));
      });
    return;
  }

  let urlPath = decodeURIComponent(parsed.pathname);
  if (urlPath === "/") urlPath = "/index.html";

  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const type = MIME[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    fs.createReadStream(filePath).pipe(res);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  Tasador Perú — http://localhost:${PORT}\n`);
});
