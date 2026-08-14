"use strict";

const https = require("https");

const UA = "Tasora/1.0 (tasacion-peru)";
const CACHE = new Map();
const TTL = 7 * 24 * 60 * 60 * 1000;
let lastRequest = 0;

function throttle() {
  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - lastRequest));
  if (wait > 0) return new Promise((r) => setTimeout(r, wait));
  return Promise.resolve();
}

function get(url) {
  return throttle().then(() => {
    lastRequest = Date.now();
    return new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: { "User-Agent": UA, "Accept": "application/json" }
      }, (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          if (res.statusCode >= 400) {
            reject(new Error("Geocoder HTTP " + res.statusCode));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      });
      req.setTimeout(15000, () => req.destroy(new Error("timeout geocoder")));
      req.on("error", reject);
    });
  });
}

function nominatimSearch(q) {
  return get("https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1" +
    "&countrycodes=pe&limit=8&dedupe=1&accept-language=es&q=" + encodeURIComponent(q));
}

function nominatimReverse(lat, lon) {
  return get("https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1" +
    "&accept-language=es&polygon_geojson=1&lat=" + lat + "&lon=" + lon);
}

function photonSearch(q) {
  return get("https://photon.komoot.io/api/?q=" + encodeURIComponent(q) + "&limit=8&lang=default");
}

function photonReverse(lat, lon) {
  return get("https://photon.komoot.io/reverse?lat=" + lat + "&lon=" + lon + "&lang=default");
}

function photonToPlace(f) {
  const p = (f && f.properties) || {};
  const g = (f && f.geometry) || {};
  if (!g.coordinates) return null;
  const lon = g.coordinates[0];
  const lat = g.coordinates[1];
  const address = {
    road: p.street || null,
    house_number: p.housenumber || null,
    pedestrian: null,
    neighbourhood: p.neighbourhood || null,
    suburb: p.suburb || null,
    city_district: p.city_district || p.district || null,
    town: p.town || null,
    municipality: p.municipality || null,
    county: p.county || null,
    city: p.city || null,
    state: p.state || null,
    country: p.country || "Perú"
  };
  return {
    lat: String(lat),
    lon: String(lon),
    display_name: formatAddress(address, p.name),
    address: address,
    type: p.type || "yes"
  };
}

function queryVariants(q) {
  const clean = String(q || "").trim().replace(/\s+/g, " ");
  if (!clean) return [];
  const variants = [clean];
  const withoutNumber = clean.replace(/\s+\d+[a-z]?\s*$/, "").replace(/,\s*$/, "").trim();
  if (withoutNumber && withoutNumber !== clean) variants.push(withoutNumber);
  const cleaned2 = clean
    .replace(/\b(mz|manzana|lt|lote|block|bloque|int|interior)\b\s*[0-9]+[a-z]?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned2 && cleaned2 !== clean && !variants.includes(cleaned2)) variants.push(cleaned2);
  return variants;
}

function formatAddress(a, name) {
  if (!a) return name || "Ubicación";
  const parts = [];
  const street = a.road || a.pedestrian || a.path || a.residential || a.cycleway;
  if (street) {
    parts.push((a.house_number ? a.house_number + " " : "") + street);
  } else if (a.house_number) {
    parts.push(a.house_number);
  }
  const zone = a.suburb || a.neighbourhood || a.city_district || a.municipality || a.town;
  if (zone) parts.push(zone);
  if (a.city && a.city !== zone) parts.push(a.city);
  if (a.state && a.state !== a.city && a.state !== zone) parts.push(a.state);
  if (a.country && a.country !== "Perú" && a.country !== "Peru") parts.push(a.country);
  return parts.join(", ") || name || "Ubicación";
}

function cacheGet(key) {
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.data;
  return null;
}

function cacheSet(key, data) {
  CACHE.set(key, { data: data, t: Date.now() });
}

async function search(query) {
  const key = "s:" + normalize(query);
  const hit = cacheGet(key);
  if (hit) return hit;

  const variants = queryVariants(query);
  let anySuccess = false;
  let lastErr = null;
  for (const v of variants) {
    try {
      anySuccess = true;
      const res = await nominatimSearch(v);
      if (Array.isArray(res) && res.length) {
        cacheSet(key, res);
        return res;
      }
    } catch (e) {
      lastErr = e;
    }
  }

  try {
    anySuccess = true;
    const data = await photonSearch(query);
    const feats = (data && data.features) || [];
    const places = feats.map(photonToPlace).filter(Boolean);
    if (places.length) {
      cacheSet(key, places);
      return places;
    }
  } catch (e) {
    if (!lastErr) lastErr = e;
  }

  return anySuccess ? [] : { error: lastErr ? lastErr.message : "Sin conexión" };
}

const METERS_PER_DEG = 111320;
const WATER_TOLERANCE_M = 300;

// Una dirección "precisa" necesita algo más que país/estado. Si Nominatim solo
// devuelve "Perú" (o estado+país), el punto no tiene referencia: es típico de
// mar abierto, desierto o zona sin datos.
function hasPreciseAddress(addr) {
  if (!addr) return false;
  return !!(addr.road || addr.house_number || addr.suburb || addr.neighbourhood ||
    addr.city_district || addr.city || addr.town || addr.village || addr.municipality);
}

function pointInRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function lineDistance(lat, lon, line) {
  const k = Math.cos((lat * Math.PI) / 180);
  const px = lon * k, py = lat;
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const ax = line[i][0] * k, ay = line[i][1];
    const bx = line[i + 1][0] * k, by = line[i + 1][1];
    const dx = bx - ax, dy = by - ay;
    let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1);
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  return best * METERS_PER_DEG;
}

function ringDistance(lat, lon, ring) {
  return lineDistance(lat, lon, ring);
}

// Distancia (en metros) del punto a la geometría de la feature que Nominatim
// asignó al reverse. Si la geometría contiene el punto devuelve 0.
function distanceToGeometry(lat, lon, geojson) {
  if (!geojson || !geojson.coordinates) return null;
  const c = geojson.coordinates;
  const k = Math.cos((lat * Math.PI) / 180);
  switch (geojson.type) {
    case "Point":
      return Math.hypot((c[1] - lat) * METERS_PER_DEG, (c[0] - lon) * METERS_PER_DEG * k);
    case "LineString":
      return lineDistance(lat, lon, c);
    case "MultiLineString":
      return Math.min(...c.map((l) => lineDistance(lat, lon, l)));
    case "Polygon": {
      for (const ring of c) if (pointInRing(lat, lon, ring)) return 0;
      return Math.min(...c.map((ring) => ringDistance(lat, lon, ring)));
    }
    case "MultiPolygon": {
      for (const poly of c) for (const ring of poly) if (pointInRing(lat, lon, ring)) return 0;
      return Math.min(...c.map((poly) => Math.min(...poly.map((ring) => ringDistance(lat, lon, ring)))));
    }
    default:
      return null;
  }
}

async function reverse(lat, lon) {
  const key = "r:" + lat + "," + lon;
  const hit = cacheGet(key);
  if (hit) return hit;

  // Comprobación de agua (mar/lago/río) ANTES de geocodificar: Nominatim a veces
  // "pega" puntos del océano a tierra cercana (city_blocks, suburbios, calles).
  // Se hace con la geometría de la feature que Nominatim devuelve (ver abajo).
  let anySuccess = false;
  let lastErr = null;
  try {
    anySuccess = true;
    const data = await nominatimReverse(lat, lon);
    if (data && data.error) {
      // Nominatim no encontró dirección en ese punto: típicamente mar/océano,
      // lago o zona sin ninguna referencia (desierto, alta montaña, etc.).
      const err = { error: "La ubicación es errónea: el punto está fuera de tierra firme (mar, lago o zona sin referencia). Elige un punto sobre la propiedad." };
      cacheSet(key, err);
      return err;
    }
    if (data && data.address) {
      // Sin dirección precisa (solo país/estado) => punto sin referencia (mar, etc.).
      if (!hasPreciseAddress(data.address)) {
        const err = { error: "La ubicación es errónea: el punto está fuera de tierra firme (mar, lago o zona sin referencia). Elige un punto sobre la propiedad." };
        cacheSet(key, err);
        return err;
      }
      // El punto quedó lejos de la geometría que Nominatim asignó (p.ej. un
      // city_block costero o un suburbio cuyo centro está en tierra firme):
      // señal típica de un clic en el mar.
      const dist = distanceToGeometry(lat, lon, data.geojson);
      if (dist !== null && dist > WATER_TOLERANCE_M) {
        const err = { error: "La ubicación es errónea: el punto está en el mar (fuera de tierra firme). Elige un punto sobre la propiedad." };
        cacheSet(key, err);
        return err;
      }
      cacheSet(key, data);
      return data;
    }
  } catch (e) {
    lastErr = e;
  }

  try {
    anySuccess = true;
    const data = await photonReverse(lat, lon);
    const f = data && data.features && data.features[0];
    if (f) {
      const place = photonToPlace(f);
      if (place) {
        cacheSet(key, place);
        return place;
      }
    }
  } catch (e) {
    if (!lastErr) lastErr = e;
  }

  return { error: anySuccess ? "Sin resultado" : (lastErr ? lastErr.message : "Sin conexión") };
}

function normalize(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { search, reverse };
