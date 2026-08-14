const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const crypto = require("crypto");

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
let getCocheraComparables = null;
try {
  ({ getComparables, getListingDetail, getRentals, getNexoProjects, getCocheraComparables } = require("./scraper"));
} catch (e) {
  console.log("  [aviso] Playwright no está instalado; los precios de mercado quedarán desactivados. Ejecuta: npm install");
}

let sendMail = null;
const MAIL_FROM = process.env.MAIL_FROM || process.env.MAIL_USER || "contacto@tasador.investamype.com";
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || "Tasora";

if (process.env.BREVO_API_KEY) {
  // Brevo (ex Sendinblue) por HTTPS: funciona en el plan Free de Render,
  // que bloquea el SMTP saliente (puertos 25/465/587).
  sendMail = async (to, subject, html) => {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY,
        "Accept": "application/json"
      },
      body: JSON.stringify({
        sender: { name: MAIL_FROM_NAME, email: MAIL_FROM },
        to: [{ email: String(to) }],
        subject: String(subject),
        htmlContent: String(html)
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || ("Brevo HTTP " + res.status));
    return data;
  };
} else {
  try {
    const nodemailer = require("nodemailer");
    sendMail = (to, subject, html) => {
      const transporter = nodemailer.createTransport({
        host: process.env.MAIL_HOST || "tasador.investamype.com",
        port: parseInt(process.env.MAIL_PORT || "465", 10),
        secure: true,
        auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
      });
      return transporter.sendMail({
        from: (MAIL_FROM_NAME ? MAIL_FROM_NAME + " <" : "") + MAIL_FROM + (MAIL_FROM_NAME ? ">" : ""),
        to,
        subject,
        html
      });
    };
  } catch (e) {
    console.log("  [aviso] nodemailer no disponible; el envío de correos quedará desactivado.");
  }
}

const { getEnvironmentProfile } = require("./environment");
const { getDescriptionAdjustment } = require("./descripcion");
const { getAdvisory } = require("./asesor");
const { analyzePhotos, analyzeValuationPhotos } = require("./vision");
const { validateLocation } = require("./ubicacion");
const geocoder = require("./geocoder");

let db = null;
try {
  db = require("./db");
} catch (e) { /* sin postgres */ }

/*
 * Respaldar la tasación con la data guardada en la DB: si el scrape en vivo
 * devuelve pocos avisos (o ninguno) para un distrito, se combina con lo que
 * ya quedó guardado de ese mismo distrito y se recalculan las estadísticas.
 */
async function marketWithDbFallback(kind, query, liveData, minCount) {
  if (liveData.count >= minCount || !db || !db.getSavedMarket) return liveData;
  try {
    const saved = await db.getSavedMarket(kind, query);
    if (!saved) return liveData;
    const liveItems = liveData.listings || liveData.projects || [];
    const savedItems = saved.listings || saved.projects || [];
    const merged = db.buildMarket(kind, query, liveItems.concat(savedItems));
    if (!merged || merged.count < minCount) return liveData;
    merged.dataSource = merged.count === (savedItems.length ? saved.count : 0) ? "db" : "live+db";
    merged.fallbackFrom = (saved.fetchedAt || "").slice(0, 10);
    return merged;
  } catch (e) {
    return liveData;
  }
}

/*
 * Sirve el mercado de un distrito lo más rápido posible:
 *  1) Si la DB ya guardó avisos suficientes para ese distrito/tipo, responde
 *     de inmediato (milisegundos) y refresca la data en segundo plano.
 *  2) Si no, ejecuta el scrape en vivo (solo la primera vez) y lo guarda.
 */
async function serveMarket(kind, query, scraperFn, minCount, res, errorMsg) {
  const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  try {
    if (db && db.getSavedMarket) {
      const saved = await db.getSavedMarket(kind, query);
      if (saved && saved.count >= minCount) {
        saved.dataSource = "db";
        if (scraperFn) {
          scraperFn(query).catch((e) => console.log("[db] refresco 2º plano", kind, "→", e.message));
        }
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify(saved));
        return;
      }
    }
    if (!scraperFn) {
      res.writeHead(503, JSON_HEADERS);
      res.end(JSON.stringify({ error: "Módulo de precios de mercado no disponible (npm install pendiente)", count: 0 }));
      return;
    }
    const live = await scraperFn(query);
    const data = await marketWithDbFallback(kind, query, live, minCount);
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(500, JSON_HEADERS);
    res.end(JSON.stringify({ error: errorMsg, detail: e.message }));
  }
}

const ROOT = __dirname;

/* ---------- Límite diario de tasaciones por usuario ---------- */
// Cada cuenta tiene 5 tasaciones gratis por día (configurable con
// TASACIONES_DIARIAS). El contador vive en la tabla user_usage de Postgres.
const USAGE_LIMIT = parseInt(process.env.TASACIONES_DIARIAS || "5", 10);
const LIMA_OFFSET_MS = -5 * 3600 * 1000; // Lima (UTC-5)

function limaDate(now) {
  return new Date((now || Date.now()) + LIMA_OFFSET_MS).toISOString().slice(0, 10);
}

function nextLimaMidnight() {
  const lima = new Date(Date.now() + LIMA_OFFSET_MS);
  return Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate() + 1) - LIMA_OFFSET_MS;
}

const PAID_PLANS = { basico: true, premium: true };

async function usageStatusForUser(user) {
  const date = limaDate();
  if (user && user.plan && PAID_PLANS[user.plan]) {
    return { ok: true, unlimited: true, plan: user.plan, used: 0, limit: null, remaining: null, blocked: false, resetAt: null, date: date };
  }
  let used = 0;
  if (db && typeof db.getUserUsage === "function") {
    used = await db.getUserUsage(user.id, date);
    if (used == null) used = 0;
  }
  return {
    ok: true,
    plan: "free",
    used: used,
    limit: USAGE_LIMIT,
    remaining: Math.max(0, USAGE_LIMIT - used),
    blocked: used >= USAGE_LIMIT,
    resetAt: nextLimaMidnight(),
    date: date
  };
}

async function consumeUsageForUser(user) {
  const date = limaDate();
  if (user && user.plan && PAID_PLANS[user.plan]) {
    return { ok: true, unlimited: true, plan: user.plan, used: 0, limit: null, remaining: null, blocked: false, resetAt: null, date: date };
  }
  let used = 0;
  if (db && typeof db.getUserUsage === "function") {
    used = await db.getUserUsage(user.id, date);
    if (used == null) used = 0;
  }
  if (used >= USAGE_LIMIT) return usageStatusForUser(user);
  if (db && typeof db.incrementUserUsage === "function") {
    await db.incrementUserUsage(user.id, date);
  }
  return usageStatusForUser(user);
}

/* ---------- Autenticación (registro / inicio de sesión) ---------- */
const SESSION_DAYS = 30;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return salt + ":" + hash;
}

function verifyPassword(password, stored) {
  const parts = String(stored || "").split(":");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const test = crypto.scryptSync(String(password), parts[0], 64);
  const expected = Buffer.from(parts[1], "hex");
  return test.length === expected.length && crypto.timingSafeEqual(test, expected);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function startSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  if (db && db.createSession) {
    db.createSession(userId, hashToken(token), expiresAt).catch(() => {});
  }
  return token;
}

async function authUser(req) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !db || !db.findUserByToken) return null;
  try {
    return await db.findUserByToken(hashToken(token));
  } catch (e) {
    return null;
  }
}

async function requireAuth(req, res) {
  const user = await authUser(req);
  if (user) return user;
  res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: "Debes iniciar sesión para realizar esta acción." }));
  return null;
}

function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (d) => {
      body += d;
      if (body.length > (maxBytes || 100000)) {
        req.destroy();
        reject(new Error("Cuerpo demasiado grande"));
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (e) {
        reject(new Error("JSON inválido"));
      }
    });
    req.on("error", reject);
  });
}

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
  const requestOrigin = req.headers.origin;
  const corsOrigin = requestOrigin || "*";
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

  if (parsed.pathname === "/api/uso") {
    (async () => {
      const user = await requireAuth(req, res);
      if (!user) return;
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      });
      res.end(JSON.stringify(await usageStatusForUser(user)));
    })();
    return;
  }

  if (req.method === "POST" && parsed.pathname === "/api/uso/consumir") {
    (async () => {
      const user = await requireAuth(req, res);
      if (!user) return;
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      });
      res.end(JSON.stringify(await consumeUsageForUser(user)));
    })();
    return;
  }

  /* ---------- Registro / inicio de sesión ---------- */
  if (parsed.pathname === "/api/auth/me") {
    authUser(req)
      .then((user) => {
        if (!user) {
          res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: false, error: "No autenticado" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true, user }));
      })
      .catch((e) => {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      });
    return;
  }

  if (req.method === "POST" && parsed.pathname === "/api/auth/registro") {
    readJsonBody(req, 20000)
      .then(async (body) => {
        const name = String(body.name || "").trim().slice(0, 80);
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        if (!name) throw Object.assign(new Error("Ingresa tu nombre."), { status: 400 });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error("Correo inválido."), { status: 400 });
        if (password.length < 6) throw Object.assign(new Error("La contraseña debe tener al menos 6 caracteres."), { status: 400 });
        if (!db || !db.createUser || !db.isReady()) throw Object.assign(new Error("La base de datos no está conectada. Configura DATABASE_URL en Render."), { status: 503 });
        const existing = await db.findUserByEmail(email);
        if (existing) throw Object.assign(new Error("Ese correo ya está registrado. Inicia sesión."), { status: 409 });
        const user = await db.createUser({ name, email, passwordHash: hashPassword(password) });
        if (!user) throw Object.assign(new Error("No se pudo guardar el usuario. Revisa la conexión a la base de datos."), { status: 500 });
        const token = startSession(user.id);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({
          ok: true,
          token,
          user: { id: user.id, name: user.name, email: user.email, plan: user.plan || "free" }
        }));
      })
      .catch((e) => {
        const status = e && e.status ? e.status : 500;
        res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: e.message || "Error al registrar." }));
      });
    return;
  }

  if (req.method === "POST" && parsed.pathname === "/api/auth/login") {
    readJsonBody(req, 20000)
      .then(async (body) => {
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        if (!email || !password) throw Object.assign(new Error("Ingresa tu correo y contraseña."), { status: 400 });
        if (!db || !db.findUserByEmail || !db.isReady()) throw Object.assign(new Error("La base de datos no está conectada. Configura DATABASE_URL en Render."), { status: 503 });
        const user = await db.findUserByEmail(email);
        if (!user || !verifyPassword(password, user.password_hash)) {
          throw Object.assign(new Error("Correo o contraseña incorrectos."), { status: 401 });
        }
        const token = startSession(user.id);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({
          ok: true,
          token,
          user: { id: user.id, name: user.name, email: user.email, plan: user.plan || "free" }
        }));
      })
      .catch((e) => {
        const status = e && e.status ? e.status : 500;
        res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: e.message || "Error al iniciar sesión." }));
      });
    return;
  }

  if (req.method === "POST" && parsed.pathname === "/api/auth/logout") {
    const header = String(req.headers.authorization || "");
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (token && db && db.deleteSession) db.deleteSession(hashToken(token)).catch(() => {});
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && parsed.pathname === "/api/plan") {
    (async () => {
      const user = await requireAuth(req, res);
      if (!user) return;
      const body = await readJsonBody(req, 20000).catch(() => ({}));
      const plan = String(body.plan || "").trim().toLowerCase();
      if (!["free", "basico", "premium"].includes(plan)) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "Plan inválido." }));
        return;
      }
      if (!db || !db.setUserPlan || !db.isReady()) {
        res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "La base de datos no está conectada." }));
        return;
      }
      const updated = await db.setUserPlan(user.id, plan);
      if (!updated) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "No se pudo actualizar el plan." }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, plan: updated.plan, user: { id: updated.id, name: updated.name, email: updated.email, plan: updated.plan } }));
    })();
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
      db: db
        ? {
            configured: db.isReady(),
            connected: db.isReady()
          }
        : { configured: false, connected: false },
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
    (async () => {
      if (!(await requireAuth(req, res))) return;
      serveMarket("venta", query, getComparables, 3, res, "Error al obtener comparables");
    })();
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
    (async () => {
      if (!(await requireAuth(req, res))) return;
      serveMarket("alquiler", query, getRentals, 2, res, "Error al obtener alquileres");
    })();
    return;
  }

  if (parsed.pathname === "/api/cocheras") {
    const q = parsed.query;
    const query = {
      district: q.district || null,
      city: q.city || null
    };
    if (!query.district && !query.city) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Falta district o city", count: 0, avgPrice: null }));
      return;
    }
    (async () => {
      if (!(await requireAuth(req, res))) return;
      serveMarket("cochera", query, getCocheraComparables, 3, res, "Error al obtener comparables de cocheras");
    })();
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
    serveMarket("nexo", query, getNexoProjects, 1, res, "Error al obtener proyectos Nexo");
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
      objetivo: String(q.objetivo || "").slice(0, 1000),
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
    (async () => {
      if (!(await requireAuth(req, res))) return;
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
    })();
    return;
  }

  if (req.method === "POST" && parsed.pathname === "/api/enviar-tasacion") {
    let body = "";
    req.on("data", (d) => {
      body += d;
      if (body.length > 300000) req.destroy();
    });
    req.on("end", async () => {
      let payload = {};
      try {
        payload = JSON.parse(body || "{}");
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "JSON inválido" }));
        return;
      }
      const to = String(payload.to || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Destinatario inválido" }));
        return;
      }
      if (!sendMail) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Envío de correos no disponible (nodemailer)" }));
        return;
      }
      const subject = String(payload.subject || "Tu tasación de propiedad — Tasora").slice(0, 200);
      const html = String(payload.html || "").slice(0, 200000);
      try {
        await sendMail(to, subject, html);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
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
      if (!(await requireAuth(req, res))) return;
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
  console.log(`\n  Tasora — http://localhost:${PORT}\n`);
});

if (db && db.initDb) {
  db.initDb().catch((e) => console.log("[db] init falló →", e.message));
}
