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

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
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
    req.setTimeout(30000, () => req.destroy(new Error("timeout IA")));
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

function describeInputs(inputs) {
  const L = {
    departamento: "Departamento",
    casa: "Casa",
    terreno: "Terreno",
    local: "Local comercial",
    oficina: "Oficina",
    piso: "Piso"
  };
  const type = L[inputs.type] || inputs.type || "Inmueble";
  const parts = [type];
  if (inputs.area) parts.push(inputs.area + " m² construidos");
  if (inputs.terrenoArea) parts.push("terreno de " + inputs.terrenoArea + " m²");
  if (inputs.bedrooms != null) parts.push(inputs.bedrooms + " dormitorios");
  if (inputs.bathrooms != null) parts.push(inputs.bathrooms + " baños");
  if (inputs.age != null) parts.push(inputs.age + " años de antigüedad");
  const cond = {
    excelente: "estado excelente/renovado",
    bueno: "buen estado",
    regular: "estado regular",
    renovar: "requiere renovación"
  }[inputs.condition];
  if (cond) parts.push(cond);
  if (inputs.estado === "nuevo") parts.push("obra nueva/estreno");
  if (inputs.floor != null) parts.push("piso " + inputs.floor);
  if (inputs.totalFloors) parts.push("edificio de " + inputs.totalFloors + " pisos");
  if (inputs.elevator === "si") parts.push("con ascensor");
  if (inputs.parking && inputs.parking !== "0") parts.push(inputs.parking + " estacionamiento(s)");
  if (inputs.view === "exterior") parts.push("vista exterior");
  if (inputs.finishes === "premium") parts.push("acabados premium");
  if (inputs.zoning) parts.push("zonificación " + inputs.zoning);
  if (inputs.corner === "esquina") parts.push("lote en esquina");
  return parts.join(", ");
}

async function inferAdjustment(ctx) {
  const where = [
    "País: Perú",
    ctx.district ? "Distrito: " + ctx.district : "",
    ctx.city ? "Ciudad: " + ctx.city : ""
  ].filter(Boolean).join(". ");

  const system =
    "Eres un tasador inmobiliario peruano experto en valuación de propiedades. " +
    "Recibes los datos estructurados de una propiedad y una descripción libre escrita por el propietario. " +
    "Debes decidir si la descripción revela atributos que AGREGUE o RESTE valor y que NO estén ya cubiertos " +
    "por los datos estructurados. Responde SOLO con JSON válido y sin texto adicional, en este formato exacto: " +
    '{"used":true|false,"factor":1.0,"summary":"atributo encontrado","rationale":"explicación breve en español"}';

  const user =
    "Ubicación: " + where + ".\n" +
    "Datos estructurados: " + describeInputs(ctx.inputs || {}) + ".\n" +
    "Descripción libre del propietario: «" + String(ctx.description || "").slice(0, 2000) + "».\n\n" +
    "Reglas:\n" +
    "- used=true solo si la descripción menciona algo verificable y no cubierto por los datos estructurados que afecte el valor " +
    "(ej. vista al mar, remodelación integral reciente, certificación, seguridad 24h, cochera, zonas comunes amplias, expropiación o ruido).\n" +
    "- Si la descripción está vacía, es genérica o no aporta nada adicional, used=false y factor=1.\n" +
    "- Ignora afirmaciones subjetivas o sin sustento (ej. «es la mejor casa del barrio», «tiene un valor incalculable»).\n" +
    "- factor: ajuste multiplicativo al valor estimado (1.0 = sin cambio). Rango permitido 0.85 a 1.15 (±15%).\n" +
    "  Sube el factor cuando la descripción revele atributos valiosos (vista, remodelación, seguridad, cochera, exclusividad de la zona); " +
    "bájalo cuando revele problemas que restan valor (humedad, ruido, antigüedad, mantenimiento pendiente, cercanía a zonas conflictivas).\n" +
    "- summary: el atributo clave detectado en una frase corta. rationale: por qué sube o baja el valor.";

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
  if (!parsed) throw new Error("No se pudo interpretar la respuesta de la IA");
  return parsed;
}

async function getDescriptionAdjustment(ctx) {
  const desc = String(ctx.description || "").trim();
  if (!API_KEY) {
    return { enabled: false, factor: 1, used: false, reason: "GROK_API_KEY (o XAI_API_KEY) no configurado en el servidor" };
  }
  if (desc.length < 15) {
    return { enabled: true, used: false, factor: 1, rationale: "" };
  }
  try {
    const parsed = await inferAdjustment(ctx);
    const factor = clamp(parseFloat(parsed.factor) || 1, 0.85, 1.15);
    const used = parsed.used !== false && factor !== 1;
    return {
      enabled: true,
      used: used,
      factor: Math.round(factor * 1000) / 1000,
      summary: String(parsed.summary || "").slice(0, 200),
      rationale: String(parsed.rationale || "").slice(0, 240),
      model: MODEL,
      fetchedAt: new Date().toISOString()
    };
  } catch (e) {
    return { enabled: false, factor: 1, used: false, reason: e.message };
  }
}

module.exports = { getDescriptionAdjustment };
