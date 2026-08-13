function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ------------------------------------------------------------------ */
/* Tablas de ajuste — cada tipo de inmueble tiene sus propios pesos    */
/* ------------------------------------------------------------------ */

const TYPE_FACTORS = {
  departamento: 1.00,
  casa:         0.92,
  terreno:      0.55,
  local:        1.25,
  oficina:      1.05,
  piso:         1.00
};

const CONDITION_FACTORS = {
  excelente: 1.08,
  bueno:     1.00,
  regular:   0.90,
  renovar:   0.78
};

const ZONE_FACTORS = {
  auto:     1.00,
  premium:  1.03,
  central:  1.015,
  normal:   1.00,
  periferia:0.96
};

const FINISH_FACTORS = { basico: 0.94, intermedio: 1.00, premium: 1.07 };
const VIEW_FACTORS = { none: 1.00, exterior: 1.02, interior: 0.98 };
const REGIME_FACTORS = { independiente: 1.00, condominio: 1.05 };
const AMENITIES_FACTORS = { ninguno: 0.98, basico: 1.00, medio: 1.02, completo: 1.04 };
const ELEVATOR_FACTORS = { si: 1.02, no: 1.00 };
const STORAGE_FACTORS = { si: 1.01, no: 1.00 };
const SHAPE_FACTORS = { regular: 1.00, irregular: 0.93 };
const TOPO_FACTORS = { plana: 1.00, pendiente: 0.88, desnivel: 0.90 };
const ZONING_FACTORS = { residencial: 1.00, comercial: 1.12, industrial: 0.85, mixto: 1.06 };
const SERVICES_FACTORS = { completo: 1.00, parcial: 0.92, ninguno: 0.80 };
const URBAN_FACTORS = { habilitado: 1.00, no_habilitado: 0.80 };
const ROAD_FACTORS = { si: 1.05, no: 1.00 };
const CORNER_FACTORS = { esquina: 1.06, intermedio: 1.00 };
const FENCE_FACTORS = { si: 1.00, no: 0.97 };

const REFERENCE_AREA = { departamento: 70, casa: 180, terreno: 300, local: 100, oficina: 100 };

/* ---------------- Valoración de cocheras / estacionamiento ---------------- */

const PARKING_TYPE_FACTORS = {
  techada: 1.0,        // cochera individual techada
  descubierta: 0.65,   // descubierta / patio común
  tandem: 1.45,        // doble o tándem: factor aplica sobre el PAR, no por unidad
  via_publica: 0       // en vía pública: no es un activo tasable
};

const PARKING_REGISTRAL_FACTORS = { si: 1.0, no: 0.6 };

// TODO: reemplazar con una tabla real de valor referencial de cochera por distrito
// (ej. { "Miraflores": 55000, "San Isidro": 60000, ... }). Mientras no exista,
// se usa este valor por defecto cuando no hay comparables reales disponibles.
const DEFAULT_PARKING_REF = 15000;

const PARKING_TYPE_LABELS = {
  techada: "Techada individual",
  descubierta: "Descubierta / patio común",
  tandem: "Doble o tándem",
  via_publica: "En vía pública (no tasable)"
};

/*
 * Valor_cochera = Valor_referencial_zona_por_cochera × Factor_tipo × Factor_registral
 *  - Factor_tipo: techada 1.0 · descubierta 0.65 · tándem 1.45 (sobre el par) · vía pública 0
 *  - Factor_registral: con partida SUNARP independiente 1.0 · sin independizar 0.6
 * Para más de una cochera (excluyendo el tándem, que ya cuenta como par):
 *   Valor_total = Valor_1 + Σ(Valor_n × 0.90)  para n = 2, 3, ...
 * El valor referencial sale de comparables reales de cocheras sueltas (cocheraMarket);
 * si hay menos de 3 comparables se usa DEFAULT_PARKING_REF.
 */
function computeParkingValue(inputs, cocheraMarket) {
  const count = clamp(parseInt(inputs.parkingCount, 10) || 0, 0, 10);
  if (count <= 0) {
    return { total: 0, rows: [], refValue: null, method: "none", count: 0 };
  }

  // Valor referencial por cochera según la zona (comparables reales o fallback)
  let refValue, method, source;
  if (cocheraMarket && cocheraMarket.count >= 3 && cocheraMarket.avgPrice) {
    refValue = cocheraMarket.avgPrice;
    method = "comparables";
    source = "promedio de " + cocheraMarket.count + " avisos reales de cocheras en el distrito";
  } else {
    refValue = DEFAULT_PARKING_REF;
    method = "fallback";
    source = "valor por defecto (sin comparables suficientes)";
  }

  const types = Array.isArray(inputs.parkingTypes) ? inputs.parkingTypes : [];
  const regFactor = PARKING_REGISTRAL_FACTORS[inputs.parkingRegistral === "si" ? "si" : "no"] || 1;

  const rows = [];
  let total = 0;
  let tandemCount = 0;
  for (let i = 0; i < count; i++) {
    const type = PARKING_TYPE_FACTORS[types[i]] != null ? types[i] : "techada";
    if (type === "via_publica") {
      rows.push({
        index: i + 1,
        type: type,
        label: PARKING_TYPE_LABELS[type],
        factor: 0,
        value: 0,
        taxable: false,
        note: "no se considera activo tasable"
      });
      continue;
    }
    // El tándem representa un PAR de cocheras; solo se valora un par.
    if (type === "tandem") {
      tandemCount++;
      if (tandemCount > 1) continue;
    }
    const typeFactor = PARKING_TYPE_FACTORS[type];
    // La primera cochera se valora completa; de la segunda en adelante ×0.90.
    const isExtra = rows.filter((r) => r.taxable).length >= 1;
    const value = refValue * typeFactor * regFactor * (isExtra ? 0.9 : 1);
    rows.push({
      index: i + 1,
      type: type,
      label: PARKING_TYPE_LABELS[type],
      factor: typeFactor,
      regFactor: regFactor,
      value: Math.round(value),
      taxable: true,
      isExtra: isExtra,
      note: type === "tandem" ? "aplica sobre el par" : ""
    });
    total += value;
  }

  return {
    total: Math.round(total),
    rows: rows,
    count: count,
    refValue: refValue,
    refSource: source,
    method: method,
    registral: inputs.parkingRegistral === "si"
  };
}

function fr(rows, key, label, factor) {
  if (factor !== 1) rows.push({ key: key, label: label, factor: factor, pct: (factor - 1) * 100 });
}

function sizeFactorFor(type, area, refArea) {
  const ref = refArea || REFERENCE_AREA[type] || 70;
  return clamp(Math.pow(ref / area, 0.12), 0.75, 1.15);
}

function landRatioFor(basePrice) {
  return clamp(0.5 + (basePrice - 2500) / 12000, 0.5, 0.85);
}

/* ------------------------- DEPARTAMENTO ------------------------- */
function calcDepartamento(inputs, envFactor, refArea) {
  const area = clamp(inputs.area, 15, 1500);
  const sizeFactor = sizeFactorFor("departamento", area, refArea);
  const typeFactor = TYPE_FACTORS.departamento;

  let conditionFactor = 1, ageFactor = 1, floorFactor = 1, zoneFactor = 1, estadoFactor = 1;
  conditionFactor = CONDITION_FACTORS[inputs.condition] || 1;
  const age = clamp(inputs.age, 0, 60);
  if (!(inputs.estado === "nuevo" || age <= 3)) ageFactor = Math.max(0.70, 1 - (age - 3) * 0.008);
  const floor = clamp(inputs.floor, 0, 40);
  if (floor <= 0) floorFactor = 0.97;
  else if (floor === 1) floorFactor = 0.96;
  else if (floor >= 10) floorFactor = 1.07;
  else floorFactor = 0.98 + floor * 0.004;
  zoneFactor = ZONE_FACTORS[inputs.zone] || 1;
  estadoFactor = inputs.estado === "nuevo" ? 1.04 : 1.0;

  const bedrooms = clamp(inputs.bedrooms, 0, 8);
  const bedroomFactor = bedrooms <= 0 ? 0.99 : clamp(1 + (bedrooms - 2) * 0.008, 0.96, 1.05);
  const bathrooms = clamp(inputs.bathrooms, 1, 8);
  const bathroomFactor = clamp(1 + (bathrooms - 2) * 0.006, 0.97, 1.04);
  const totalFloors = clamp(inputs.totalFloors || 5, 1, 60);
  const buildingFactor = totalFloors >= 15 ? 1.02 : totalFloors >= 8 ? 1.01 : 1.0;
  const elevatorFactor = ELEVATOR_FACTORS[inputs.elevator] || 1;
  const storageFactor = STORAGE_FACTORS[inputs.storage] || 1;
  const viewFactor = VIEW_FACTORS[inputs.view] || 1;
  const finishesFactor = FINISH_FACTORS[inputs.finishes] || 1;
  const amenitiesFactor = AMENITIES_FACTORS[inputs.amenities] || 1;
  const regimeFactor = REGIME_FACTORS[inputs.regime] || 1;
  const maintenanceFactor = clamp(1 - Math.min(inputs.maintenance || 0, 2000) / 200000, 0.99, 1.0);
  const envF = envFactor || 1;

  const rows = [];
  fr(rows, "tipo", "Tipo de inmueble (departamento)", typeFactor);
  fr(rows, "tamano", "Tamaño (" + area + " m²)", sizeFactor);
  fr(rows, "edad", "Antigüedad (" + age + " años)", ageFactor);
  fr(rows, "condicion", "Estado de conservación", conditionFactor);
  fr(rows, "piso", "Piso / planta (" + floor + ")", floorFactor);
  fr(rows, "zona", "Zona interna del distrito", zoneFactor);
  fr(rows, "estado", "Nuevo / usado", estadoFactor);
  fr(rows, "dorm", "Dormitorios (" + bedrooms + ")", bedroomFactor);
  fr(rows, "bano", "Baños (" + bathrooms + ")", bathroomFactor);
  fr(rows, "edificio", "Edificio de " + totalFloors + " pisos", buildingFactor);
  fr(rows, "ascensor", inputs.elevator === "si" ? "Con ascensor" : "Sin ascensor", elevatorFactor);
  fr(rows, "deposito", inputs.storage === "si" ? "Con depósito" : "Sin depósito", storageFactor);
  if (inputs.view) fr(rows, "vista", "Vista " + inputs.view, viewFactor);
  fr(rows, "acabados", "Acabados " + inputs.finishes, finishesFactor);
  fr(rows, "amenities", "Amenities " + inputs.amenities, amenitiesFactor);
  fr(rows, "regimen", "Régimen " + inputs.regime, regimeFactor);
  fr(rows, "mantenimiento", "Mantenimiento S/ " + (inputs.maintenance || 0), maintenanceFactor);
  fr(rows, "entorno", "Entorno socioeconómico", envF);

  const factor = typeFactor * sizeFactor * ageFactor * conditionFactor * floorFactor *
    zoneFactor * estadoFactor * bedroomFactor * bathroomFactor * buildingFactor *
    elevatorFactor * storageFactor * viewFactor * finishesFactor *
    amenitiesFactor * regimeFactor * maintenanceFactor * envF;

  return { area: area, factor: factor, rows: rows };
}

/* ----------------------------- CASA ----------------------------- */
function calcCasa(inputs, envFactor, refArea) {
  const builtArea = clamp(inputs.area, 20, 1500);
  const terrainArea = clamp(inputs.terrenoArea || builtArea, 20, 5000);
  const sizeFactor = sizeFactorFor("casa", builtArea, refArea);
  const typeFactor = TYPE_FACTORS.casa;

  let conditionFactor = 1, ageFactor = 1, zoneFactor = 1, estadoFactor = 1;
  conditionFactor = CONDITION_FACTORS[inputs.condition] || 1;
  const age = clamp(inputs.age, 0, 60);
  if (!(inputs.estado === "nuevo" || age <= 3)) ageFactor = Math.max(0.70, 1 - (age - 3) * 0.008);
  zoneFactor = ZONE_FACTORS[inputs.zone] || 1;
  estadoFactor = inputs.estado === "nuevo" ? 1.04 : 1.0;

  const bedrooms = clamp(inputs.bedrooms, 0, 10);
  const bedroomFactor = bedrooms <= 0 ? 0.99 : clamp(1 + (bedrooms - 3) * 0.006, 0.95, 1.04);
  const bathrooms = clamp(inputs.bathrooms, 1, 8);
  const bathroomFactor = clamp(1 + (bathrooms - 3) * 0.005, 0.96, 1.03);
  const houseFloors = clamp(inputs.casaFloors || 2, 1, 8);
  const floorsFactor = clamp(1 + (houseFloors - 2) * 0.01, 0.98, 1.06);
  const front = clamp(inputs.front || 10, 3, 60);
  const frontFactor = clamp(1 + (front - 10) * 0.004, 0.92, 1.06);
  const shapeFactor = SHAPE_FACTORS[inputs.shape] || 1;
  const topoFactor = TOPO_FACTORS[inputs.topography] || 1;
  const fenceFactor = FENCE_FACTORS[inputs.fence] || 1;
  const garden = clamp(inputs.garden || 0, 0, 2000);
  const gardenFactor = clamp(1 + Math.min(garden, 200) * 0.0002, 1, 1.04);
  const finishesFactor = FINISH_FACTORS[inputs.finishes] || 1;
  const remodel = clamp(inputs.remodel || 0, 0, 50);
  const remodelFactor = remodel > 0 && remodel <= 10 ? 1.02 : 1.0;
  const landRatio = terrainArea / builtArea;
  const landFactor = clamp(1 + Math.max(0, landRatio - 1.5) * 0.05, 1, 1.08);
  const envF = envFactor || 1;

  const rows = [];
  fr(rows, "tipo", "Tipo de inmueble (casa)", typeFactor);
  fr(rows, "tamano", "Área construida (" + builtArea + " m²)", sizeFactor);
  fr(rows, "tierra", "Ratio terreno/construido (" + Math.round(landRatio * 10) / 10 + ")", landFactor);
  fr(rows, "edad", "Antigüedad (" + age + " años)", ageFactor);
  fr(rows, "condicion", "Estado de conservación", conditionFactor);
  fr(rows, "zona", "Zona interna del distrito", zoneFactor);
  fr(rows, "estado", "Nuevo / usado", estadoFactor);
  fr(rows, "pisos", "Pisos de la casa (" + houseFloors + ")", floorsFactor);
  fr(rows, "dorm", "Dormitorios (" + bedrooms + ")", bedroomFactor);
  fr(rows, "bano", "Baños (" + bathrooms + ")", bathroomFactor);
  fr(rows, "frente", "Frente del lote (" + front + " ml)", frontFactor);
  fr(rows, "forma", "Forma " + inputs.shape, shapeFactor);
  fr(rows, "topografia", "Topografía " + inputs.topography, topoFactor);
  fr(rows, "cerco", inputs.fence === "si" ? "Con cerco perimetral" : "Sin cerco perimetral", fenceFactor);
  fr(rows, "jardin", "Jardín / áreas libres (" + garden + " m²)", gardenFactor);
  fr(rows, "acabados", "Acabados " + inputs.finishes, finishesFactor);
  fr(rows, "remodel", "Remodelada hace " + remodel + " años", remodelFactor);
  fr(rows, "entorno", "Entorno socioeconómico", envF);

  const factor = typeFactor * sizeFactor * landFactor * ageFactor * conditionFactor *
    zoneFactor * estadoFactor * floorsFactor * bedroomFactor * bathroomFactor *
    frontFactor * shapeFactor * topoFactor * fenceFactor *
    gardenFactor * finishesFactor * remodelFactor * envF;

  return { area: builtArea, factor: factor, rows: rows };
}

/* ---------------------------- TERRENO ---------------------------- */
function calcTerreno(inputs, envFactor, landRatio) {
  const area = clamp(inputs.area, 15, 20000);
  const sizeFactor = sizeFactorFor("terreno", area);
  const typeFactor = landRatio || TYPE_FACTORS.terreno;
  const zoneFactor = ZONE_FACTORS[inputs.zone] || 1;

  const front = clamp(inputs.front || 10, 3, 100);
  const frontFactor = clamp(1 + (front - 10) * 0.006, 0.90, 1.10);
  const shapeFactor = SHAPE_FACTORS[inputs.shape] || 1;
  const topoFactor = TOPO_FACTORS[inputs.topography] || 1;
  const zoningFactor = ZONING_FACTORS[inputs.zoning] || 1;
  const servicesFactor = SERVICES_FACTORS[inputs.services] || 1;
  const cornerFactor = CORNER_FACTORS[inputs.corner] || 1;
  const urbanFactor = URBAN_FACTORS[inputs.urbanization] || 1;
  const roadFactor = ROAD_FACTORS[inputs.road] || 1;
  const envF = envFactor || 1;

  const rows = [];
  fr(rows, "tipo", "Tipo de inmueble (terreno)", typeFactor);
  fr(rows, "tamano", "Área del terreno (" + area + " m²)", sizeFactor);
  fr(rows, "frente", "Frente del lote (" + front + " ml)", frontFactor);
  fr(rows, "forma", "Forma " + inputs.shape, shapeFactor);
  fr(rows, "topografia", "Topografía " + inputs.topography, topoFactor);
  fr(rows, "zonificacion", "Zonificación " + inputs.zoning, zoningFactor);
  fr(rows, "servicios", "Servicios a pie de lote (" + inputs.services + ")", servicesFactor);
  fr(rows, "esquina", inputs.corner === "esquina" ? "Lote en esquina" : "Lote intermedio", cornerFactor);
  fr(rows, "habilitacion", inputs.urbanization === "habilitado" ? "Urbano habilitado" : "No habilitado", urbanFactor);
  fr(rows, "via", inputs.road === "si" ? "Cerca de vía principal" : "Sin vía principal cercana", roadFactor);
  fr(rows, "zona", "Zona interna del distrito", zoneFactor);
  fr(rows, "entorno", "Entorno socioeconómico", envF);

  const factor = typeFactor * sizeFactor * zoneFactor * frontFactor * shapeFactor *
    topoFactor * zoningFactor * servicesFactor * cornerFactor * urbanFactor *
    roadFactor * envF;

  return { area: area, factor: factor, rows: rows };
}

/* -------------------- LOCAL / OFICINA (genérico) -------------------- */
function calcGeneric(inputs, envFactor, type, refArea) {
  const area = clamp(inputs.area, 15, 1500);
  const sizeFactor = sizeFactorFor(type, area, refArea);
  const typeFactor = TYPE_FACTORS[type] || 1;
  const conditionFactor = CONDITION_FACTORS[inputs.condition] || 1;
  const age = clamp(inputs.age, 0, 60);
  const ageFactor = (!(inputs.estado === "nuevo" || age <= 3)) ? Math.max(0.70, 1 - (age - 3) * 0.008) : 1;
  const zoneFactor = ZONE_FACTORS[inputs.zone] || 1;
  const estadoFactor = inputs.estado === "nuevo" ? 1.04 : 1.0;
  const envF = envFactor || 1;

  const rows = [];
  fr(rows, "tipo", "Tipo de inmueble (" + type + ")", typeFactor);
  fr(rows, "tamano", "Tamaño (" + area + " m²)", sizeFactor);
  fr(rows, "edad", "Antigüedad (" + age + " años)", ageFactor);
  fr(rows, "condicion", "Estado de conservación", conditionFactor);
  fr(rows, "zona", "Zona interna del distrito", zoneFactor);
  fr(rows, "estado", "Nuevo / usado", estadoFactor);
  fr(rows, "entorno", "Entorno socioeconómico", envF);

  const factor = typeFactor * sizeFactor * ageFactor * conditionFactor * zoneFactor * estadoFactor * envF;
  return { area: area, factor: factor, rows: rows };
}

/* ------------------------------------------------------------------ */

function normalize(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCity(name) {
  if (!name) return null;
  const n = normalize(name);
  for (const key in DATA.cities) {
    if (normalize(key) === n) return DATA.cities[key];
  }
  return null;
}

function resolveBasePrice(location, market) {
  // location: { district, city, state, lat, lon }
  // market: { count, medianPerM2 } (comparables reales de Adondevivir/Urbania/Remax)
  const hasMarket = market && market.count >= 3 && market.medianPerM2;

  if (location && location.district && DATA.districts[location.district]) {
    const d = DATA.districts[location.district];
    let base = d.price;

    // Refinamiento por proximidad: cerca de un distrito premium el valor sube (borde de distrito).
    if (location.lat != null && location.lon != null) {
      let boost = 0;
      for (const key in DATA.districts) {
        if (key === location.district) continue;
        const o = DATA.districts[key];
        if (o.price <= base) continue;
        const dist = haversineKm(location.lat, location.lon, o.lat, o.lon);
        if (dist < 2.5) boost += (o.price - base) * (1 - dist / 2.5) * 0.5;
      }
      base += clamp(boost, 0, base * 0.10);
    }

    const r = {
      base: base,
      label: location.district,
      level: hasMarket ? "alta" : "media",
      msg: hasMarket
        ? "Precio de mercado calculado desde " + market.count +
          " avisos reales de Adondevivir, Urbania y Remax (mediana S/ " +
          Math.round(market.medianPerM2).toLocaleString("es-PE") + "/m²)."
        : "Distrito identificado con exactitud en la base de datos. Sin avisos de mercado suficientes; se usó el valor estático."
    };
    if (hasMarket) r.base = blendWithMarket(base, market);
    return r;
  }

  // Sin distrito exacto pero dentro de Lima Metropolitana/Callao -> interpolación por distancia (IDW).
  if (location && location.lat != null && location.lon != null &&
      isLimaZone(location)) {
    const pairs = [];
    for (const key in DATA.districts) {
      const d = DATA.districts[key];
      pairs.push({ key, price: d.price, dist: haversineKm(location.lat, location.lon, d.lat, d.lon) });
    }
    pairs.sort((a, b) => a.dist - b.dist);
    const nearest = pairs.slice(0, 4);
    let wsum = 0, psum = 0;
    for (const p of nearest) {
      const w = 1 / (p.dist + 0.3);
      wsum += w;
      psum += w * p.price;
    }
    let base = psum / wsum;
    const r = {
      base: base,
      label: "Lima Metropolitana (estimado por cercanía a " + nearest[0].key + ")",
      level: hasMarket ? "media" : "baja",
      msg: "No se identificó el distrito exacto. El precio se interpoló desde los distritos más cercanos."
    };
    if (hasMarket) {
      r.base = blendWithMarket(base, market);
      r.msg = "Precio de mercado calculado desde " + market.count +
        " avisos reales de Adondevivir, Urbania y Remax (mediana S/ " +
        Math.round(market.medianPerM2).toLocaleString("es-PE") + "/m²).";
      r.marketUsed = true;
    }
    return r;
  }

  // Ciudad reconocida fuera de Lima.
  const cityEntry = getCity(location.city);
  if (cityEntry) {
    const r = {
      base: cityEntry.price,
      label: location.city,
      level: "baja",
      msg: "Estimación a nivel de ciudad. La variación por zona dentro de la ciudad puede ser amplia."
    };
    if (hasMarket) {
      r.base = blendWithMarket(cityEntry.price, market);
      r.msg = "Precio de mercado calculado desde " + market.count +
        " avisos reales (mediana S/ " +
        Math.round(market.medianPerM2).toLocaleString("es-PE") + "/m²).";
      r.marketUsed = true;
    }
    return r;
  }

  return {
    base: NATIONAL_AVG,
    label: "Perú (referencial)",
    level: "referencial",
    msg: "No se pudo identificar la zona. Se usó un valor referencial nacional de S/ " +
      NATIONAL_AVG.toLocaleString("es-PE") + " por m²."
  };
}

function blendWithMarket(staticBase, market) {
  const median = market.medianPerM2;
  // Si la mediana de mercado se sale demasiado del rango esperado, confiamos en la estática.
  if (median < staticBase * 0.45 || median > staticBase * 2.2) return staticBase;
  return 0.85 * median + 0.15 * staticBase;
}

function isLimaZone(location) {
  if (!location) return false;
  const state = (location.state || "").toLowerCase();
  const city = (location.city || "").toLowerCase();
  if (state.includes("lima") || city.includes("lima") || state.includes("callao")) return true;
  if (DATA.districts[location.district]) return true;
  return false;
}

function computeValuation(location, inputs, market, envProfile, descAdj, photoAdj, cocheraMarket) {
  const base = resolveBasePrice(location, market);
  const envRaw = envProfile && envProfile.environmentFactor ? envProfile.environmentFactor : 1;
  const envFactor = 1 + (envRaw - 1) * 0.5;
  const hasMarket = market && market.count >= 3 && market.medianPerM2;
  const refArea = hasMarket && market.medianArea ? market.medianArea : null;
  const landRatio = landRatioFor(base.base);
  const descFactor = descAdj && descAdj.used && descAdj.factor != null
    ? clamp(descAdj.factor, 0.85, 1.15)
    : 1;
  const photoFactor = photoAdj && photoAdj.used && photoAdj.factor != null
    ? clamp(photoAdj.factor, 0.85, 1.15)
    : 1;

  const type = inputs.type || "departamento";
  let calc;
  if (type === "departamento") calc = calcDepartamento(inputs, envFactor, refArea);
  else if (type === "casa") calc = calcCasa(inputs, envFactor, refArea);
  else if (type === "terreno") calc = calcTerreno(inputs, envFactor, landRatio);
  else calc = calcGeneric(inputs, envFactor, type, refArea);

  const effectivePerM2 = base.base * calc.factor;
  const baseTotal = effectivePerM2 * calc.area * descFactor * photoFactor;
  // Las cocheras se suman como activo separado (no son factor multiplicativo).
  const parking = computeParkingValue(inputs, cocheraMarket);
  const total = baseTotal + parking.total;
  const rangeLow = total * 0.92;
  const rangeHigh = total * 1.08;
  const realization = total * 0.8;

  const factors = [
    {
      key: "base",
      label: base.marketUsed
        ? "Precio m² de mercado (" + market.count + " avisos) — " + base.label
        : "Precio m² base — " + base.label,
      factor: 1,
      pct: null
    }
  ].concat(calc.rows);

  if (descFactor !== 1 && descAdj && descAdj.used) {
    factors.push({
      key: "descripcion",
      label: "Descripción con IA",
      factor: descFactor,
      pct: (descFactor - 1) * 100
    });
  }
  if (photoFactor !== 1 && photoAdj && photoAdj.used) {
    factors.push({
      key: "fotos",
      label: "Estado visible y acabados (IA con fotos)",
      factor: photoFactor,
      pct: (photoFactor - 1) * 100
    });
  }

  return {
    basePerM2: base.base,
    effectivePerM2: effectivePerM2,
    baseTotal: baseTotal,
    total: total,
    totalUSD: total / DATA.fx,
    rangeLow: rangeLow,
    rangeHigh: rangeHigh,
    rangeLowUSD: rangeLow / DATA.fx,
    rangeHighUSD: rangeHigh / DATA.fx,
    realizationTotal: realization,
    realizationTotalUSD: realization / DATA.fx,
    area: calc.area,
    factors: factors,
    parking: parking,
    confidence: base.level,
    confidenceMsg: base.msg,
    zoneLabel: base.label,
    envFactor: envFactor,
    descFactor: descFactor,
    photoFactor: photoFactor,
    market: market
  };
}

/* ------------------------------------------------------------------ */
/* Alquiler mensual estimado (mercaod de Urbania/Adondevivir)          */
/* ------------------------------------------------------------------ */

function rentBaseFromPrice(pricePerM2) {
  // Rendimiento bruto mensual por m²: crece con el precio, porque en zonas
  // caras las rentas por m² no escalan 1:1 con el precio de venta.
  const yieldM = clamp(0.0038 + (pricePerM2 - 2500) * 0.00000035, 0.0038, 0.007);
  return pricePerM2 * yieldM;
}

function blendRentMarket(staticRentM2, rentMarket) {
  const median = rentMarket.medianRentPerM2;
  if (median < staticRentM2 * 0.4 || median > staticRentM2 * 2.5) return staticRentM2;
  return 0.7 * median + 0.3 * staticRentM2;
}

function computeRent(location, inputs, rentMarket, envProfile, descAdj) {
  const base = resolveBasePrice(location, null);
  const staticRentM2 = rentBaseFromPrice(base.base);
  const hasMarket = rentMarket && rentMarket.count >= 2 && rentMarket.medianRentPerM2;
  const descFactor = descAdj && descAdj.used && descAdj.factor != null
    ? clamp(descAdj.factor, 0.85, 1.15)
    : 1;

  let rentBaseM2 = staticRentM2;
  if (hasMarket) rentBaseM2 = blendRentMarket(staticRentM2, rentMarket);
  rentBaseM2 = clamp(rentBaseM2, base.base * 0.002, base.base * 0.012);

  const envRaw = envProfile && envProfile.environmentFactor ? envProfile.environmentFactor : 1;
  const envFactor = 1 + (envRaw - 1) * 0.5;
  const refArea = hasMarket && rentMarket.medianArea ? rentMarket.medianArea : null;
  const landRatio = landRatioFor(base.base);

  const type = inputs.type || "departamento";
  let calc;
  if (type === "departamento") calc = calcDepartamento(inputs, envFactor, refArea);
  else if (type === "casa") calc = calcCasa(inputs, envFactor, refArea);
  else if (type === "terreno") calc = calcTerreno(inputs, envFactor, landRatio);
  else calc = calcGeneric(inputs, envFactor, type, refArea);

  // Los ajustes hedónicos pesan menos en alquiler que en venta (suavizados).
  const rentFactor = 1 + (calc.factor - 1) * 0.7;
  const effectiveRentPerM2 = rentBaseM2 * rentFactor;
  const monthly = effectiveRentPerM2 * calc.area * descFactor;
  const rangeLow = monthly * 0.9;
  const rangeHigh = monthly * 1.1;

  return {
    rentBasePerM2: rentBaseM2,
    effectiveRentPerM2: effectiveRentPerM2,
    monthly: monthly,
    monthlyUSD: monthly / DATA.fx,
    rangeLow: rangeLow,
    rangeHigh: rangeHigh,
    rangeLowUSD: rangeLow / DATA.fx,
    rangeHighUSD: rangeHigh / DATA.fx,
    area: calc.area,
    confidence: hasMarket ? "alta" : "media",
    hasMarket: hasMarket,
    count: hasMarket ? rentMarket.count : 0,
    zoneLabel: base.label,
    descFactor: descFactor,
    market: rentMarket
  };
}
