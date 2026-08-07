"use strict";

const { chromium } = require("playwright");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

const TYPE_SLUG = {
  departamento: "departamentos",
  casa: "casas",
  terreno: "terrenos",
  local: "locales",
  oficina: "oficinas"
};

let browserPromise = null;
let lastScrapeAt = 0;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage"
      ]
    });
  }
  return browserPromise;
}

function slugify(name) {
  return (name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildUrls({ district, city, type }) {
  const plural = TYPE_SLUG[type] || "departamentos";
  const urls = [];
  const slug = slugify(district || city || "");

  if (district && DATA_DISTRICTS_SET.has(district)) {
    urls.push({
      site: "urbania",
      url: `https://urbania.pe/buscar/venta-de-${plural}-en-${slug}--lima--lima`
    });
  }
  if (slug) {
    urls.push({
      site: "adondevivir",
      url: `https://www.adondevivir.com/${plural}-en-venta-en-${slug}.html`
    });
  }
  return urls;
}

function parseCardText(text) {
  if (!text || text.length > 1400) return null;
  if (/\bdesde\b/i.test(text) && /\bun\.?\b/i.test(text)) return null;

  // Precio en S/ (primera ocurrencia que no sea "Mantenimiento")
  let price = null;
  const re = /S\/\s*([\d.,]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const tail = text.slice(m.index, m.index + 40);
    if (/Mantenimiento/i.test(tail)) continue;
    price = parseFloat(m[1].replace(/\./g, "").replace(/,/g, ""));
    break;
  }
  if (!price) return null;

  const areaM = text.match(/(\d+)\s*m[²2]\s*tot\.?/i) || text.match(/(\d+)\s*m[²2]/i);
  const dormM = text.match(/(\d+)\s*dorm\.?/i);
  const banoM = text.match(/(\d+)\s*bañ?os?\.?/i);
  if (!areaM) return null;
  const area = parseInt(areaM[1], 10);

  if (price < 15000 || price > 30000000) return null;
  if (area < 15 || area > 2000) return null;
  const pM2 = price / area;
  if (pM2 < 200 || pM2 > 30000) return null;

  return {
    price: price,
    area: area,
    bedrooms: dormM ? parseInt(dormM[1], 10) : null,
    bathrooms: banoM ? parseInt(banoM[1], 10) : null,
    pricePerM2: Math.round(pM2),
    title: text.split("|").slice(0, 2).join(" | ").trim().slice(0, 90)
  };
}

async function scrapePage(browser, url) {
  const page = await browser.newPage({ userAgent: UA, locale: "es-PE", viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 40000 });
    await page.waitForTimeout(4000);

    // Scroll para cargar avisos perezosos
    for (let i = 0; i < 7; i++) {
      await page.mouse.wheel(0, 2500);
      await page.waitForTimeout(700);
    }

    const texts = await page.evaluate(() => {
      const out = [];
      const els = document.querySelectorAll(
        '[class*="postingCard-module__posting-container"], [class*="postingCard-module__posting-top"]'
      );
      for (const el of els) {
        const t = (el.innerText || "").replace(/\n+/g, " | ").trim();
        if (t && /S\/\s*\d/.test(t)) out.push(t);
      }
      return out;
    });

    const seen = new Set();
    const listings = [];
    for (const t of texts) {
      const card = parseCardText(t);
      if (!card) continue;
      const key = card.pricePerM2 + "|" + card.area;
      if (seen.has(key)) continue;
      seen.add(key);
      card.source = url.includes("urbania") ? "Urbania" : "Adondevivir";
      listings.push(card);
      if (listings.length >= 30) break;
    }
    return listings;
  } catch (e) {
    return [];
  } finally {
    await page.close().catch(() => {});
  }
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

async function getComparables(query) {
  const cacheKey = [query.district || "", query.city || "", query.type || "departamento"].join("::");
  const now = Date.now();
  if (CACHE.has(cacheKey) && now - CACHE.get(cacheKey).fetchedAt < CACHE_TTL) {
    return CACHE.get(cacheKey).data;
  }

  // Espaciar peticiones para respetar los portales
  const wait = Math.max(0, 2500 - (now - lastScrapeAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastScrapeAt = Date.now();

  const urls = buildUrls(query);
  const browser = await getBrowser();
  const results = await Promise.all(
    urls.map((u) => scrapePage(browser, u.url).then((list) => ({ site: u.site, list })))
  );

  const all = [];
  for (const r of results) all.push(...r.list);

  const uniq = [];
  const seen = new Set();
  for (const l of all) {
    const key = l.pricePerM2 + "|" + l.area + "|" + (l.bedrooms || "");
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(l);
  }

  const data = {
    district: query.district || null,
    city: query.city || null,
    type: query.type || "departamento",
    count: uniq.length,
    medianPerM2: median(uniq.map((l) => l.pricePerM2)),
    medianArea: median(uniq.map((l) => l.area)),
    minPerM2: uniq.length ? Math.min(...uniq.map((l) => l.pricePerM2)) : null,
    maxPerM2: uniq.length ? Math.max(...uniq.map((l) => l.pricePerM2)) : null,
    sources: results.filter((r) => r.list.length).map((r) => r.site),
    listings: uniq.slice(0, 12),
    fetchedAt: new Date().toISOString()
  };

  if (data.count >= 2) {
    CACHE.set(cacheKey, { data, fetchedAt: now });
  }
  return data;
}

const CACHE = new Map();
const CACHE_TTL = 10 * 60 * 1000;

// dataset de distritos de Lima para saber cuándo usar URLs con --lima--lima
const DATA_DISTRICTS_SET = new Set([
  "San Isidro","Barranco","Miraflores","Jesús María","Lince","San Borja",
  "Magdalena del Mar","La Victoria","Surquillo","Santiago de Surco","Pueblo Libre",
  "Cercado de Lima","San Miguel","Chorrillos","La Molina","Breña","La Punta",
  "San Luis","Ate","La Perla","Bellavista","Santa Anita","Rímac","El Agustino",
  "San Juan de Miraflores","Los Olivos","Callao","San Juan de Lurigancho",
  "San Martín de Porres","Independencia","Comas","Carabayllo","Puente Piedra",
  "Ventanilla","Lurín","Pachacamac","Punta Hermosa","Pucusana","Ancón","Santa Rosa",
  "Cieneguilla","Chaclacayo","Lurigancho-Chosica"
]);

module.exports = { getComparables, buildUrls, parseCardText };
