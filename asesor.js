"use strict";

/*
 * Asesor IA para "Maximiza tu propiedad".
 * La IA actúa EXCLUSIVAMENTE a favor del propietario del terreno: negocia
 * con albañil / constructora / inmobiliaria, advierte riesgos y sugiere
 * cláusulas contractuales que protejan al usuario.
 */

const https = require("https");

const API_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.GROQ_API_KEY || "";
const isGroq = API_KEY.startsWith("gsk_");
const MODEL = isGroq
  ? process.env.GROK_MODEL || process.env.GROQ_MODEL || "qwen/qwen3.6-27b"
  : process.env.XAI_MODEL || "grok-4.5";
const API_URL = isGroq
  ? "https://api.groq.com/openai/v1/chat/completions"
  : process.env.XAI_API_URL || "https://api.x.ai/v1/chat/completions";

const CACHE = new Map();
const CACHE_TTL = 6 * 60 * 60 * 1000;

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
    req.setTimeout(45000, () => req.destroy(new Error("timeout xAI")));
    req.on("error", reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

function extractJson(content) {
  if (!content) return null;
  let text = content.trim();
  text = text.replace(/<think>[\s\S]*?<\/think>/g, "");
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

function buildPlan(raw) {
  const share = raw.shareInmobiliaria || {};
  const fmtShare = (v) => Math.round(Number(v) || 0);

  const argumentos = Array.isArray(raw.argumentos)
    ? raw.argumentos.map((s) => String(s).trim()).filter(Boolean)
    : [];
  const clausulas = Array.isArray(raw.clausulas)
    ? raw.clausulas.map((s) => String(s).trim()).filter(Boolean)
    : [];
  const riesgos = Array.isArray(raw.riesgos)
    ? raw.riesgos.map((s) => String(s).trim()).filter(Boolean)
    : [];
  const preguntas = Array.isArray(raw.preguntas)
    ? raw.preguntas.map((s) => String(s).trim()).filter(Boolean)
    : [];

  const mejorModo = ["albañil", "constructora", "inmobiliaria"].includes(raw.mejorModo)
    ? raw.mejorModo
    : null;

  return {
    mejorModo: mejorModo,
    porQue: String(raw.porQue || "").trim().slice(0, 600),
    argumentos: argumentos.slice(0, 8),
    clausulas: clausulas.slice(0, 8),
    riesgos: riesgos.slice(0, 8),
    preguntas: preguntas.slice(0, 8),
    shareInmobiliaria: {
      min: fmtShare(share.min) || 45,
      razonable: fmtShare(share.razonable) || 50,
      max: fmtShare(share.max) || 60
    },
    consejo: String(raw.consejo || "").trim().slice(0, 400)
  };
}

function cacheKey(ctx) {
  return [
    ctx.district || "", ctx.city || "",
    Math.round(ctx.landArea || 0), ctx.zoning || "",
    Math.round(ctx.budget || 0), ctx.objective || "", ctx.mode || "",
    String(ctx.objetivo || "")
  ].join("::");
}

async function inferAdvisory(ctx) {
  const money = (v) => "S/ " + Math.round(v || 0).toLocaleString("es-PE");

  const system =
    "Eres un asesor inmobiliario independiente que actúa EXCLUSIVAMENTE a favor del propietario del terreno (el usuario). " +
    "Tu única lealtad es con él: defiendes sus intereses frente a albañiles, constructoras e inmobiliarias en el Perú. " +
    "Conoces el mercado inmobiliario peruano, el Reglamento Nacional de Tasaciones (D.S. 013-2002-VIVIENDA) y el marco legal del país. " +
    "Responde en español del Perú. Devuelve SOLO JSON válido y sin texto adicional, en este formato exacto: " +
    '{"mejorModo":"albañil|constructora|inmobiliaria","porQue":"texto breve","argumentos":["frase de negociación a favor del usuario"],"clausulas":["cláusula contractual que debe exigir"],"riesgos":["riesgo o señal de alerta"],"preguntas":["pregunta que debe hacer antes de firmar"],"shareInmobiliaria":{"min":45,"razonable":50,"max":60},"consejo":"recomendación final"}';

  const user =
    "El usuario es dueño de un terreno y quiere sacarle el MÁXIMO valor a su propiedad. Datos del caso:\n" +
    (ctx.district ? "- Distrito: " + ctx.district + "\n" : "") +
    (ctx.city ? "- Ciudad: " + ctx.city + "\n" : "") +
    "- Terreno: " + Math.round(ctx.landArea || 0) + " m²\n" +
    "- Área construible estimada: " + Math.round(ctx.builtArea || 0) + " m²\n" +
    "- Precio de venta estimado de la obra nueva: " + money(ctx.salePerM2) + "/m²\n" +
    "- Valor del terreno hoy: " + money(ctx.landValue) + "\n" +
    "- Valor de venta total proyectado: " + money(ctx.saleTotal) + "\n" +
    "- Renta mensual estimada del conjunto: " + money(ctx.rentaMonthly) + "\n" +
    "- Costo total construyendo con albañil: " + money(ctx.costAlbanil) + "\n" +
    "- Costo total construyendo con constructora: " + money(ctx.costConstructora) + "\n" +
    "- Presupuesto en efectivo del usuario: " + money(ctx.budget) + "\n" +
    "- Objetivo del usuario: " +
    ({ venta: "vender con la mayor ganancia", renta: "generar renta mensual", equilibrio: "equilibrio entre ganancia y rapidez" }[ctx.objective] || ctx.objective) + "\n" +
    (ctx.objetivo ? "- Plan del usuario (en sus propias palabras): \"" + String(ctx.objetivo).slice(0, 1000) + "\"\n" : "") +
    "- Modo que está evaluando: " + ctx.mode + "\n" +
    (ctx.fotoAnalisis ? "- Análisis de las fotos del predio: " + ctx.fotoAnalisis + "\n" : "") +
    "\n" +
    "Indica el mejorModo priorizando el beneficio neto del usuario según su objetivo Y su plan descrito en sus propias palabras: " +
    "si quiere construir y vender rápido, preferir constructora; si no tiene efectivo o no quiere gestionar la obra, " +
    "preferir inmobiliaria; si quiere el mayor margen y puede dedicarle tiempo, preferir albañil. " +
    "Si su presupuesto en efectivo " +
    "no alcanza el costo de albañil o constructora, recomienda inmobiliaria. En argumentos, da frases concretas y firmes " +
    "que el usuario pueda decir en la negociación PARA SU BENEFICIO (por ejemplo, anclar el % que le corresponde, exigir " +
    "costo de obra auditado, penalidades por atraso, etc.). En clausulas, incluye cláusulas de penalidad por retraso, " +
    "vicios ocultos, garantías, supervisión técnica, pagos por hitos verificados y retención final. En riesgos, señala " +
    "prácticas típicas que perjudican al propietario. En shareInmobiliaria, expresa el porcentaje del valor de venta que " +
    "el propietario debe recibir (en unidades o efectivo) al aportar su terreno: min (aceptable), razonable (lo que debe " +
    "pedir), max (excelente negocio). Sé específico, práctico y SIEMPRE a favor del usuario.";

  const payload = {
    model: MODEL,
    max_tokens: 2500,
    temperature: 0.4,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  };
  if (isGroq) {
    payload.reasoning_effort = "none";
    payload.response_format = { type: "json_object" };
  }

  const data = await post(payload);
  const content = data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : null;
  const parsed = extractJson(content);
  if (!parsed) throw new Error("No se pudo interpretar la respuesta de la IA");
  return buildPlan(parsed);
}

async function getAdvisory(ctx) {
  if (!API_KEY) {
    return {
      enabled: false,
      reason: "Clave de IA no configurada en el servidor",
      plan: null
    };
  }
  const key = cacheKey(ctx);
  const now = Date.now();
  const hit = CACHE.get(key);
  if (hit && now - hit.fetchedAt < CACHE_TTL) return hit.data;

  try {
    const plan = await inferAdvisory(ctx);
    const data = { enabled: true, model: MODEL, plan: plan, fetchedAt: now };
    CACHE.set(key, { data: data, fetchedAt: now });
    return data;
  } catch (e) {
    return {
      enabled: false,
      reason: e.message,
      plan: null
    };
  }
}

module.exports = { getAdvisory };
