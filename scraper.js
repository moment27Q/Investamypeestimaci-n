"use strict";

const { chromium } = require("playwright");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

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
        "--disable-dev-shm-usage",
        "--disable-features=IsolateOrigins,site-per-process",
        "--lang=es-PE"
      ]
    });
  }
  return browserPromise;
}

async function safeBrowser() {
  try {
    let browser = await getBrowser();
    if (!browser.isConnected()) {
      browserPromise = null;
      browser = await getBrowser();
    }
    return browser;
  } catch (e) {
    console.log("[scraper] error lanzando Chromium →", e.message);
    browserPromise = null;
    return null;
  }
}

async function newStealthPage(browser) {
  const page = await browser.newPage({ userAgent: UA, locale: "es-PE", viewport: { width: 1280, height: 900 } });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    window.chrome = window.chrome || { runtime: {} };
    Object.defineProperty(navigator, "languages", { get: () => ["es-ES", "es", "en-US", "en"] });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    const origQuery = window.navigator.permissions && window.navigator.permissions.query;
    if (origQuery) {
      window.navigator.permissions.query = (p) =>
        p && p.name === "notifications"
          ? Promise.resolve({ state: Notification.permission })
          : origQuery(p);
    }
  });
  return page;
}

async function hasChallenge(page) {
  try {
    return await page.evaluate(() => {
      const t = (document.title || "").toLowerCase();
      if (/just a moment|attention required|verificando|please verify|one more step|checking your browser/i.test(t)) {
        return true;
      }
      if (document.querySelector(
        "#challenge-running, #challenge-form, [id*='challenge'], [class*='challenge-running'], " +
        "iframe[src*='challenges.cloudflare.com'], [class*='cf-browser-verification']"
      )) return true;
      const head = (document.body && document.body.innerText || "").slice(0, 400);
      if (/attention required!|checking your browser|verificando que eres humano|cf-browser-verification|enable javascript and cookies/i.test(head)) {
        return true;
      }
      return false;
    });
  } catch (e) {
    return false;
  }
}

async function navigate(page, url, timeout) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let resp = null;
    try {
      resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeout || 40000 });
    } catch (e) {
      if (attempt === 1) { await page.waitForTimeout(1500); continue; }
      return false;
    }
    await page.waitForTimeout(2500 + Math.floor(Math.random() * 1200));

    if (await hasChallenge(page)) {
      let waited = 0;
      while (waited < 8000 && (await hasChallenge(page))) {
        await page.waitForTimeout(1000);
        waited += 1000;
      }
      if (await hasChallenge(page)) {
        if (attempt === 1) { await page.waitForTimeout(1200); continue; }
        return false;
      }
    }

    const status = resp ? resp.status() : 200;
    if ((status === 403 || status === 429 || status === 503) && attempt === 1) {
      await page.waitForTimeout(1500);
      continue;
    }
    return status >= 200 && status < 400;
  }
  return false;
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

function buildRentUrls({ district, city, type }) {
  const plural = TYPE_SLUG[type] || "departamentos";
  const urls = [];
  const slug = slugify(district || city || "");

  if (district && DATA_DISTRICTS_SET.has(district)) {
    urls.push({
      site: "urbania",
      url: `https://urbania.pe/buscar/alquiler-de-${plural}-en-${slug}--lima--lima`
    });
  }
  if (slug) {
    urls.push({
      site: "adondevivir",
      url: `https://www.adondevivir.com/${plural}-en-alquiler-en-${slug}.html`
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

function parseRentCardText(text) {
  if (!text || text.length > 1400) return null;
  // Avisos "Desde S/ X, un." de proyectos: no tienen precio único
  if (/\bdesde\b/i.test(text) && /\bun\.?\b/i.test(text)) return null;

  // Alquileres por día / noche / hora no son referencias mensuales
  const head = text.slice(0, 90);
  if (/\b(por\s+)?(d[ií]a|noche|hora|semana|mensualidad)\b/i.test(head)) return null;

  // Precio mensual en S/ (primera ocurrencia que no sea "Mantenimiento")
  const parts = text.split("|").map((s) => s.trim());
  let price = null;
  let pricePart = null;
  for (const part of parts) {
    const pm = part.match(/^S\/\s*([\d.,]+)/);
    if (pm && !/Mantenimiento/i.test(part)) {
      price = parseFloat(pm[1].replace(/\./g, "").replace(/,/g, ""));
      pricePart = part;
      break;
    }
  }

  // Precio en USD (el aviso puede publicar solo en dólares). Los portales a veces
  // concatenan el badge de descuento al número ("USD 1,0008%" = USD 1,000 + 8%).
  let usd = null;
  const usdM = text.match(/\b(?:US\$|USD)\s*([\d.,]+)/);
  if (usdM) {
    const raw = usdM[1];
    let amount = raw;
    if (raw.includes(",")) {
      const groups = raw.split(",");
      const last = groups[groups.length - 1];
      if (last.length > 3) groups[groups.length - 1] = last.slice(0, 3);
      amount = groups.join("");
    } else {
      amount = raw.replace(/,/g, "");
    }
    usd = parseFloat(amount);
  }

  // Si "US$" es mucho mayor que el valor en S/, no es un alquiler (es venta)
  if (price != null && usd != null && usd > price * 2.5) return null;
  if (/venta|se\s+vende|precio\s+de\s+venta/i.test(text.slice(0, 260))) return null;
  if (price == null && usd != null) price = usd * USD_FX;
  if (price == null) return null;

  const areaM = text.match(/(\d+)\s*m[²2]\s*tot\.?/i) || text.match(/(\d+)\s*m[²2]/i);
  if (!areaM) return null;
  const area = parseInt(areaM[1], 10);

  // Precio publicado "por m²" (S/ X /m²) -> convertir a renta mensual total
  if (pricePart && /\/(\s*)?m[²2]|\bpor\s*m[²2]\b/i.test(pricePart) && area) {
    price = price * area;
  }

  if (price < 200 || price > 250000) return null;
  if (area < 12 || area > 3000) return null;
  const pM2 = price / area;
  if (pM2 < 3 || pM2 > 200) return null;

  const dormM = text.match(/(\d+)\s*dorm\.?/i);
  const banoM = text.match(/(\d+)\s*bañ?os?\.?/i);
  return {
    rent: Math.round(price),
    area: area,
    bedrooms: dormM ? parseInt(dormM[1], 10) : null,
    bathrooms: banoM ? parseInt(banoM[1], 10) : null,
    rentPerM2: Math.round(pM2),
    title: text.split("|").slice(0, 2).join(" | ").trim().slice(0, 90)
  };
}

async function scrapePage(browser, url) {
  const page = await newStealthPage(browser);
  try {
    const ok = await navigate(page, url, 40000);
    if (!ok) return [];
    await page.waitForTimeout(1500);

    // Scroll para cargar avisos perezosos
    for (let i = 0; i < 7; i++) {
      await page.mouse.wheel(0, 2500);
      await page.waitForTimeout(700);
    }

    const cards = await page.evaluate(() => {
      const out = [];
      const els = document.querySelectorAll(
        '[class*="postingCard-module__posting-container"], [class*="postingCard-module__posting-top"]'
      );
      for (const el of els) {
        const t = (el.innerText || "").replace(/\n+/g, " | ").trim();
        if (!t || !/S\/\s*\d/.test(t)) continue;
        const a = el.querySelector('a[href]');
        const href = a ? a.getAttribute("href") : "";
        let src = "";
        let best = 0;
        for (const img of el.querySelectorAll("img")) {
          const s = img.currentSrc || img.src || img.getAttribute("data-src") || "";
          if (!s || /(logo|icon|avatar|favicon)/i.test(s)) continue;
          const w = img.naturalWidth || img.width || 0;
          if (w >= best) { best = w; src = s; }
        }
        out.push({ t: t, href: href, src: src });
      }
      return out;
    });

    const base = url.includes("urbania") ? "https://urbania.pe" : "https://www.adondevivir.com";
    const seen = new Set();
    const listings = [];
    for (const c of cards) {
      const card = parseCardText(c.t);
      if (!card) continue;
      const key = card.pricePerM2 + "|" + card.area;
      if (seen.has(key)) continue;
      seen.add(key);
      card.source = url.includes("urbania") ? "Urbania" : "Adondevivir";
      if (c.href) card.url = c.href.startsWith("http") ? c.href : base + c.href;
      if (c.src) card.image = c.src;
      listings.push(card);
      if (listings.length >= 30) break;
    }
    return listings;
  } catch (e) {
    console.log("[scraper] scrapePage falló para", url, "→", e.message);
    return [];
  } finally {
    await page.close().catch(() => {});
  }
}

async function scrapeRentPage(browser, url) {
  const page = await newStealthPage(browser);
  try {
    const ok = await navigate(page, url, 40000);
    if (!ok) return [];
    await page.waitForTimeout(1500);

    for (let i = 0; i < 7; i++) {
      await page.mouse.wheel(0, 2500);
      await page.waitForTimeout(700);
    }

    const cards = await page.evaluate(() => {
      const out = [];
      const els = document.querySelectorAll(
        '[class*="postingCard-module__posting-container"], [class*="postingCard-module__posting-top"]'
      );
      for (const el of els) {
        const t = (el.innerText || "").replace(/\n+/g, " | ").trim();
        if (!t || !/(S\/\s*\d|US\$\s*\d)/.test(t)) continue;
        const a = el.querySelector('a[href]');
        const href = a ? a.getAttribute("href") : "";
        let src = "";
        let best = 0;
        for (const img of el.querySelectorAll("img")) {
          const s = img.currentSrc || img.src || img.getAttribute("data-src") || "";
          if (!s || /(logo|icon|avatar|favicon)/i.test(s)) continue;
          const w = img.naturalWidth || img.width || 0;
          if (w >= best) { best = w; src = s; }
        }
        out.push({ t: t, href: href, src: src });
      }
      return out;
    });

    const base = url.includes("urbania") ? "https://urbania.pe" : "https://www.adondevivir.com";
    const seen = new Set();
    const listings = [];
    for (const c of cards) {
      const card = parseRentCardText(c.t);
      if (!card) continue;
      const key = card.rentPerM2 + "|" + card.area;
      if (seen.has(key)) continue;
      seen.add(key);
      card.source = url.includes("urbania") ? "Urbania" : "Adondevivir";
      if (c.href) card.url = c.href.startsWith("http") ? c.href : base + c.href;
      if (c.src) card.image = c.src;
      listings.push(card);
      if (listings.length >= 30) break;
    }
    return listings;
  } catch (e) {
    console.log("[scraper] scrapeRentPage falló para", url, "→", e.message);
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

/* ------------------------------------------------------------------ */
/* RE/MAX (global.remax.com, avisos de Perú)                           */
/* ------------------------------------------------------------------ */

const USD_FX = 3.7;
const REMAX_BASE = "https://www.remax.com/per/es/real-estate/576495";

const REMAX_TYPE_LABELS = {
  departamento: ["departamento", "multifamiliar", "loft", "penthouse", "estudio", "flat", "condominio", "semipiso"],
  casa: ["casa", "villa", "chalet", "townhouse", "quinta", "bungalow"],
  terreno: ["terreno", "vacant", "tierra", "lote", "parcela"],
  local: ["local", "retail", "comercial"],
  oficina: ["oficina", "office"]
};

function remaxScore(text, name, isLimaDistrict) {
  const ut = text.toUpperCase();
  if (!ut.includes("PERU")) return -1;
  let score = 0;
  if (ut.includes(name.toUpperCase())) score += 2;
  if (isLimaDistrict && ut.includes("LIMA, PERU")) score += 3;
  return score;
}

function parseRemaxCard(text) {
  const parts = (text || "").split(" | ");
  if (parts.length < 4) return null;
  const label = (parts[0] || "").trim();
  const pm = (parts[1] || "").match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (!pm) return null;
  const priceUSD = parseFloat(pm[1].replace(/,/g, ""));
  if (!(priceUSD >= 5000 && priceUSD <= 5000000)) return null;
  const beds = parseInt(parts[2], 10);
  const baths = parseInt(parts[3], 10);
  return {
    label: label,
    priceUSD: priceUSD,
    beds: isNaN(beds) ? null : beds,
    baths: isNaN(baths) ? null : baths,
    location: parts.slice(4).join(" ").trim()
  };
}

function parseRemaxDetail(text) {
  const pm = (text || "").match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (!pm) return null;
  const priceUSD = parseFloat(pm[1].replace(/,/g, ""));
  const a1 = text.match(/(\d+(?:[.,]\d+)?)\s*sq\.?\s*m/i);
  const a2 = text.match(/(\d+(?:[.,]\d+)?)\s*m\s*tot\.?/i);
  const a3 = text.match(/(\d+(?:[.,]\d+)?)\s*m[²2]/i);
  const area = a1 ? parseFloat(a1[1]) : a2 ? parseFloat(a2[1]) : a3 ? parseFloat(a3[1]) : null;
  if (!area || area < 15 || area > 2000) return null;
  return { priceUSD: priceUSD, area: Math.round(area) };
}

async function remaxFetchDetail(browser, card) {
  const page = await browser.newPage({ userAgent: UA, locale: "es-PE", viewport: { width: 1280, height: 900 } });
  try {
    const url = card.href.startsWith("http") ? card.href : "https://www.remax.com" + card.href;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });
    await page.waitForTimeout(3000);
    const text = await page.evaluate(() => (document.body ? document.body.innerText.replace(/\n+/g, " | ") : ""));
    const parsed = parseRemaxDetail(text);
    if (!parsed || !parsed.priceUSD) return null;
    return { priceUSD: parsed.priceUSD, area: parsed.area, beds: card.beds, baths: card.baths, title: card.location, url: url, image: card.image };
  } catch (e) {
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

async function remaxPool(browser, cards, concurrency) {
  const results = [];
  const queue = cards.slice();
  const workers = Array.from({ length: Math.min(concurrency, Math.max(cards.length, 1)) }, async () => {
    while (queue.length) {
      const c = queue.shift();
      try {
        const r = await remaxFetchDetail(browser, c);
        if (r) results.push(r);
      } catch (e) { /* ignorar aviso fallido */ }
    }
  });
  await Promise.all(workers);
  return results;
}

async function scrapeRemax(browser, query) {
  const name = query.district || query.city;
  if (!name) return [];
  const type = query.type || "departamento";
  const isLimaDistrict = query.district ? DATA_DISTRICTS_SET.has(query.district) : false;

  const page = await newStealthPage(browser);
  try {
    const ok = await navigate(page, REMAX_BASE, 45000);
    if (!ok) return [];
    await page.waitForTimeout(1500);

    const input = page.locator('input[placeholder*="Buscar por"]');
    if (!(await input.count())) return [];
    await input.click();
    await input.fill(name);
    await page.waitForTimeout(2200);

    const opts = page.locator('[role="option"]');
    const n = await opts.count();
    let picked = null;
    for (let i = 0; i < n; i++) {
      let t = "";
      try { t = (await opts.nth(i).innerText()) || ""; } catch (e) { /* noop */ }
      const score = remaxScore(t, name, isLimaDistrict);
      if (score > 0 && (picked === null || score > picked.score)) picked = { i, score };
    }
    if (picked === null) return [];
    await opts.nth(picked.i).click();
    await page.waitForTimeout(4500);

    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 2500);
      await page.waitForTimeout(700);
    }
    await page.waitForTimeout(1500);

    const raw = await page.evaluate(() => {
      const out = [];
      for (const art of document.querySelectorAll('article[data-testid^="d-rmx-listing-card"]')) {
        const a = art.querySelector('a[href*="/per/es/residential/property/"]');
        const text = (art.innerText || "").replace(/\n+/g, " | ").trim();
        if (!text || !a) continue;
        let src = "";
        let best = 0;
        for (const img of art.querySelectorAll("img")) {
          const s = img.currentSrc || img.src || img.getAttribute("data-src") || "";
          if (!s || /(logo|icon|avatar|favicon)/i.test(s)) continue;
          const w = img.naturalWidth || img.width || 0;
          if (w >= best) { best = w; src = s; }
        }
        out.push({ text, href: a.getAttribute("href"), src });
      }
      return out;
    });

    let cards = raw.map((c) => ({ ...parseRemaxCard(c.text), href: c.href, image: c.src })).filter(Boolean);
    cards = cards.filter((c) => !/arrendamiento|alquiler|renta|lease/i.test(c.label));

    const labels = REMAX_TYPE_LABELS[type] || [];
    if (labels.length) {
      cards = cards.filter((c) => labels.some((l) => c.label.toLowerCase().includes(l)));
    }

    const seen = new Set();
    cards = cards.filter((c) => {
      const k = c.priceUSD + "|" + c.location;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const fetched = await remaxPool(browser, cards.slice(0, 6), 3);
    const listings = [];
    const seenArea = new Set();
    for (const r of fetched) {
      if (!r) continue;
      const price = Math.round(r.priceUSD * USD_FX);
      const pM2 = price / r.area;
      if (pM2 < 200 || pM2 > 30000) continue;
      const key = Math.round(pM2) + "|" + r.area;
      if (seenArea.has(key)) continue;
      seenArea.add(key);
      listings.push({
        price: price,
        area: r.area,
        bedrooms: r.beds != null ? r.beds : null,
        bathrooms: r.baths != null ? r.baths : null,
        pricePerM2: Math.round(pM2),
        title: (r.title || name + " (RE/MAX)").slice(0, 90),
        source: "Remax",
        url: r.url,
        image: r.image
      });
      if (listings.length >= 10) break;
    }
    return listings;
  } catch (e) {
    console.log("[scraper] scrapeRemax falló →", e.message);
    return [];
  } finally {
    await page.close().catch(() => {});
  }
}

async function getComparables(query) {
  const cacheKey = [query.district || "", query.city || "", query.type || "departamento"].join("::");
  const now = Date.now();
  if (CACHE.has(cacheKey) && now - CACHE.get(cacheKey).fetchedAt < CACHE_TTL) {
    return CACHE.get(cacheKey).data;
  }

  // Evitar scrapes duplicados concurrentes: si ya hay uno en curso, esperar su resultado
  if (IN_FLIGHT.has(cacheKey)) {
    return IN_FLIGHT.get(cacheKey);
  }

  const run = (async () => {
    // Espaciar peticiones para respetar los portales
    const wait = Math.max(0, 2500 - (now - lastScrapeAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastScrapeAt = Date.now();

    const browser = await safeBrowser();
    if (!browser) {
      return { district: query.district || null, city: query.city || null, type: query.type || "departamento", count: 0, medianPerM2: null, medianArea: null, minPerM2: null, maxPerM2: null, sources: [], listings: [], fetchedAt: new Date().toISOString(), error: "Chromium no pudo iniciarse (revisa los logs)" };
    }

    const urls = buildUrls(query);
    const results = await Promise.all([
      ...urls.map((u) => scrapePage(browser, u.url).then((list) => ({ site: u.site, list }))),
      scrapeRemax(browser, query).then((list) => ({ site: "remax", list }))
    ]);

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
      listings: uniq.slice(0, 18),
      fetchedAt: new Date().toISOString()
    };

    if (data.count >= 2) {
      CACHE.set(cacheKey, { data, fetchedAt: now });
    }
    return data;
  })();

  IN_FLIGHT.set(cacheKey, run);
  try {
    return await run;
  } finally {
    IN_FLIGHT.delete(cacheKey);
  }
}

async function getRentals(query) {
  const cacheKey = "rent::" + [query.district || "", query.city || "", query.type || "departamento"].join("::");
  const now = Date.now();
  if (RENT_CACHE.has(cacheKey) && now - RENT_CACHE.get(cacheKey).fetchedAt < CACHE_TTL) {
    return RENT_CACHE.get(cacheKey).data;
  }

  if (RENT_IN_FLIGHT.has(cacheKey)) {
    return RENT_IN_FLIGHT.get(cacheKey);
  }

  const run = (async () => {
    const wait = Math.max(0, 2500 - (now - lastScrapeAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastScrapeAt = Date.now();

    const browser = await safeBrowser();
    if (!browser) {
      return { district: query.district || null, city: query.city || null, type: query.type || "departamento", count: 0, medianRent: null, medianRentPerM2: null, medianArea: null, minRent: null, maxRent: null, minRentPerM2: null, maxRentPerM2: null, sources: [], listings: [], fetchedAt: new Date().toISOString(), error: "Chromium no pudo iniciarse (revisa los logs)" };
    }

    const urls = buildRentUrls(query);
    const results = await Promise.all(
      urls.map((u) => scrapeRentPage(browser, u.url).then((list) => ({ site: u.site, list })))
    );

    const all = [];
    for (const r of results) all.push(...r.list);

    const uniq = [];
    const seen = new Set();
    for (const l of all) {
      const key = l.rentPerM2 + "|" + l.area + "|" + (l.bedrooms || "");
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(l);
    }

    const data = {
      district: query.district || null,
      city: query.city || null,
      type: query.type || "departamento",
      count: uniq.length,
      medianRent: median(uniq.map((l) => l.rent)),
      medianRentPerM2: median(uniq.map((l) => l.rentPerM2)),
      medianArea: median(uniq.map((l) => l.area)),
      minRent: uniq.length ? Math.min(...uniq.map((l) => l.rent)) : null,
      maxRent: uniq.length ? Math.max(...uniq.map((l) => l.rent)) : null,
      minRentPerM2: uniq.length ? Math.min(...uniq.map((l) => l.rentPerM2)) : null,
      maxRentPerM2: uniq.length ? Math.max(...uniq.map((l) => l.rentPerM2)) : null,
      sources: results.filter((r) => r.list.length).map((r) => r.site),
      listings: uniq.slice(0, 18),
      fetchedAt: new Date().toISOString()
    };

    if (data.count >= 2) {
      RENT_CACHE.set(cacheKey, { data, fetchedAt: now });
    }
    return data;
  })();

  RENT_IN_FLIGHT.set(cacheKey, run);
  try {
    return await run;
  } finally {
    RENT_IN_FLIGHT.delete(cacheKey);
  }
}

/* ------------------------------------------------------------------ */
/* NEXO Inmobiliario (nexoinmobiliario.pe) — proyectos nuevos          */
/* ------------------------------------------------------------------ */

const NEXO_PHASE = { "1": "En planos", "2": "En construcción", "3": "Entrega inmediata" };

// Algunos distritos usan slugs propios en Nexo
const NEXO_DISTRICT_SLUGS = {
  "Rímac": "el-rimac",
  "Rimac": "el-rimac"
};

function buildNexoUrl(query) {
  const name = query.district || query.city;
  if (!name) return null;
  const slug = NEXO_DISTRICT_SLUGS[name] || slugify(name);
  return "https://nexoinmobiliario.pe/departamentos/departamentos-" + slug;
}

function normalizeNexo(s) {
  return (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function nexoMatchesLocation(j, query) {
  const name = normalizeNexo(query.district || query.city);
  if (!name) return true;
  const hay = normalizeNexo([j.distrito, j.provincia_project, j.dpto_project].join(" "));
  return hay.includes(name);
}

function parseNexoItem(j) {
  if (!j || !j.project_id) return null;
  const coin = (j.coin || "S/.").trim();
  let priceFrom = parseFloat(j.min_price);
  if (!(priceFrom > 0)) return null;
  if (coin === "$") priceFrom = Math.round(priceFrom * USD_FX);
  if (priceFrom < 20000 || priceFrom > 30000000) return null;
  const areaMin = parseFloat(j.area_min);
  const areaMax = parseFloat(j.area_max);
  return {
    id: String(j.project_id),
    name: (j.name || "").replace(/\s+/g, " ").trim().slice(0, 80),
    priceFrom: priceFrom,
    coin: coin === "$" ? "$" : "S/",
    areaMin: isNaN(areaMin) ? null : Math.round(areaMin),
    areaMax: isNaN(areaMax) ? null : Math.round(areaMax),
    bedroomsMin: parseInt(j.room_min, 10) || null,
    bedroomsMax: parseInt(j.room_max, 10) || null,
    phase: NEXO_PHASE[j.project_phase] || "Nuevo",
    distrito: (j.distrito || "").trim(),
    direccion: (j.direccion || "").trim(),
    builder: (j.builder_name || "").trim(),
    image: j.image ? "https://e.nexoinmobiliario.pe/customers/" + j.image : "",
    url: j.url || "",
    dateCreation: j.date_creation || ""
  };
}

async function scrapeNexo(browser, query) {
  const url = buildNexoUrl(query);
  if (!url) return [];
  const page = await newStealthPage(browser);
  try {
    const ok = await navigate(page, url, 45000);
    if (!ok) return [];
    await page.waitForTimeout(1500);

    // Scroll para cargar páginas adicionales del listado (infinite scroll)
    let prev = 0;
    for (let i = 0; i < 30; i++) {
      await page.mouse.wheel(0, 3000);
      await page.waitForTimeout(600);
      if (i % 3 === 0) {
        const c = await page.evaluate(() => document.querySelectorAll("article .dataItem").length);
        if (c === prev && i > 2) break;
        prev = c;
      }
    }
    await page.waitForTimeout(1500);

    const items = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("article .dataItem")) {
        try { out.push(JSON.parse(el.value)); } catch (e) {}
      }
      return out;
    });

    const projects = [];
    const seen = new Set();
    for (const j of items) {
      const p = parseNexoItem(j);
      if (!p || !nexoMatchesLocation(j, query)) continue;
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      projects.push(p);
      if (projects.length >= 40) break;
    }
    projects.sort((a, b) => {
      const da = a.dateCreation, db = b.dateCreation;
      if (/^\d+$/.test(da) && /^\d+$/.test(db)) return Number(db) - Number(da);
      return String(db).localeCompare(String(da));
    });
    return projects;
  } catch (e) {
    console.log("[scraper] scrapeNexo falló para", url, "→", e.message);
    return [];
  } finally {
    await page.close().catch(() => {});
  }
}

async function getNexoProjects(query) {
  const cacheKey = "nexo::" + [query.district || "", query.city || "", query.all ? "all" : ""].join("::");
  const now = Date.now();
  if (NEXO_CACHE.has(cacheKey) && now - NEXO_CACHE.get(cacheKey).fetchedAt < CACHE_TTL) {
    return NEXO_CACHE.get(cacheKey).data;
  }

  if (NEXO_IN_FLIGHT.has(cacheKey)) {
    return NEXO_IN_FLIGHT.get(cacheKey);
  }

  const run = (async () => {
    const wait = Math.max(0, 2500 - (now - lastScrapeAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastScrapeAt = Date.now();

    const browser = await safeBrowser();
    if (!browser) {
      return { district: query.district || null, city: query.city || null, count: 0, minPrice: null, maxPrice: null, projects: [], fetchedAt: new Date().toISOString(), error: "Chromium no pudo iniciarse (revisa los logs)" };
    }

    const projects = await scrapeNexo(browser, query);
    const prices = projects.map((p) => p.priceFrom);
    const data = {
      district: query.district || null,
      city: query.city || null,
      count: projects.length,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      projects: query.all ? projects : projects.slice(0, 30),
      fetchedAt: new Date().toISOString()
    };

    if (data.count >= 1) {
      NEXO_CACHE.set(cacheKey, { data, fetchedAt: now });
    }
    return data;
  })();

  NEXO_IN_FLIGHT.set(cacheKey, run);
  try {
    return await run;
  } finally {
    NEXO_IN_FLIGHT.delete(cacheKey);
  }
}

/* ------------------------------------------------------------------ */
/* Detalle de una publicación (imágenes + descripción)                 */
/* ------------------------------------------------------------------ */
async function getListingDetail(url) {
  const browser = await getBrowser();
  const page = await newStealthPage(browser);
  try {
    const ok = await navigate(page, url, 40000);
    if (!ok) return { url: url, images: [], title: "", description: "" };
    await page.waitForTimeout(1500);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 2000);
      await page.waitForTimeout(500);
    }
    const data = await page.evaluate(() => {
      const seen = new Set();
      const imgs = [];
      for (const img of document.querySelectorAll("img")) {
        const src = img.currentSrc || img.src || img.getAttribute("data-src") || "";
        if (!src || seen.has(src) || src.startsWith("data:")) continue;
        if (/(logo|icon|avatar|favicon|map-pin|placeholder)/i.test(src)) continue;
        if (img.naturalWidth && img.naturalWidth < 120) continue;
        seen.add(src);
        imgs.push(src);
        if (imgs.length >= 10) break;
      }
      const title = (document.title || "").replace(/\s*[|–—-]\s*.*$/, "").trim().slice(0, 100);
      const text = (document.body ? document.body.innerText : "").replace(/\n+/g, " | ").trim();
      const desc = text
        .split(" | ")
        .filter((p) => p.length > 80 && /[a-záéíóúñ]/i.test(p))
        .slice(0, 3)
        .join(" · ")
        .slice(0, 600);
      return { imgs: imgs, title: title, desc: desc };
    });
    return { url: url, images: data.imgs, title: data.title, description: data.desc };
  } catch (e) {
    console.log("[scraper] getListingDetail falló para", url, "→", e.message);
    return { url: url, images: [], title: "", description: "" };
  } finally {
    await page.close().catch(() => {});
  }
}

const CACHE = new Map();
const CACHE_TTL = 10 * 60 * 1000;
const IN_FLIGHT = new Map();
const RENT_CACHE = new Map();
const RENT_IN_FLIGHT = new Map();
const NEXO_CACHE = new Map();
const NEXO_IN_FLIGHT = new Map();

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

module.exports = { getComparables, getListingDetail, getRentals, getNexoProjects, buildUrls, buildRentUrls, buildNexoUrl, parseCardText, parseRentCardText, parseNexoItem, scrapeRemax, parseRemaxCard, scrapeNexo };
