const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

(function loadEnv() {
  try {
    const lines = fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch (e) { /* sin .env */ }
})();

let getComparables = null;
let getListingDetail = null;
let getRentals = null;
let getNexoProjects = null;
try {
  ({ getComparables, getListingDetail, getRentals, getNexoProjects } = require("./scraper"));
} catch (e) {
  console.log("  [aviso] Playwright no está instalado; los precios de mercado quedarán desactivados. Ejecuta: npm install");
}

const { getEnvironmentProfile } = require("./environment");
const geocoder = require("./geocoder");

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

  if (parsed.pathname === "/api/geocode") {
    const q = (parsed.query.q || "").trim();
    if (!q) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Falta el parámetro q" }));
      return;
    }
    geocoder.search(q)
      .then((data) => {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(data));
      })
      .catch((e) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      });
    return;
  }

  if (parsed.pathname === "/api/reverse") {
    const lat = parseFloat(parsed.query.lat);
    const lon = parseFloat(parsed.query.lon);
    if (isNaN(lat) || isNaN(lon)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Faltan lat y lon" }));
      return;
    }
    geocoder.reverse(lat, lon)
      .then((data) => {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(data));
      })
      .catch((e) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      });
    return;
  }

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

  if (parsed.pathname === "/api/rentals") {
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
    if (!getRentals) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Módulo de precios de alquiler no disponible (npm install pendiente)", count: 0 }));
      return;
    }
    getRentals(query)
      .then((data) => {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        });
        res.end(JSON.stringify(data));
      })
      .catch((e) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Error al obtener alquileres", detail: e.message }));
      });
    return;
  }

  if (parsed.pathname === "/api/nexo") {
    const q = parsed.query;
    const query = {
      district: q.district || null,
      city: q.city || null,
      all: q.all === "1" || q.all === "true"
    };
    if (!query.district && !query.city) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Falta district o city" }));
      return;
    }
    if (!getNexoProjects) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Módulo de proyectos Nexo no disponible (npm install pendiente)", count: 0 }));
      return;
    }
    getNexoProjects(query)
      .then((data) => {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        });
        res.end(JSON.stringify(data));
      })
      .catch((e) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Error al obtener proyectos Nexo", detail: e.message, count: 0 }));
      });
    return;
  }

  if (parsed.pathname === "/api/listing-detail") {
    const u = (parsed.query.url || "").trim();
    if (!getListingDetail || !/^https:\/\/(www\.)?(adondevivir|urbania|remax|nexoinmobiliario)\./i.test(u)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "URL no válida", images: [], title: "", description: "" }));
      return;
    }
    getListingDetail(u)
      .then((data) => {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        });
        res.end(JSON.stringify(data));
      })
      .catch((e) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No se pudo obtener el detalle", images: [], title: "", description: "" }));
      });
    return;
  }

  if (parsed.pathname === "/api/environment") {
    const q = parsed.query;
    const loc = {
      lat: q.lat != null ? parseFloat(q.lat) : null,
      lon: q.lon != null ? parseFloat(q.lon) : null,
      district: q.district || null,
      city: q.city || null
    };
    if (loc.lat == null && loc.lon == null && !loc.district && !loc.city) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Faltan lat/lon o district/city" }));
      return;
    }
    getEnvironmentProfile(loc)
      .then((data) => {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        });
        res.end(JSON.stringify(data));
      })
      .catch((e) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Error en análisis de entorno", detail: e.message }));
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
