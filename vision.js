"use strict";

/*
 * Análisis de fotos del predio con IA multimodal (visión).
 * Reconoce el estado real del terreno a partir de fotografías y devuelve
 * factores que el motor de "Maximiza tu propiedad" aplica al cálculo.
 */

const https = require("https");

const API_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.GROQ_API_KEY || "";
const isGroq = API_KEY.startsWith("gsk_");
const VISION_MODEL = isGroq
  ? process.env.GROQ_VISION_MODEL || "qwen/qwen3.6-27b"
  : process.env.XAI_VISION_MODEL || "grok-4.5";
const API_URL = isGroq
  ? "https://api.groq.com/openai/v1/chat/completions"
  : process.env.XAI_API_URL || "https://api.x.ai/v1/chat/completions";

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
            reject(new Error("visión " + res.statusCode + ": " + body.slice(0, 300)));
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
    req.setTimeout(60000, () => req.destroy(new Error("timeout visión")));
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

function pick(raw, keys, fallback) {
  for (const k of keys) {
    if (raw[k] != null && String(raw[k]).trim() !== "") return String(raw[k]).trim();
  }
  return fallback;
}

function buildAnalysis(loc, raw) {
  const validEstado = ["limpio", "con_construccion", "en_uso", "descuidado"];
  const validTopo = ["plana", "pendiente", "desnivel"];
  const validHab = ["habilitado", "parcial", "no_habilitado"];
  const validUso = ["vacio", "casa", "comercial", "agricola", "otro"];
  const validAcceso = ["si", "parcial", "no"];

  const estado = pick(raw, ["estadoTerreno", "estado_terreno", "estado"], "limpio").toLowerCase();
  const topografia = pick(raw, ["topografia", "topografía"], "plana").toLowerCase();
  const habilitacion = pick(raw, ["habilitacion", "habilitación", "urbanizacion", "urbanización"], "habilitado").toLowerCase();
  const uso = pick(raw, ["usoActual", "uso_actual", "uso"], "vacio").toLowerCase();
  const acceso = pick(raw, ["accesoVia", "acceso_via", "acceso", "via"], "si").toLowerCase();
  const entorno = Math.max(1, Math.min(5, Math.round(Number(pick(raw, ["entorno", "calidadEntorno", "entorno_visible"], 3))) || 3));

  return {
    enabled: true,
    model: VISION_MODEL,
    estadoTerreno: validEstado.includes(estado) ? estado : "limpio",
    topografia: validTopo.includes(topografia) ? topografia : "plana",
    habilitacion: validHab.includes(habilitacion) ? habilitacion : "habilitado",
    usoActual: validUso.includes(uso) ? uso : "otro",
    accesoVia: validAcceso.includes(acceso) ? acceso : "si",
    entorno: entorno,
    observaciones: String(pick(raw, ["observaciones", "observacion", "notas"], "")).slice(0, 400),
    location: {
      district: loc && loc.district ? loc.district : null,
      city: loc && loc.city ? loc.city : null
    },
    analyzedAt: new Date().toISOString()
  };
}

async function inferVision(loc, images) {
  const locationDesc = [
    "País: Perú",
    loc.district ? "Distrito: " + loc.district : "",
    loc.city ? "Ciudad: " + loc.city : ""
  ].filter(Boolean).join(". ");

  const system =
    "Eres un tasador inmobiliario peruano experto en valorar terrenos y predios a partir de fotografías. " +
    "Analiza SOLO lo que puedas ver en las fotos; no inventes detalles. " +
    "No razones paso a paso ni en voz alta: responde directamente. " +
    "Responde SOLO con JSON válido y sin texto adicional, en este formato exacto: " +
    '{"estadoTerreno":"limpio|con_construccion|en_uso|descuidado","topografia":"plana|pendiente|desnivel","habilitacion":"habilitado|parcial|no_habilitado","usoActual":"vacio|casa|comercial|agricola|otro","accesoVia":"si|parcial|no","entorno":3,"observaciones":"texto breve en español"}';

  const user =
    "Ubicación del predio: " + locationDesc + "\n" +
    "Analiza estas fotografías del predio y responde:\n" +
    "- estadoTerreno: si el terreno está limpio/desocupado (limpio), tiene construcción antigua que habría que demoler (con_construccion), " +
    "está siendo usado con algún edificio o actividad (en_uso), o está descuidado con maleza/escombros (descuidado).\n" +
    "- topografia: plana, pendiente o desnivel.\n" +
    "- habilitacion: si tiene pistas, veredas, servicios a pie de lote (habilitado), parcialmente (parcial) o sin habilitar (no_habilitado).\n" +
    "- usoActual: vacio, casa, comercial, agricola u otro.\n" +
    "- accesoVia: si tiene acceso a vía (si), parcial o no.\n" +
    "- entorno: calidad visible del entorno urbano de 1 (pobre) a 5 (muy bueno).\n" +
    "- observaciones: 1 o 2 frases útiles para la tasación (estado de cercos, nivel, señales de humedad, altura, etc.).";

  const content = [
    { type: "text", text: user },
    { type: "text", text: "Fotografías del predio:" }
  ];
  images.slice(0, 4).forEach((u) => {
    content.push({ type: "image_url", image_url: { url: u } });
  });

  const payload = {
    model: VISION_MODEL,
    max_tokens: 1200,
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: content }
    ]
  };
  if (isGroq) {
    payload.reasoning_effort = "none";
    payload.response_format = { type: "json_object" };
  }

  const data = await post(payload);
  const msg = data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : null;
  const parsed = extractJson(msg);
  if (!parsed) throw new Error("No se pudo interpretar la respuesta de visión");
  return parsed;
}

async function analyzePhotos(loc, images) {
  if (!API_KEY) {
    return {
      enabled: false,
      reason: "Clave de IA no configurada en el servidor"
    };
  }
  if (!images || !images.length) {
    return { enabled: false, reason: "No se recibieron fotografías" };
  }
  if (images.length > 4) images = images.slice(0, 4);

  const attempts = [];
  [4, 2, 1].forEach(function (n) {
    const imgs = images.slice(0, n);
    if (imgs.length && !attempts.some(function (a) { return a.length === imgs.length; })) {
      attempts.push(imgs);
    }
  });

  let lastErr = null;
  for (const imgs of attempts) {
    try {
      const raw = await inferVision(loc, imgs);
      return buildAnalysis(loc, raw);
    } catch (e) {
      lastErr = e;
      if (!String(e.message).includes("429")) break;
      await new Promise((r) => setTimeout(r, 6000));
    }
  }
  return { enabled: false, reason: lastErr ? lastErr.message : "La IA de visión no respondió" };
}

function buildValuationAnalysis(raw) {
  const condition = pick(raw, ["condition", "condicion", "estado"], "bueno").toLowerCase();
  let finishes = pick(raw, ["finishes", "acabados"], "intermedio").toLowerCase();
  const factor = Math.max(0.85, Math.min(1.15, Number(raw.factor) || 1));
  const interiorVisible = raw.interiorVisible === true ||
    ["si", "true", "1"].includes(String(raw.interiorVisible).toLowerCase());
  if (!interiorVisible) finishes = "intermedio";
  let observations = String(pick(raw, ["observaciones", "observacion", "notas"], "")).slice(0, 400);
  if (!interiorVisible) {
    observations = (observations ? observations + " " : "") +
      "Las fotos no muestran el interior; los acabados se tomaron como intermedio.";
  }
  return {
    enabled: true,
    used: true,
    model: VISION_MODEL,
    factor: Math.round(factor * 1000) / 1000,
    condition: ["excelente", "bueno", "regular", "renovar"].includes(condition) ? condition : "bueno",
    finishes: ["premium", "intermedio", "basico"].includes(finishes) ? finishes : "intermedio",
    interiorVisible: interiorVisible,
    observations: observations.slice(0, 400),
    rationale: String(pick(raw, ["rationale", "razon", "justificacion"], "")).slice(0, 280),
    analyzedAt: new Date().toISOString()
  };
}

async function inferValuationVision(loc, images, inputs) {
  const type = String(inputs && inputs.type || "propiedad");
  const context = [
    "País: Perú",
    loc && loc.district ? "Distrito: " + loc.district : "",
    loc && loc.city ? "Ciudad: " + loc.city : "",
    "Tipo: " + type,
    inputs && inputs.age != null ? "Antigüedad declarada: " + inputs.age + " años" : "",
    inputs && inputs.condition ? "Conservación declarada: " + inputs.condition : "",
    inputs && inputs.finishes ? "Acabados declarados: " + inputs.finishes : ""
  ].filter(Boolean).join(". ");
  const system =
    "Eres un tasador inmobiliario peruano experto en inspección visual de inmuebles. " +
    "Analiza exclusivamente evidencias visibles en fotografías; no inventes atributos, medidas, ubicación, daños ocultos ni condición estructural. " +
    "Compara el estado y acabados que VES con lo declarado y decide un ajuste claro: si la propiedad se ve claramente mejor (renovada, impecable, acabados premium) sube el factor; si se ve peor (deterioro, humedad visible, muebles/grietas, acabados básicos) bájalo. " +
    "El factor 1 significa sin ajuste. Solo usa los extremos cuando la evidencia visual sea evidente. " +
    "Los acabados (finishes) solo pueden clasificarse si al menos una foto muestra el INTERIOR del inmueble (sala, cocina, baños, dormitorios); si ninguna foto muestra el interior, finishes debe ser intermedio e interiorVisible false. " +
    "Responde SOLO JSON válido: " +
    '{"factor":0.85-1.15,"condition":"excelente|bueno|regular|renovar","finishes":"premium|intermedio|basico","interiorVisible":true,"observaciones":"texto breve","rationale":"motivo breve del ajuste"}';
  const user =
    "Contexto de la propiedad: " + context + "\n" +
    "Revisa las fotos. Devuelve factor entre 0.85 y 1.15, con 1.00 si no hay evidencia suficiente. " +
    "Sube el factor si la condición y acabados visibles son claramente superiores a lo declarado o a la media; " +
    "bájalo si hay desgaste, deterioro, humedad, pintura descascarada, grietas o acabados claramente inferiores. " +
    "condition: clasifica el estado visible. finishes: clasifica los acabados visibles (SOLO si se ve el interior). " +
    "interiorVisible: true si alguna foto muestra el interior del inmueble; false si todas las fotos son exteriores o no muestran ambientes interiores. " +
    "Las observaciones deben describir únicamente lo visible y el rationale debe explicar el factor.";
  const content = [{ type: "text", text: user }];
  images.slice(0, 4).forEach((u) => content.push({ type: "image_url", image_url: { url: u } }));
  const payload = {
    model: VISION_MODEL,
    max_tokens: 900,
    temperature: 0.1,
    messages: [{ role: "system", content: system }, { role: "user", content: content }]
  };
  if (isGroq) {
    payload.reasoning_effort = "none";
    payload.response_format = { type: "json_object" };
  }
  const data = await post(payload);
  const msg = data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content : null;
  const parsed = extractJson(msg);
  if (!parsed) throw new Error("No se pudo interpretar la respuesta de visión");
  return parsed;
}

async function analyzeValuationPhotos(loc, images, inputs) {
  if (!API_KEY) return { enabled: false, used: false, factor: 1, reason: "Clave de IA no configurada en el servidor" };
  if (!images || !images.length) return { enabled: false, used: false, factor: 1, reason: "No se recibieron fotografías" };
  try {
    return buildValuationAnalysis(await inferValuationVision(loc, images.slice(0, 4), inputs || {}));
  } catch (e) {
    return { enabled: false, used: false, factor: 1, reason: e.message || "La IA de visión no respondió" };
  }
}

module.exports = { analyzePhotos, analyzeValuationPhotos };
