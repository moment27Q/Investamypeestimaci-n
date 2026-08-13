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
const { getDescriptionAdjustment } = require("./descripcion");
const { getAdvisory } = require("./asesor");
const { analyzePhotos, analyzeValuationPhotos } = require("./vision");
const { validateLocation } = require("./ubicacion");
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
  const allowedOrigins = new Set([
    "https://investamype.com",
    "https://www.investamype.com",
    "https://tasador.investamype.com"
  ]);
  const requestOrigin = req.headers.origin;
  const corsOrigin = allowedOrigins.has(requestOrigin)
    ? requestOrigin
    : "https://investamype.com";
  const corsHeaders = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
  Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }
  const parsed = url.parse(req.url, true);

  if (parsed.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, uptime: Math.round(process.uptime()) }));
    return;
  }

  if (parsed.pathname === "/api/diag") {
    const os = require("os");
    const mask = (k) => (k ? k.slice(0, 4) + "…" + k.slice(-4) : "(no configurada)");
    let chromium = { installed: false, path: null, error: null };
    try {
      const pw = require("playwright");
      const exe = pw.chromium.executablePath();
      chromium = { installed: fs.existsSync(exe), path: exe, error: null };
    } catch (e) {
      chromium.error = e.message;
    }
    const aiKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.GROQ_API_KEY || "";
    const diag = {
      ok: true,
      uptime: Math.round(process.uptime()),
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      memoryMB: Math.round(os.totalmem() / 1048576),
      scraperLoaded: !!(getComparables && getRentals && getNexoProjects),
      chromium: chromium,
      env: {
        aiKey: aiKey ? mask(aiKey) : "(no configurada)",
        aiKeyName: aiKey ? (aiKey.startsWith("gsk_") ? "Groq" : "xAI") : null,
        grokModel: process.env.GROK_MODEL || process.env.GROQ_MODEL || "(default)",
        port: process.env.PORT || "3000",
        nodeVersionEnv: process.env.NODE_VERSION || "(sin fijar)"
      }
    };
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(diag, null, 2));
    return;
  }

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

  if (parsed.pathname === "/api/validate-location") {
    const q = parsed.query;
    const loc = {
      lat: q.lat != null ? parseFloat(q.lat) : null,
      lon: q.lon != null ? parseFloat(q.lon) : null,
      district: q.district || null,
      city: q.city || null,
      address: q.address || null
    };
    validateLocation(loc)
      .then((data) => {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        });
        res.end(JSON.stringify(data));
      })
      .catch((e) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ enabled: false, valid: null, reason: e.message }));
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

  if (parsed.pathname === "/api/maximiza") {
    const q = parsed.query;
    const f = (v, d) => { const n = parseFloat(v); return isNaN(n) ? d : n; };
    const ctx = {
      district: q.district || null,
      city: q.city || null,
      landArea: f(q.landArea, 0),
      builtArea: f(q.builtArea, 0),
      zoning: q.zoning || "otro",
      budget: f(q.budget, 0),
      objective: q.objective || "venta",
      mode: q.mode || "todas",
      salePerM2: f(q.salePerM2, 0),
      landValue: f(q.landValue, 0),
      saleTotal: f(q.saleTotal, 0),
      rentaMonthly: f(q.rentaMonthly, 0),
      costAlbanil: f(q.costAlbanil, 0),
      costConstructora: f(q.costConstructora, 0),
      shareDefault: f(q.shareDefault, 50),
      fotoAnalisis: q.fotoAnalisis || null
    };
    getAdvisory(ctx)
      .then((data) => {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        });
        res.end(JSON.stringify(data));
      })
      .catch((e) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ enabled: false, reason: e.message, plan: null }));
      });
    return;
  }

  if (parsed.pathname === "/api/environment") {    const q = parsed.query;
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

  if (req.method === "POST" && parsed.pathname === "/api/analiza-fotos") {
    let body = "";
    req.on("data", (d) => {
      body += d;
      if (body.length > 50000000) req.destroy();
    });
    req.on("end", async () => {
      let payload = {};
      try {
        payload = JSON.parse(body || "{}");
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ enabled: false, reason: "JSON inválido" }));
        return;
      }
      const loc = {
        district: payload.district || null,
        city: payload.city || null,
        lat: payload.lat != null ? parseFloat(payload.lat) : null,
        lon: payload.lon != null ? parseFloat(payload.lon) : null
      };
      const images = (Array.isArray(payload.images) ? payload.images : [])
        .filter((u) => typeof u === "string" && u.startsWith("data:image/"))
        .slice(0, 4);
      try {
        const data = payload.mode === "valuation"
          ? await analyzeValuationPhotos(loc, images, payload.inputs || {})
          : await analyzePhotos(loc, images);
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        });
        res.end(JSON.stringify(data));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ enabled: false, reason: e.message }));
      }
    });
    return;
  }

  if (req.method === "POST" && parsed.pathname === "/api/descripcion") {
    let body = "";
    req.on("data", (d) => {
      body += d;
      if (body.length > 200000) req.destroy();
    });
    req.on("end", async () => {
      let payload = {};
      try {
        payload = JSON.parse(body || "{}");
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ enabled: false, used: false, factor: 1, reason: "JSON inválido" }));
        return;
      }
      const ctx = {
        district: payload.district || null,
        city: payload.city || null,
        type: payload.type || "departamento",
        inputs: payload.inputs || {},
        description: String(payload.description || "").slice(0, 2000)
      };
      try {
        const data = await getDescriptionAdjustment(ctx);
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        });
        res.end(JSON.stringify(data));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ enabled: false, used: false, factor: 1, reason: e.message }));
      }
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
