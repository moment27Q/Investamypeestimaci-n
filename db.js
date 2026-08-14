"use strict";

/*
 * Conexión a Postgres (tasora_db). Todo el acceso es opcional: si no hay
 * DATABASE_URL configurada o la base no responde, la app sigue funcionando
 * con la caché en memoria sin romperse.
 */

let pool = null;

function isLocal(connectionString) {
  try {
    const host = new URL(connectionString).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch (e) {
    return true;
  }
}

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) return null;
  const { Pool } = require("pg");
  pool = new Pool({
    connectionString: connectionString,
    ssl: isLocal(connectionString)
      ? false
      : { rejectUnauthorized: false }
  });
  pool.on("error", (err) => console.log("[db] error en el pool →", err.message));
  return pool;
}

function isReady() {
  return !!getPool();
}

async function initDb() {
  const p = getPool();
  if (!p) return false;
  try {
    await p.query(`
      CREATE TABLE IF NOT EXISTS scrape_batches (
        id         BIGSERIAL PRIMARY KEY,
        kind       TEXT NOT NULL,
        district   TEXT,
        city       TEXT,
        type       TEXT,
        count      INT,
        fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS scraped_listings (
        id            BIGSERIAL PRIMARY KEY,
        batch_id      BIGINT REFERENCES scrape_batches(id),
        dedupe_key    TEXT NOT NULL,
        url_key       TEXT,
        kind          TEXT NOT NULL,
        district      TEXT,
        city          TEXT,
        type          TEXT,
        source        TEXT,
        url           TEXT,
        title         TEXT,
        image         TEXT,
        price         NUMERIC,
        rent          NUMERIC,
        area          INT,
        bedrooms      INT,
        bathrooms     INT,
        price_per_m2  NUMERIC,
        rent_per_m2   NUMERIC,
        data          JSONB,
        fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS scraped_listings_dedupe_key_uidx
        ON scraped_listings (dedupe_key);
      CREATE INDEX IF NOT EXISTS scraped_listings_kind_idx
        ON scraped_listings (kind);
      CREATE INDEX IF NOT EXISTS scraped_listings_district_idx
        ON scraped_listings (district);

      CREATE TABLE IF NOT EXISTS users (
        id            BIGSERIAL PRIMARY KEY,
        name          TEXT NOT NULL,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

      CREATE TABLE IF NOT EXISTS user_usage (
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date    TEXT NOT NULL,
        count   INT  NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, date)
      );
    `);

    // Migración idempotente: normalizar la URL (sin ?query ni #hash) y limpiar
    // propiedades duplicadas (misma fuente y URL), quedándose con la más reciente.
    await p.query(`
      ALTER TABLE scraped_listings ADD COLUMN IF NOT EXISTS url_key TEXT;
      UPDATE scraped_listings
         SET url_key = regexp_replace(url, '[?#].*$', '')
       WHERE url_key IS NULL AND url IS NOT NULL AND url <> '';
      UPDATE scraped_listings SET url_key = '' WHERE url_key IS NULL;
    `);
    await p.query(`
      CREATE INDEX IF NOT EXISTS scraped_listings_url_key_idx
        ON scraped_listings (url_key);
    `);
    await p.query(`
      DELETE FROM scraped_listings a
       USING scraped_listings b
       WHERE a.id < b.id
         AND a.kind = b.kind
         AND a.district IS NOT DISTINCT FROM b.district
         AND a.city IS NOT DISTINCT FROM b.city
         AND a.type IS NOT DISTINCT FROM b.type
         AND a.source IS NOT DISTINCT FROM b.source
         AND a.url_key IS NOT DISTINCT FROM b.url_key
         AND a.url_key IS NOT NULL AND a.url_key <> '';
    `);
    console.log("[db] conectado y tablas listas");
    return true;
  } catch (e) {
    console.log("[db] no se pudo inicializar →", e.message);
    return false;
  }
}

function num(v) {
  if (v == null || v === "") return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function int(v) {
  const n = num(v);
  return n == null ? null : Math.round(n);
}

/*
 * URL sin parámetros de rastreo ni fragmento: la identidad de la propiedad.
 * Dos URLs que solo difieren en ?utm_* o #... son el mismo aviso.
 */
function canonicalUrl(u) {
  if (!u) return "";
  try {
    const urlObj = new URL(String(u));
    urlObj.search = "";
    urlObj.hash = "";
    return urlObj.href.replace(/\/+$/, "");
  } catch (e) {
    return String(u).split(/[?#]/)[0];
  }
}

async function saveScrape(kind, query, data) {
  const p = getPool();
  if (!p) return;
  const district = query.district || null;
  const city = query.city || null;
  const type = query.type || null;

  let rows = [];
  if (kind === "nexo") {
    for (const pr of data.projects || []) {
      rows.push({
        source: "Nexo",
        url: pr.url || null,
        title: pr.name || null,
        image: pr.image || null,
        price: pr.priceFrom,
        area: pr.areaMin,
        bedrooms: pr.bedroomsMin,
        bathrooms: null,
        pricePerM2: pr.priceFrom && pr.areaMin ? Math.round(pr.priceFrom / pr.areaMin) : null,
        rentPerM2: null,
        extra: pr
      });
    }
  } else {
    for (const l of data.listings || []) {
      rows.push({
        source: l.source || null,
        url: l.url || null,
        title: l.title || null,
        image: l.image || null,
        price: kind === "venta" || kind === "cochera" ? l.price : null,
        rent: kind === "alquiler" ? l.rent : null,
        area: l.area,
        bedrooms: l.bedrooms,
        bathrooms: l.bathrooms,
        pricePerM2: l.pricePerM2,
        rentPerM2: l.rentPerM2,
        extra: l
      });
    }
  }

  // Solo se guardan avisos con costo (precio de venta o renta mensual).
  rows = rows.filter((r) => r.price != null || r.rent != null);
  if (!rows.length) return;

  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const batch = await client.query(
      `INSERT INTO scrape_batches (kind, district, city, type, count)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [kind, district, city, type, rows.length]
    );
    const batchId = batch.rows[0].id;
    for (const r of rows) {
      // Identidad de la propiedad: si hay URL, es la URL canónica (misma fuente y
      // zona). Sin URL, se identifica por fuente + costo + características.
      const urlKey = canonicalUrl(r.url || "");
      const cost = r.price != null ? r.price : (r.rent != null ? r.rent : "");
      const dedupeKey = urlKey
        ? [kind, district || "", city || "", type || "", r.source || "", urlKey].join("::")
        : [kind, district || "", city || "", type || "", r.source || "", cost,
           r.area != null ? r.area : "",
           r.bedrooms != null ? r.bedrooms : "",
           r.bathrooms != null ? r.bathrooms : ""].join("::");
      await client.query(
        `INSERT INTO scraped_listings
           (batch_id, dedupe_key, url_key, kind, district, city, type, source, url, title, image,
            price, rent, area, bedrooms, bathrooms, price_per_m2, rent_per_m2, data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (dedupe_key) DO UPDATE SET
           batch_id = EXCLUDED.batch_id,
           url_key = EXCLUDED.url_key,
           url = EXCLUDED.url,
           title = EXCLUDED.title,
           image = EXCLUDED.image,
           price = EXCLUDED.price,
           rent = EXCLUDED.rent,
           area = EXCLUDED.area,
           bedrooms = EXCLUDED.bedrooms,
           bathrooms = EXCLUDED.bathrooms,
           price_per_m2 = EXCLUDED.price_per_m2,
           rent_per_m2 = EXCLUDED.rent_per_m2,
           data = EXCLUDED.data,
           fetched_at = now()`,
        [batchId, dedupeKey, urlKey, kind, district, city, type, r.source, r.url, r.title, r.image,
         num(r.price), num(r.rent), int(r.area), int(r.bedrooms), int(r.bathrooms),
         num(r.pricePerM2), num(r.rentPerM2), JSON.stringify(r.extra || {})]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.log("[db] no se pudo guardar", kind, "→", e.message);
  } finally {
    client.release();
  }
}

module.exports = {
  initDb,
  saveScrape,
  isReady,
  getPool,
  getSavedMarket,
  buildMarket,
  createUser,
  findUserByEmail,
  findUserById,
  createSession,
  findUserByToken,
  deleteSession,
  getUserUsage,
  incrementUserUsage
};

/* ------------------------------------------------------------------ */
/* Usuarios y sesiones (inicio de sesión)                              */
/* ------------------------------------------------------------------ */

async function createUser({ name, email, passwordHash }) {
  const p = getPool();
  if (!p) return null;
  const r = await p.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, LOWER($2), $3)
     RETURNING id, name, email, created_at`,
    [String(name || "").trim(), String(email || "").trim(), passwordHash]
  );
  return r.rows[0] || null;
}

async function findUserByEmail(email) {
  const p = getPool();
  if (!p) return null;
  const r = await p.query(
    `SELECT * FROM users WHERE email = LOWER($1)`,
    [String(email || "").trim()]
  );
  return r.rows[0] || null;
}

async function findUserById(id) {
  const p = getPool();
  if (!p) return null;
  const r = await p.query(
    `SELECT id, name, email, created_at FROM users WHERE id = $1`,
    [id]
  );
  return r.rows[0] || null;
}

async function createSession(userId, tokenHash, expiresAt) {
  const p = getPool();
  if (!p) return false;
  await p.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (token_hash) DO NOTHING`,
    [tokenHash, userId, expiresAt]
  );
  return true;
}

async function findUserByToken(tokenHash) {
  const p = getPool();
  if (!p) return null;
  const r = await p.query(
    `SELECT u.id, u.name, u.email, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash]
  );
  return r.rows[0] || null;
}

async function deleteSession(tokenHash) {
  const p = getPool();
  if (!p) return;
  await p.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
}

/* ------------------------------------------------------------------ */
/* Uso por usuario: cuántas tasaciones usó en un día (yyyy-mm-dd)      */
/* ------------------------------------------------------------------ */

async function getUserUsage(userId, date) {
  const p = getPool();
  if (!p) return null;
  const r = await p.query(
    `SELECT count FROM user_usage WHERE user_id = $1 AND date = $2`,
    [userId, date]
  );
  return r.rows.length ? Number(r.rows[0].count) : 0;
}

async function incrementUserUsage(userId, date) {
  const p = getPool();
  if (!p) return;
  await p.query(
    `INSERT INTO user_usage (user_id, date, count) VALUES ($1, $2, 1)
     ON CONFLICT (user_id, date) DO UPDATE SET count = user_usage.count + 1`,
    [userId, date]
  );
}

/* ------------------------------------------------------------------ */
/* Lectura de avisos guardados por distrito (respaldo para la tasación) */
/* ------------------------------------------------------------------ */

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function dedupeListings(listings, keyFn) {
  const seen = new Set();
  const out = [];
  for (const l of listings) {
    if (!l) continue;
    const k = keyFn(l);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  return out;
}

/*
 * Reconstruye la misma forma de respuesta que el scraper a partir de una
 * lista de avisos. kinds: "venta", "alquiler", "cochera", "nexo".
 */
function buildMarket(kind, query, listings) {
  const district = query.district || null;
  const city = query.city || null;
  const type = query.type || null;

  if (kind === "nexo") {
    const projects = dedupeListings(listings.filter((p) => p && p.id), (p) => String(p.id));
    const prices = projects.map((p) => num(p.priceFrom)).filter((n) => n != null);
    if (!projects.length) return null;
    return {
      district: district,
      city: city,
      count: projects.length,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      projects: projects.slice(0, 40),
      sources: ["Nexo"]
    };
  }

  const valid = listings.filter((l) => l && (l.price != null || l.rent != null) && l.area);

  if (kind === "alquiler") {
    const uniq = dedupeListings(valid, (l) => [l.rentPerM2, l.area, l.bedrooms || ""].join("|"));
    if (!uniq.length) return null;
    const rents = uniq.map((l) => l.rent);
    const rentsM2 = uniq.map((l) => l.rentPerM2).filter((n) => n != null);
    const areas = uniq.map((l) => l.area);
    return {
      district: district,
      city: city,
      type: type,
      count: uniq.length,
      medianRent: median(rents),
      medianRentPerM2: median(rentsM2),
      medianArea: median(areas),
      minRent: rents.length ? Math.min(...rents) : null,
      maxRent: rents.length ? Math.max(...rents) : null,
      minRentPerM2: rentsM2.length ? Math.min(...rentsM2) : null,
      maxRentPerM2: rentsM2.length ? Math.max(...rentsM2) : null,
      sources: [...new Set(uniq.map((l) => l.source).filter(Boolean))],
      listings: uniq.slice(0, 18)
    };
  }

  if (kind === "cochera") {
    const uniq = dedupeListings(valid, (l) => [l.price, l.area || ""].join("|"));
    if (!uniq.length) return null;
    const prices = uniq.map((l) => l.price);
    return {
      district: district,
      city: city,
      count: uniq.length,
      avgPrice: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null,
      medianPrice: median(prices),
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      sources: [...new Set(uniq.map((l) => l.source).filter(Boolean))],
      listings: uniq.slice(0, 18)
    };
  }

  // venta
  const uniq = dedupeListings(valid, (l) => [l.pricePerM2, l.area, l.bedrooms || ""].join("|"));
  if (!uniq.length) return null;
  const m2 = uniq.map((l) => l.pricePerM2).filter((n) => n != null);
  const areas = uniq.map((l) => l.area);
  return {
    district: district,
    city: city,
    type: type,
    count: uniq.length,
    medianPerM2: median(m2),
    medianArea: median(areas),
    minPerM2: m2.length ? Math.min(...m2) : null,
    maxPerM2: m2.length ? Math.max(...m2) : null,
    sources: [...new Set(uniq.map((l) => l.source).filter(Boolean))],
    listings: uniq.slice(0, 18)
  };
}

/*
 * Lee de la base los avisos guardados para un distrito (los que se guardaron
 * cuando se hizo scraping antes). Devuelve la misma forma que el scraper, o
 * null si no hay datos para ese distrito/tipo.
 */
async function getSavedMarket(kind, query) {
  const p = getPool();
  if (!p) return null;
  const place = query.district || query.city || null;
  if (!place) return null;
  try {
    const params = [kind, place];
    let typeClause = "";
    if (kind === "venta" || kind === "alquiler") {
      typeClause = " AND type = $3";
      params.push(query.type || "departamento");
    }
    const r = await p.query(
      `SELECT * FROM scraped_listings
       WHERE kind = $1 AND (district = $2 OR city = $2)${typeClause}
       ORDER BY fetched_at DESC LIMIT 400`,
      params
    );
    const rows = r.rows;
    if (!rows.length) return null;

    const listings = rows.map((row) => {
      if (kind === "nexo") {
        const d = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
        return d && typeof d === "object" ? d : null;
      }
      const l = {
        title: row.title,
        source: row.source,
        url: row.url,
        image: row.image,
        area: row.area
      };
      if (kind === "alquiler") {
        l.rent = num(row.rent);
        l.rentPerM2 = num(row.rent_per_m2);
      } else {
        l.price = num(row.price);
        l.pricePerM2 = num(row.price_per_m2);
      }
      l.bedrooms = int(row.bedrooms);
      l.bathrooms = int(row.bathrooms);
      return l;
    }).filter(Boolean);

    const out = buildMarket(kind, query, listings);
    if (out) {
      out.fetchedAt = rows[0].fetched_at
        ? new Date(rows[0].fetched_at).toISOString()
        : new Date().toISOString();
    }
    return out;
  } catch (e) {
    console.log("[db] getSavedMarket", kind, "falló →", e.message);
    return null;
  }
}
