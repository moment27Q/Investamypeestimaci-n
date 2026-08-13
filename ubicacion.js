"use strict";

const https = require("https");

const API_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.GROQ_API_KEY || "";
const isGroq = API_KEY.startsWith("gsk_");
const MODEL = isGroq
  ? process.env.GROK_MODEL || process.env.GROQ_MODEL || "llama-3.3-70b-versatile"
  : process.env.XAI_MODEL || "grok-4.5";
const API_URL = isGroq
  ? "https://api.groq.com/openai/v1/chat/completions"
  : process.env.XAI_API_URL || "https://api.x.ai/v1/chat/completions";

const CACHE = new Map();
const TTL = 7 * 24 * 60 * 60 * 1000;

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
            reject(new Error("IA " + res.statusCode + ": " + body.slice(0, 300)));
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
    req.setTimeout(20000, () => req.destroy(new Error("timeout IA")));
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

async function validateLocation(loc) {
  if (!API_KEY) {
    return { enabled: false, valid: null, reason: null };
  }

  const lat = loc && loc.lat != null ? Math.round(loc.lat * 1000) : null;
  const lon = loc && loc.lon != null ? Math.round(loc.lon * 1000) : null;
  const key = (lat == null ? "?" : lat) + "::" + (lon == null ? "?" : lon);
  const now = Date.now();
  const hit = CACHE.get(key);
  if (hit && now - hit.t < TTL) return hit.data;

  const locationDesc = [
    "País: Perú",
    loc && loc.district ? "Distrito: " + loc.district : "",
    loc && loc.city ? "Ciudad: " + loc.city : "",
    lat != null && lon != null ? "Coordenadas: " + loc.lat + ", " + loc.lon : "",
    loc && loc.address ? "Dirección detectada: " + String(loc.address).slice(0, 160) : ""
  ].filter(Boolean).join(". ");

  const system =
    "Eres un validador de geolocalización inmobiliaria de Perú. Dadas las coordenadas y la dirección de un punto, " +
    "determina si corresponde a un lugar válido para una propiedad inmobiliaria: debe estar en tierra firme y " +
    "ser habitable o urbanizable (zona urbana, suburbio, pueblo, costa arenosa con viviendas, etc.). " +
    "Responde SOLO con JSON válido y sin texto adicional, en este formato exacto: " +
    '{"valid": true|false, "reason": "explicación breve en español"}.' +
    " Sé conservador: marca valid=false SOLO si el punto está claramente en el mar, lago, río, glaciar, desierto inhabitado o " +
    "en medio de la nada sin ninguna referencia habitable.";

  const user =
    "Analiza si esta ubicación en Perú es válida para tasar una propiedad: " + locationDesc +
    ". Recuerda: si el punto cae en agua (océano Pacífico, mar, lago, río) o en zona no habitable, valid=false. " +
    "Si es tierra firme con potencial de vivienda o terreno urbanizable, valid=true.";

  const payload = {
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  };

  try {
    const data = await post(payload);
    const content = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : null;
    const parsed = extractJson(content);
    if (parsed && typeof parsed.valid === "boolean") {
      const out = {
        enabled: true,
        valid: parsed.valid,
        reason: String(parsed.reason || "").slice(0, 220),
        model: MODEL
      };
      CACHE.set(key, { data: out, t: now });
      return out;
    }
    return { enabled: true, valid: null, reason: "Respuesta IA no interpretable" };
  } catch (e) {
    return { enabled: false, valid: null, reason: e.message };
  }
}

module.exports = { validateLocation };
