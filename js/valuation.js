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
  premium:  1.08,
  central:  1.03,
  normal:   1.00,
  periferia:0.92
};

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

function resolveBasePrice(location) {
  // location: { district, city, state, lat, lon }
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

    return {
      base: base,
      label: location.district,
      level: "alta",
      msg: "Distrito identificado con exactitud en la base de datos."
    };
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
    const base = psum / wsum;
    return {
      base: base,
      label: "Lima Metropolitana (estimado por cercanía a " + nearest[0].key + ")",
      level: "media",
      msg: "No se identificó el distrito exacto. El precio se interpoló desde los distritos más cercanos."
    };
  }

  // Ciudad reconocida fuera de Lima.
  const cityEntry = getCity(location.city);
  if (cityEntry) {
    return {
      base: cityEntry.price,
      label: location.city,
      level: "baja",
      msg: "Estimación a nivel de ciudad. La variación por zona dentro de la ciudad puede ser amplia."
    };
  }

  return {
    base: NATIONAL_AVG,
    label: "Perú (referencial)",
    level: "referencial",
    msg: "No se pudo identificar la zona. Se usó un valor referencial nacional de S/ " +
      NATIONAL_AVG.toLocaleString("es-PE") + " por m²."
  };
}

function isLimaZone(location) {
  if (!location) return false;
  const state = (location.state || "").toLowerCase();
  const city = (location.city || "").toLowerCase();
  if (state.includes("lima") || city.includes("lima") || state.includes("callao")) return true;
  if (DATA.districts[location.district]) return true;
  return false;
}

function computeValuation(location, inputs) {
  const base = resolveBasePrice(location);
  const area = clamp(inputs.area, 15, 1500);

  const sizeFactor = clamp(Math.pow(70 / area, 0.12), 0.80, 1.12);
  const typeFactor = TYPE_FACTORS[inputs.type] || 1;
  const conditionFactor = CONDITION_FACTORS[inputs.condition] || 1;

  let ageFactor = 1;
  const age = clamp(inputs.age, 0, 60);
  if (!(inputs.estado === "nuevo" || age <= 3)) {
    ageFactor = Math.max(0.70, 1 - (age - 3) * 0.008);
  }

  let floorFactor = 1;
  const floor = clamp(inputs.floor, 0, 40);
  if (inputs.type === "departamento") {
    if (floor <= 0) floorFactor = 0.97;
    else if (floor === 1) floorFactor = 0.96;
    else if (floor >= 10) floorFactor = 1.07;
    else floorFactor = 0.98 + floor * 0.004;
  }

  const zoneFactor = ZONE_FACTORS[inputs.zone] || 1;
  const estadoFactor = inputs.estado === "nuevo" ? 1.04 : 1.0;

  const factors = [
    { key: "base", label: "Precio m² base — " + base.label, factor: 1, pct: null },
    { key: "tipo", label: "Tipo de inmueble (" + inputs.type + ")", factor: typeFactor, pct: (typeFactor - 1) * 100 },
    { key: "tamano", label: "Tamaño (" + area + " m²)", factor: sizeFactor, pct: (sizeFactor - 1) * 100 },
    { key: "edad", label: "Antigüedad (" + age + " años)", factor: ageFactor, pct: (ageFactor - 1) * 100 },
    { key: "condicion", label: "Estado de conservación", factor: conditionFactor, pct: (conditionFactor - 1) * 100 },
    { key: "piso", label: "Piso / planta (" + floor + ")", factor: floorFactor, pct: (floorFactor - 1) * 100 },
    { key: "zona", label: "Zona interna del distrito", factor: zoneFactor, pct: (zoneFactor - 1) * 100 },
    { key: "estado", label: "Nuevo / usado", factor: estadoFactor, pct: (estadoFactor - 1) * 100 }
  ];

  const effectivePerM2 = base.base * sizeFactor * typeFactor * ageFactor *
    conditionFactor * floorFactor * zoneFactor * estadoFactor;

  const total = effectivePerM2 * area;
  const rangeLow = total * 0.92;
  const rangeHigh = total * 1.08;

  return {
    basePerM2: base.base,
    effectivePerM2: effectivePerM2,
    total: total,
    totalUSD: total / DATA.fx,
    rangeLow: rangeLow,
    rangeHigh: rangeHigh,
    rangeLowUSD: rangeLow / DATA.fx,
    rangeHighUSD: rangeHigh / DATA.fx,
    area: area,
    factors: factors,
    confidence: base.level,
    confidenceMsg: base.msg,
    zoneLabel: base.label
  };
}
