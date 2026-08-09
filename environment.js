"use strict";

const https = require("https");

const API_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY || "";
const isGroq = API_KEY.startsWith("gsk_");
const MODEL = isGroq
  ? process.env.GROK_MODEL || "llama-3.3-70b-versatile"
  : process.env.XAI_MODEL || "grok-4.5";
const API_URL = isGroq
  ? "https://api.groq.com/openai/v1/chat/completions"
  : process.env.XAI_API_URL || "https://api.x.ai/v1/chat/completions";

const NSE_FACTORS = { A: 1.08, B: 1.05, C: 1.0, D: 0.93, E: 0.86 };
const NSE_LABELS = { A: "Alto", B: "Alto medio", C: "Medio", D: "Bajo medio", E: "Bajo" };

const CACHE = new Map();
const CACHE_TTL = 12 * 60 * 60 * 1000;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function cacheKey(loc) {
  const lat = loc && loc.lat != null ? Math.round(loc.lat * 1000) : "?";
  const lon = loc && loc.lon != null ? Math.round(loc.lon * 1000) : "?";
  return [loc && loc.district ? loc.district : "", loc && loc.city ? loc.city : "", lat, lon].join("::");
}

function post(payload) {
  return new Promise((resolve, reject) => {
    const u = new URL(API_URL);
    const req = https.request(
      u,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + API_KEY
        }
      },
      (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          if (res.statusCode >= 400) {
            reject(new Error("xAI " + res.statusCode + ": " + body.slice(0, 300)));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.setTimeout(30000, () => req.destroy(new Error("timeout xAI")));
    req.on("error", reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

function extractJson(content) {
  if (!content) return null;
  let text = content.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    return null;
  }
}

function buildProfile(loc, parsed) {
  const nseRaw = String(parsed.nse || parsed.nivel_socioeconomico || "").toUpperCase().replace(/[^A-E]/g, "");
  const nse = nseRaw.slice(0, 1) || "C";
  const envScore = clamp(parseFloat(parsed.environmentScore || parsed.calidad_entorno) || 3, 1, 5);
  const amenities = clamp(parseFloat(parsed.amenities || parsed.equipamiento) || 3, 1, 5);
  const services = clamp(parseFloat(parsed.services || parsed.servicios) || 3, 1, 5);

  const ZONA_VALID = ["premium", "central", "normal", "periferia"];
  const zonaRaw = String(parsed.zona || parsed.zone || parsed.zona_distrito || "")
    .toLowerCase().replace(/[^a-z]/g, "");
  const zona = ZONA_VALID.includes(zonaRaw) ? zonaRaw : "normal";

  const nseFactor = NSE_FACTORS[nse] || 1.0;
  const envFactor = clamp(nseFactor + (envScore - 3) * 0.02, 0.94, 1.08);

  return {
    enabled: true,
    nse: nse,
    nseLabel: NSE_LABELS[nse] || "Medio",
    environmentScore: envScore,
    amenities: amenities,
    services: services,
    zona: zona,
    environmentFactor: Math.round(envFactor * 1000) / 1000,
    rationale: String(parsed.rationale || parsed.razon || "").slice(0, 240),
    model: MODEL,
    fetchedAt: new Date().toISOString()
  };
}

async function inferWithGrok(loc) {
  const locationDesc = [
    "País: Perú",
    loc.district ? "Distrito: " + loc.district : "",
    loc.city ? "Ciudad: " + loc.city : "",
    loc.lat != null ? "Coordenadas: " + loc.lat + ", " + loc.lon : ""
  ].filter(Boolean).join(". ");

  const system =
    "Eres un tasador inmobiliario peruano con amplio conocimiento urbano. Dada la ubicación de una propiedad en Perú, " +
    "clasifica el entorno. Responde SOLO con JSON válido y sin texto adicional, en este formato exacto: " +
    '{"nse":"A|B|C|D|E","environmentScore":1-5,"amenities":1-5,"services":1-5,"zona":"premium|central|normal|periferia","rationale":"texto breve en español"}';

  const user =
    "Analiza el entorno urbano de esta propiedad en Perú: " + locationDesc +
    ". Define: nse = nivel socioeconómico del lugar (A=alto, B=medio-alto, C=medio, D=bajo-medio, E=bajo, según clasificación APEIM). " +
    "environmentScore = calidad general del entorno urbano (1=pobre ... 5=muy bueno). " +
    "amenities = nivel de equipamiento comercial y de servicios (1=nulo ... 5=completo: centros comerciales, restaurantes, bancos). " +
    "services = infraestructura (vías, agua, alcantarillado, alumbrado, transporte, colegios, salud) (1=pobre ... 5=excelente). " +
    "zona = tipo de zona dentro del distrito donde está la propiedad: premium (exclusiva, turística, frente al mar o junto al parque/avenida principal), " +
    "central (zona céntrica consolidada y bien conectada), normal (zona residencial estándar) o periferia (zona periférica o en expansión). " +
    "Usa tu conocimiento de las zonas de Perú y sé conservador y razonable.";

  const payload = {
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  };

  const data = await post(payload);
  const content = data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : null;
  const parsed = extractJson(content);
  if (!parsed) throw new Error("No se pudo interpretar la respuesta de xAI");
  return parsed;
}

async function getEnvironmentProfile(loc) {
  if (!API_KEY) {
    return {
      enabled: false,
      reason: "XAI_API_KEY no configurado en el servidor",
      environmentFactor: 1
    };
  }
  const key = cacheKey(loc);
  const now = Date.now();
  const hit = CACHE.get(key);
  if (hit && now - hit.fetchedAt < CACHE_TTL) return hit.data;

  try {
    const parsed = await inferWithGrok(loc);
    const profile = buildProfile(loc, parsed);
    if (profile.nse) CACHE.set(key, { data: profile, fetchedAt: now });
    return profile;
  } catch (e) {
    return {
      enabled: false,
      reason: e.message,
      environmentFactor: 1
    };
  }
}

module.exports = { getEnvironmentProfile, NSE_FACTORS, NSE_LABELS, buildProfile };
