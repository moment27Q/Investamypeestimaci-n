(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const els = {
    input: $("addressInput"),
    suggestions: $("suggestions"),
    geoBtn: $("geoBtn"),
    map: $("map"),
    mapStatus: $("mapStatus"),
    zoneLabel: $("zoneLabel"),
    priceMain: $("priceMain"),
    priceUSD: $("priceUSD"),
    priceRange: $("priceRange"),
    perM2: $("perM2"),
    priceCommercial: $("priceCommercial"),
    priceRealization: $("priceRealization"),
    footTotal: $("footTotal"),
    confidence: $("confidence"),
    confTitle: $("confTitle"),
    confMsg: $("confMsg"),
    marketPanel: $("marketPanel"),
    marketBadge: $("marketBadge"),
    marketSub: $("marketSub"),
    marketList: $("marketList"),
    marketMore: $("marketMore"),
    nexoLink: $("nexoLink"),
    rentalPanel: $("rentalPanel"),
    rentalBadge: $("rentalBadge"),
    rentalPrice: $("rentalPrice"),
    rentalUSD: $("rentalUSD"),
    rentalRange: $("rentalRange"),
    rentalPerM2: $("rentalPerM2"),
    rentalSub: $("rentalSub"),
    rentalList: $("rentalList"),
    rentalMore: $("rentalMore"),
    listingModal: $("listingModal"),
    lmSource: $("lmSource"),
    lmBody: $("lmBody"),
    lmClose: $("lmClose"),
    breakdown: $("breakdown"),
    breakdownBody: $("breakdownBody"),
    areaVal: $("areaVal"),
    dormVal: $("dormVal"),
    banoVal: $("banoVal"),
    edadVal: $("edadVal"),
    area: $("area"),
    dorm: $("dorm"),
    bano: $("bano"),
    edad: $("edad"),
    piso: $("piso"),
    condicion: $("condicion"),
    estado: $("estado"),
    zona: $("zona"),
    areaLabel: $("areaLabel"),
    totalFloors: $("totalFloors"),
    elevator: $("elevator"),
    parking: $("parking"),
    storage: $("storage"),
    view: $("view"),
    finishes: $("finishes"),
    amenities: $("amenities"),
    maintenance: $("maintenance"),
    regime: $("regime"),
    terrenoArea: $("terrenoArea"),
    terrenoAreaVal: $("terrenoAreaVal"),
    casaFloors: $("casaFloors"),
    front: $("front"),
    frontVal: $("frontVal"),
    shape: $("shape"),
    topography: $("topography"),
    fence: $("fence"),
    garden: $("garden"),
    gardenVal: $("gardenVal"),
    remodel: $("remodel"),
    remodelVal: $("remodelVal"),
    zoning: $("zoning"),
    services: $("services"),
    corner: $("corner"),
    urbanization: $("urbanization"),
    road: $("road"),
    envPanel: $("envPanel"),
    envBadge: $("envBadge"),
    envSub: $("envSub"),
    envAmenities: $("envAmenities"),
    envServices: $("envServices"),
    envFactorVal: $("envFactorVal"),
    envWhy: $("envWhy"),
    legalPanel: $("legalPanel"),
    legalBtn: $("legalBtn"),
    appraiserBtn: $("appraiserBtn"),
    compareBtn: $("compareBtn"),
    appraiserModal: $("appraiserModal"),
    apBody: $("apBody"),
    apClose: $("apClose"),
    tasarBtn: $("tasarBtn"),
    resultCard: $("resultCard"),
    descripcion: $("descripcion"),
    descNote: $("descNote")
  };

  const state = {
    location: null,
    lastTotal: 0,
    market: null,
    marketFetching: false,
    marketSeq: 0,
    marketRest: [],
    rentMarket: null,
    rentFetching: false,
    rentSeq: 0,
    rentRest: [],
    envProfile: null,
    areaTouched: false,
    zoneTouched: false,
    tasado: false,
    descAdj: null,
    descSeq: 0
  };

  const fmt = (n) => Math.round(n).toLocaleString("es-PE");
  const fmtUSD = (n) =>
    Math.round(n).toLocaleString("es-PE", { maximumFractionDigits: 0 });

  /* ---------------- Mapa ---------------- */
  const map = L.map("map").setView([-12.09, -77.04], 11);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  let marker = null;
  function setMarker(lat, lon) {
    if (!marker) {
      marker = L.marker([lat, lon]).addTo(map);
    } else {
      marker.setLatLng([lat, lon]);
    }
    map.setView([lat, lon], Math.max(map.getZoom(), 14));
  }

  /* ---------------- Autocompletado ---------------- */
  let debounceTimer = null;
  let selectedPlace = null;

  els.input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const q = els.input.value.trim();
    if (q.length < 4) { hideSuggestions(); return; }
    debounceTimer = setTimeout(() => runSearch(q), 350);
  });

  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      clearTimeout(debounceTimer);
      const q = els.input.value.trim();
      if (q.length < 4) return;
      e.preventDefault();
      runSearch(q, true);
    }
  });

  async function runSearch(q, autoSelect) {
    try {
      const places = prioritizePlaces(await GEO.search(q));
      if (els.input.value.trim() !== q) return;
      renderSuggestions(places);
      if (autoSelect && places.length) {
        selectedPlace = places[0];
        els.input.value = GEO.formatAddress(places[0].address, places[0].display_name);
        applyPlace(places[0]);
        hideSuggestions();
      }
    } catch (e) {
      showStatus("No se pudo conectar con el buscador. Reintenta.");
    }
  }

  function renderSuggestions(places) {
    els.suggestions.innerHTML = "";
    if (!places.length) {
      els.suggestions.innerHTML = '<div class="suggestion">Sin resultados. Intenta otra dirección.</div>';
    }
    places.forEach((p, i) => {
      const d = document.createElement("div");
      d.className = "suggestion" + (i === 0 ? " active" : "");
      const name = p.display_name || p.name || "";
      const pretty = GEO.formatAddress(p.address, name);
      d.innerHTML = shortName(pretty) + "<small>" + shortName(name) + "</small>";
      d.addEventListener("click", () => {
        selectedPlace = p;
        els.input.value = pretty;
        applyPlace(p);
        hideSuggestions();
      });
      els.suggestions.appendChild(d);
    });
    els.suggestions.classList.remove("hidden");
  }

  function shortName(name) {
    const parts = name.split(",").slice(0, 3).join(", ");
    return parts.replace(/^(\d+)\s*/g, "").replace(/\.\s*Peru|\.\s*Perú|Peru|Perú/g, "").trim();
  }

  function hideSuggestions() { els.suggestions.classList.add("hidden"); }

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".autocomplete")) hideSuggestions();
  });

  /* ---------------- Aplicar lugar ---------------- */
  function placeLabel(place) {
    const a = place.address || {};
    const pretty = GEO.formatAddress(a, place.display_name);
    const zone = (a.suburb || a.city_district || a.city || a.town || "").toString().replace(/,.*/, "");
    return { pretty: pretty, zone: zone.trim() };
  }

  function applyPlace(place) {
    const loc = placeToLocation(place);
    state.location = loc;
    setMarker(loc.lat, loc.lon);
    els.zona.value = "auto";
    state.zoneTouched = false;
    const { pretty } = placeLabel(place);
    const zone = loc.district || loc.city || "zona detectada";
    els.zoneLabel.textContent = zone + " · " + pretty;
    els.mapStatus.textContent = pretty + " · presiona Tasar para calcular";
    els.mapStatus.classList.remove("hidden");
    resetResults();
  }

  async function applyReverse(lat, lon) {
    try {
      const place = await GEO.reverse(lat, lon);
      const loc = placeToLocation(place);
      state.location = loc;
      setMarker(lat, lon);
      els.zona.value = "auto";
      state.zoneTouched = false;
      const { pretty } = placeLabel(place);
      els.zoneLabel.textContent = (loc.district || loc.city || "zona detectada") + " · " + pretty;
      els.mapStatus.textContent = pretty + " · presiona Tasar para calcular";
      els.mapStatus.classList.remove("hidden");
      resetResults();
    } catch (e) {
      showStatus("No se pudo geocodificar ese punto.");
    }
  }

  /* ---------------- Botón Tasar ---------------- */
  function resetResults() {
    state.tasado = false;
    state.lastTotal = 0;
    state.market = null;
    state.rentMarket = null;
    state.envProfile = null;
    state.descAdj = null;
    state.marketSeq++;
    state.rentSeq++;
    state.descSeq++;
    envSeq++;
    const priceBlock = document.querySelector(".price-block");
    const empty = document.querySelector(".empty-state");
    if (priceBlock) priceBlock.classList.add("hidden");
    if (empty) empty.classList.remove("hidden");
    els.legalPanel.classList.add("hidden");
    els.confidence.classList.add("hidden");
    els.breakdown.classList.add("hidden");
    els.rentalPanel.classList.add("hidden");
    els.marketPanel.classList.add("hidden");
    els.envPanel.classList.add("hidden");
    els.descNote.classList.add("hidden");
  }

  function runValuation() {
    if (!state.location) {
      showStatus("Primero ingresa la ubicación de la propiedad.");
      const firstCard = document.querySelector(".col-main .card");
      if (firstCard) firstCard.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    state.tasado = true;
    recompute();
    fetchMarket();
    fetchRentals();
    fetchEnvironment();
    fetchDescription();
    saveSnapshot();
    if (els.resultCard) els.resultCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  els.tasarBtn.addEventListener("click", runValuation);

  /* Guarda la tasación actual para compararla con proyectos nuevos (proyectos.html) */
  function saveSnapshot() {
    const loc = state.location;
    if (!loc || !state.tasado) return;
    try {
      sessionStorage.setItem("informeSnapshot", JSON.stringify({
        version: 1,
        location: loc,
        inputs: readInputs(),
        market: state.market,
        rentMarket: state.rentMarket,
        envProfile: state.envProfile,
        descAdj: state.descAdj,
        generatedAt: new Date().toISOString()
      }));
    } catch (e) { /* almacenamiento no disponible; se ignora */ }
  }

  map.on("click", (e) => {
    applyReverse(e.latlng.lat, e.latlng.lng);
  });

  els.geoBtn.addEventListener("click", () => {
    if (!navigator.geolocation) { showStatus("Tu navegador no soporta geolocalización."); return; }
    showStatus("Obteniendo tu ubicación…");
    navigator.geolocation.getCurrentPosition(
      (pos) => { applyReverse(pos.coords.latitude, pos.coords.longitude); },
      () => showStatus("No se pudo obtener la ubicación. Permite el acceso o escribe la dirección.")
    );
  });

  function showStatus(msg) {
    els.mapStatus.textContent = msg;
    els.mapStatus.classList.remove("hidden");
    setTimeout(() => els.mapStatus.classList.add("hidden"), 4000);
  }

  /* ---------------- Ejemplos ---------------- */
  document.querySelectorAll(".chip").forEach((b) => {
    b.addEventListener("click", () => {
      els.input.value = b.dataset.ex;
      runSearch(b.dataset.ex, true);
    });
  });

  /* ---------------- Controles ---------------- */
  document.querySelectorAll(".type-btn").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".type-btn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      renderFields();
      if (state.tasado) {
        recompute();
        fetchMarket();
        fetchRentals();
        fetchEnvironment();
      }
    });
  });

  function renderFields() {
    const type = document.querySelector(".type-btn.active").dataset.type;
    document.querySelectorAll("[data-types]").forEach((el) => {
      el.classList.toggle("hidden", !el.dataset.types.split(" ").includes(type));
    });
    els.area.min = type === "terreno" ? 80 : 30;
    els.area.max = type === "terreno" ? 10000 : 400;
    els.areaLabel.textContent = type === "terreno" ? "Área del terreno" : "Área construida";
    if (!state.areaTouched) {
      const med = type === "terreno" ? 180 : 90;
      els.area.value = med;
      setVal(els.areaVal, med, (v) => v + " m²");
    }
  }

  function setVal(el, raw, fmt) {
    if (!el) return;
    if (el.tagName === "INPUT") {
      el.value = Math.round(Number(raw) || 0);
    } else {
      el.textContent = fmt ? fmt(raw) : raw;
    }
  }

  function readAreaValue() {
    if (els.areaVal && els.areaVal.tagName === "INPUT") {
      const v = parseFloat(els.areaVal.value);
      if (!isNaN(v) && v > 0) return v;
    }
    return parseFloat(els.area.value) || 70;
  }

  const RANGES = [
    ["area", "areaVal", (v) => v + " m²"],
    ["dorm", "dormVal", (v) => v],
    ["bano", "banoVal", (v) => v],
    ["edad", "edadVal", (v) => v + " años"],
    ["terrenoArea", "terrenoAreaVal", (v) => v + " m²"],
    ["front", "frontVal", (v) => v + " m"],
    ["garden", "gardenVal", (v) => v + " m²"],
    ["remodel", "remodelVal", (v) => v + " años"]
  ];
  RANGES.forEach(([inp, val, fmt]) => {
    const range = els[inp];
    range.addEventListener("input", () => {
      if (inp === "area") state.areaTouched = true;
      setVal(els[val], range.value, fmt);
      recompute();
    });
  });

  [["areaVal", "area", "area"], ["terrenoAreaVal", "terrenoArea", null]].forEach(([num, range, touchedKey]) => {
    const numEl = els[num];
    const rangeEl = els[range];
    if (!numEl || !rangeEl) return;
    numEl.addEventListener("input", () => {
      let v = parseFloat(numEl.value);
      if (isNaN(v)) return;
      v = Math.max(10, Math.min(50000, v));
      const sMin = parseFloat(rangeEl.min);
      const sMax = parseFloat(rangeEl.max);
      rangeEl.value = v < sMin ? sMin : v > sMax ? sMax : v;
      if (touchedKey === "area") state.areaTouched = true;
      recompute();
    });
  });

  [els.piso, els.condicion, els.estado, els.zona,
    els.totalFloors, els.elevator, els.parking, els.storage, els.view,
    els.finishes, els.amenities, els.maintenance, els.regime, els.casaFloors,
    els.shape, els.topography, els.fence, els.zoning, els.services,
    els.corner, els.urbanization, els.road
  ].forEach((el) => {
    el.addEventListener("input", recompute);
    el.addEventListener("change", recompute);
  });

  els.zona.addEventListener("change", () => {
    state.zoneTouched = true;
  });

  els.lmClose.addEventListener("click", closeListingModal);
  els.listingModal.addEventListener("click", (e) => {
    if (e.target === els.listingModal) closeListingModal();
  });
  els.lmBody.addEventListener("click", (e) => {
    const t = e.target.closest(".lm-thumbs img");
    if (!t) return;
    const main = els.lmBody.querySelector(".lm-main");
    if (main) main.src = t.src;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.listingModal.classList.contains("hidden")) closeListingModal();
  });

  function goNexoPage() {
    const loc = state.location;
    const params = new URLSearchParams();
    if (loc) {
      params.set("district", loc.district || "");
      params.set("city", loc.city || "");
    }
    location.href = "proyectos.html" + (params.toString() ? "?" + params.toString() : "");
  }

  els.nexoLink.addEventListener("click", (e) => {
    e.preventDefault();
    goNexoPage();
  });

  /* ---------------- Informe de tasación legal ---------------- */
  function openLegalReport() {
    if (!state.location) return;
    saveSnapshot();
    window.location.href = "informe.html";
  }

  els.legalBtn.addEventListener("click", openLegalReport);

  /* ---------------- Comparar con proyectos nuevos ---------------- */
  els.compareBtn.addEventListener("click", (e) => {
    e.preventDefault();
    saveSnapshot();
    goNexoPage();
  });

  /* ---------------- Tasador profesional (planes de servicio) ---------------- */
  const APPRAISER_WHATSAPP = "51999000301";

  const APPRAISER_PLANS = [
    {
      key: "rnt",
      name: "Informe RNT completo",
      price: 450,
      badge: "Virtual",
      time: "Entrega 5 días hábiles",
      desc: "Inspección virtual + informe formal según D.S. N° 013-2002-VIVIENDA, firmado por tasador colegiado. Válido para trámites y referencia bancaria.",
      extra: ["Informe RNT completo y firmado", "Fotografías y croquis de ubicación", "Válido para bancos y notarías"]
    },
    {
      key: "visita",
      name: "Tasación con visita",
      price: 890,
      badge: "Más pedido",
      time: "Entrega 4 días hábiles",
      desc: "Visita técnica del tasador al inmueble, medición real y verificación de acabados. Informe RNT + certificado de tasación.",
      extra: ["Visita técnica al inmueble", "Medición y verificación de acabados", "Informe RNT + certificado de tasación"]
    },
    {
      key: "urgente",
      name: "Tasación urgente",
      price: 1290,
      badge: "24–48 h",
      time: "Entrega 24–48 horas",
      desc: "Prioridad total para casos con plazo: venta, herencia, división y partición o trámite notarial. Todo incluido, con soporte hasta la entrega.",
      extra: ["Todo lo del plan Visita", "Prioridad 24–48 h", "Soporte y consultas hasta la entrega"]
    }
  ];

  function appraiserPlanCard(p) {
    return (
      '<div class="ap-card" data-plan="' + esc(p.key) + '">' +
        '<div class="ap-badge">' + esc(p.badge) + '</div>' +
        '<h4>' + esc(p.name) + '</h4>' +
        '<div class="ap-price">S/ ' + p.price.toLocaleString("es-PE") + '</div>' +
        '<p>' + esc(p.desc) + '</p>' +
        '<ul>' + p.extra.map((x) => "<li>" + esc(x) + "</li>").join("") + '</ul>' +
        '<div class="ap-time">' + esc(p.time) + '</div>' +
        '<button type="button" class="ap-select" data-plan="' + esc(p.key) + '">Solicitar este plan</button>' +
      '</div>'
    );
  }

  function openAppraiserPlan() {
    const loc = state.location;
    const addr = (loc && (loc.display || loc.address)) ? esc(loc.display || loc.address) : "";
    const snap = addr
      ? '<div class="ap-snap"><b>📋 Tu inmueble a tasar</b><span>' + addr + "</span>" +
        (state.lastTotal ? "<span>Valor referencial estimado: S/ " + fmt(state.lastTotal) + "</span>" : "") +
        "</div>"
      : "";
    els.apBody.innerHTML =
      '<p class="ap-intro">Tasadores colegiados con experiencia en valorizaciones para bancos, notarías, herencias y trámites legales.</p>' +
      '<div class="ap-plans">' + APPRAISER_PLANS.map(appraiserPlanCard).join("") + "</div>" +
      snap +
      '<form id="apForm" class="ap-form">' +
        "<h4>Solicitar tasación profesional</h4>" +
        '<label>Nombre completo<input type="text" id="apName" placeholder="Ej. Juan Pérez" required></label>' +
        '<label>Celular / WhatsApp<input type="tel" id="apPhone" placeholder="Ej. 999 888 777" required></label>' +
        '<label>Departamento / provincia<input type="text" id="apCity" placeholder="Ej. Lima" value="Lima"></label>' +
        '<label>Dirección del inmueble<input type="text" id="apAddress" placeholder="Ej. Av. Larco 1234, Miraflores" value="' + addr + '"></label>' +
        '<label>Plan elegido<select id="apPlan">' +
          APPRAISER_PLANS.map((p) => '<option value="' + esc(p.key) + '">' + esc(p.name) + " — S/ " + p.price.toLocaleString("es-PE") + "</option>").join("") +
        "</select></label>" +
        '<button type="submit" class="ap-submit">Enviar solicitud por WhatsApp</button>' +
        '<p class="ap-note">Al enviar se abre WhatsApp con tu solicitud armada; un tasador te confirmará el costo y la fecha de la visita.</p>' +
      "</form>";
    selectAppraiserPlan(APPRAISER_PLANS[0].key);
    els.appraiserModal.classList.remove("hidden");
    document.body.classList.add("no-scroll");
  }

  function selectAppraiserPlan(key) {
    const cards = els.apBody.querySelectorAll(".ap-card");
    cards.forEach((c) => c.classList.toggle("ap-active", c.dataset.plan === key));
    const sel = els.apBody.querySelector("#apPlan");
    if (sel) sel.value = key;
  }

  function closeAppraiserPlan() {
    els.appraiserModal.classList.add("hidden");
    document.body.classList.remove("no-scroll");
  }

  els.appraiserBtn.addEventListener("click", openAppraiserPlan);
  els.apClose.addEventListener("click", closeAppraiserPlan);
  els.appraiserModal.addEventListener("click", (e) => {
    if (e.target === els.appraiserModal) closeAppraiserPlan();
  });
  els.apBody.addEventListener("click", (e) => {
    const t = e.target.closest(".ap-card, .ap-select");
    if (t) selectAppraiserPlan(t.dataset.plan);
  });
  els.apBody.addEventListener("change", (e) => {
    if (e.target.id === "apPlan") selectAppraiserPlan(e.target.value);
  });
  els.apBody.addEventListener("submit", (e) => {
    if (e.target.id !== "apForm") return;
    e.preventDefault();
    const val = (id) => (els.apBody.querySelector(id) || {}).value || "";
    const key = val("#apPlan");
    const plan = APPRAISER_PLANS.find((p) => p.key === key) || APPRAISER_PLANS[0];
    const msg =
      "Hola, quiero solicitar una tasación profesional.\n\n" +
      "· Plan: " + plan.name + " (S/ " + plan.price + ")\n" +
      "· Nombre: " + val("#apName") + "\n" +
      "· Celular: " + val("#apPhone") + "\n" +
      "· Departamento: " + val("#apCity") + "\n" +
      "· Dirección: " + val("#apAddress") + "\n" +
      (state.lastTotal ? "· Valor referencial del tasador: S/ " + fmt(state.lastTotal) + "\n" : "") +
      "\nPor favor confírmenme el costo final y la fecha de atención. Gracias.";
    window.open("https://wa.me/" + APPRAISER_WHATSAPP + "?text=" + encodeURIComponent(msg), "_blank");
    showStatus("Solicitud lista: se abrió WhatsApp para enviar tu mensaje al tasador.");
    closeAppraiserPlan();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.appraiserModal.classList.contains("hidden")) closeAppraiserPlan();
  });

  function readInputs() {
    const active = document.querySelector(".type-btn.active");
    const type = active ? active.dataset.type : "departamento";
    return {
      type,
      area: readAreaValue(),
      bedrooms: parseInt(els.dorm.value) || 2,
      bathrooms: parseInt(els.bano.value) || 2,
      age: parseInt(els.edad.value) || 10,
      floor: parseInt(els.piso.value) || 3,
      condition: els.condicion.value,
      estado: els.estado.value,
      zone: els.zona.value,
      totalFloors: parseInt(els.totalFloors.value) || null,
      elevator: els.elevator.value,
      parking: els.parking.value,
      storage: els.storage.value,
      view: els.view.value,
      finishes: els.finishes.value,
      amenities: els.amenities.value,
      maintenance: els.maintenance.value,
      regime: els.regime.value,
      terrenoArea: (els.terrenoAreaVal && els.terrenoAreaVal.tagName === "INPUT")
        ? (parseFloat(els.terrenoAreaVal.value) || null)
        : (parseFloat(els.terrenoArea.value) || null),
      casaFloors: parseInt(els.casaFloors.value) || null,
      front: parseFloat(els.front.value) || null,
      shape: els.shape.value,
      topography: els.topography.value,
      fence: els.fence.value,
      garden: parseFloat(els.garden.value) || null,
      remodel: parseInt(els.remodel.value) || null,
      zoning: els.zoning.value,
      services: els.services.value,
      corner: els.corner.value,
      urbanization: els.urbanization.value,
      road: els.road.value
    };
  }

  /* ---------------- Cálculo ---------------- */
  function recompute() {
    if (!state.tasado || !state.location) return;
    const inputs = readInputs();
    const r = computeValuation(state.location, inputs, state.market, state.envProfile, state.descAdj);

    const priceBlock = document.querySelector(".price-block");
    const empty = document.querySelector(".empty-state");
    priceBlock.classList.remove("hidden");
    empty.classList.add("hidden");
    els.legalPanel.classList.remove("hidden");

    animatePrice(r.total);

    els.priceUSD.textContent = "≈ USD " + fmtUSD(r.totalUSD) +
      " · $" + fmtUSD(r.rangeLowUSD) + " – $" + fmtUSD(r.rangeHighUSD);
    els.priceCommercial.textContent = "S/ " + fmt(r.total);
    els.priceRealization.textContent = "S/ " + fmt(r.realizationTotal) +
      " · ≈ USD " + fmtUSD(r.realizationTotalUSD);
    els.priceRange.textContent = "Rango probable: S/ " + fmt(r.rangeLow) +
      " — S/ " + fmt(r.rangeHigh);
    els.perM2.textContent = "Precio m² efectivo: S/ " + fmt(r.effectivePerM2);
    els.zoneLabel.textContent = r.zoneLabel;
    els.footTotal.textContent = "S/ " + fmt(r.total);

    // Confianza
    els.confidence.classList.remove("hidden");
    const confMap = {
      alta:   { cls: "",        t: "Confianza alta" },
      media:  { cls: "media",   t: "Confianza media" },
      baja:   { cls: "baja",    t: "Confianza baja" },
      referencial: { cls: "referencial", t: "Valor referencial" }
    };
    const cf = confMap[r.confidence] || confMap.referencial;
    els.confidence.className = "confidence " + cf.cls;
    els.confTitle.textContent = cf.t;
    els.confMsg.textContent = r.confidenceMsg;

    // Desglose
    els.breakdown.classList.remove("hidden");
    els.breakdownBody.innerHTML = "";
    r.factors.forEach((f) => {
      const tr = document.createElement("tr");
      const td1 = document.createElement("td");
      td1.textContent = f.label;
      const td2 = document.createElement("td");
      if (f.pct === null) {
        td2.textContent = "S/ " + fmt(r.basePerM2);
      } else {
        const s = f.pct > 0 ? "+" : "";
        td2.innerHTML = "×" + f.factor.toFixed(2) +
          ' <span class="factor-pct">(' + s + f.pct.toFixed(1) + "%)</span>";
      }
      tr.appendChild(td1);
      tr.appendChild(td2);
      els.breakdownBody.appendChild(tr);
    });

    // Alquiler mensual estimado
    const rent = computeRent(state.location, inputs, state.rentMarket, state.envProfile, state.descAdj);
    els.rentalPanel.classList.remove("hidden");
    els.rentalPrice.textContent = "S/ " + fmt(rent.monthly);
    els.rentalUSD.textContent = "≈ USD " + fmtUSD(rent.monthlyUSD);
    els.rentalRange.textContent = "Rango probable: S/ " + fmt(rent.rangeLow) + " — S/ " + fmt(rent.rangeHigh);
    els.rentalPerM2.textContent = "≈ S/ " + fmt(rent.effectiveRentPerM2) + "/m²/mes";
    if (!rent.hasMarket && !state.rentFetching && !els.rentalBadge.classList.contains("loading")) {
      els.rentalBadge.textContent = "Base estática";
      els.rentalBadge.className = "rental-badge empty";
    }

    // Nota de la IA por descripción (solo si aportó un ajuste)
    if (state.descAdj && state.descAdj.used) {
      const pct = (state.descAdj.factor - 1) * 100;
      const sign = pct > 0 ? "+" : "";
      els.descNote.classList.remove("hidden");
      els.descNote.innerHTML =
        "<b>IA</b> leyó tu descripción y ajustó el valor " + sign + pct.toFixed(1) + "%: " +
        esc(state.descAdj.rationale || state.descAdj.summary || "");
    } else {
      els.descNote.classList.add("hidden");
    }
    saveSnapshot();
  }

  /* ---------------- Precios de mercado (comparables reales) ---------------- */
  async function fetchMarket() {
    const loc = state.location;
    if (!loc || (!loc.district && !loc.city)) return;
    const type = readInputs().type;

    const seq = ++state.marketSeq;
    state.marketFetching = true;
    els.marketPanel.classList.remove("hidden");
    closeListingModal();
    els.marketBadge.textContent = "Buscando…";
    els.marketBadge.className = "market-badge loading";
    els.marketSub.textContent = "Revisando avisos reales de Adondevivir, Urbania y Remax en " +
      (loc.district || loc.city) + "… esto puede tardar 20–60 s.";

    try {
      const params = new URLSearchParams({
        district: loc.district || "",
        city: loc.city || "",
        type: type
      });
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 120000);
      let res;
      try {
        res = await fetch("/api/comparables?" + params.toString(), { signal: ctrl.signal });
      } finally {
        clearTimeout(timer);
      }
      const data = await res.json().catch(() => ({}));
      if (seq !== state.marketSeq || !state.location) return;

      if (!res.ok || data.error) {
        state.market = null;
        const detail = data.detail || data.error || ("HTTP " + res.status);
        els.marketBadge.textContent = "Sin datos";
        els.marketBadge.className = "market-badge empty";
        els.marketSub.textContent = "No se pudieron obtener avisos: " + detail + ". Se usa la base estática.";
        els.marketList.innerHTML = "";
        state.marketRest = [];
        els.marketMore.classList.add("hidden");
        recompute();
        return;
      }

      state.market = data;
      renderMarket(data, type);

      if (!state.areaTouched && data.count >= 2 && data.medianArea) {
        const autoArea = Math.round(clampVal(data.medianArea, 25, 400));
        els.area.value = autoArea;
        setVal(els.areaVal, autoArea, (v) => v + " m²");
      }
      recompute();
    } catch (e) {
      if (seq !== state.marketSeq) return;
      state.market = null;
      els.marketBadge.textContent = "Sin datos";
      els.marketBadge.className = "market-badge empty";
      els.marketSub.textContent = "El servidor no respondió a tiempo; se usa la base de datos estática.";
      els.marketList.innerHTML = "";
      state.marketRest = [];
      els.marketMore.classList.add("hidden");
      recompute();
    } finally {
      if (seq === state.marketSeq) state.marketFetching = false;
    }
  }

  function clampVal(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function renderMarket(data, type) {
    if (data.count >= 3) {
      els.marketBadge.textContent = data.count + " avisos";
      els.marketBadge.className = "market-badge";
    } else if (data.count > 0) {
      els.marketBadge.textContent = "Solo " + data.count + " avisos";
      els.marketBadge.className = "market-badge empty";
    } else {
      els.marketBadge.textContent = "0 avisos";
      els.marketBadge.className = "market-badge empty";
    }

    const srcs = data.sources.length ? data.sources.join(" y ") : "—";
    els.marketSub.textContent = data.count
      ? "Mediana de mercado: S/ " + fmt(data.medianPerM2) + "/m² (" +
        (data.minPerM2 != null ? "S/ " + fmt(data.minPerM2) : "—") + " a S/ " +
        fmt(data.maxPerM2) + "/m²). Fuentes: " + srcs + "."
      : "No se encontraron avisos de " + type + "s en la zona. Se usa la base estática.";

    els.marketList.innerHTML = "";
    const items = data.listings.map((l) => {
      const li = document.createElement("li");
      li.className = "market-item";
      const meta = [];
      if (l.area) meta.push(l.area + " m²");
      if (l.bedrooms != null) meta.push(l.bedrooms + " dorm.");
      if (l.bathrooms != null) meta.push(l.bathrooms + " baños");
      if (l.title) meta.push(l.title);
      const p = document.createElement("div");
      p.className = "m-price";
      p.innerHTML = "S/ " + fmt(l.price) + " <small>" + meta.join(" · ") + "</small>";
      const m = document.createElement("div");
      m.className = "m-m2";
      m.textContent = "S/ " + fmt(l.pricePerM2) + "/m²";
      const tag = document.createElement("span");
      tag.className = "m-tag";
      tag.textContent = l.source;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "m-tasar";
      btn.textContent = "Tasar";
      btn.addEventListener("click", () => openListingValuation(l));
      li.appendChild(p);
      li.appendChild(m);
      li.appendChild(tag);
      li.appendChild(btn);
      return li;
    });
    const showMore = items.length > 2;
    els.marketMore.classList.toggle("hidden", !showMore);
    if (showMore) els.marketMore.textContent = "Ver más avisos (" + items.length + ")";
    items.slice(0, 2).forEach((li) => els.marketList.appendChild(li));
    state.marketRest = showMore ? items.slice(2) : [];
  }

  els.marketMore.addEventListener("click", () => {
    (state.marketRest || []).forEach((li) => els.marketList.appendChild(li));
    state.marketRest = [];
    els.marketMore.classList.add("hidden");
  });

  /* ---------------- Alquiler mensual (mercado Urbania/Adondevivir) ---------------- */
  async function fetchRentals() {
    const loc = state.location;
    if (!loc || (!loc.district && !loc.city)) return;
    const type = readInputs().type;

    const seq = ++state.rentSeq;
    state.rentFetching = true;
    state.rentMarket = null;
    els.rentalPanel.classList.remove("hidden");
    els.rentalBadge.textContent = "Buscando…";
    els.rentalBadge.className = "rental-badge loading";
    els.rentalSub.textContent = "Revisando avisos de alquiler de Urbania y Adondevivir en " +
      (loc.district || loc.city) + "… esto puede tardar 20–60 s.";

    try {
      const params = new URLSearchParams({
        district: loc.district || "",
        city: loc.city || "",
        type: type
      });
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 120000);
      let res;
      try {
        res = await fetch("/api/rentals?" + params.toString(), { signal: ctrl.signal });
      } finally {
        clearTimeout(timer);
      }
      const data = await res.json().catch(() => ({}));
      if (seq !== state.rentSeq || !state.location) return;

      if (!res.ok || data.error) {
        state.rentMarket = null;
        const detail = data.detail || data.error || ("HTTP " + res.status);
        els.rentalBadge.textContent = "Sin datos";
        els.rentalBadge.className = "rental-badge empty";
        els.rentalSub.textContent = "No se pudieron obtener avisos de alquiler: " + detail + ". El estimado usa la base estática.";
        els.rentalList.innerHTML = "";
        state.rentRest = [];
        els.rentalMore.classList.add("hidden");
        recompute();
        return;
      }

      state.rentMarket = data;
      renderRentals(data, type);
      recompute();
    } catch (e) {
      if (seq !== state.rentSeq) return;
      state.rentMarket = null;
      els.rentalBadge.textContent = "Sin datos";
      els.rentalBadge.className = "rental-badge empty";
      els.rentalSub.textContent = "El servidor no respondió a tiempo; el estimado usa la base estática.";
      els.rentalList.innerHTML = "";
      state.rentRest = [];
      els.rentalMore.classList.add("hidden");
      recompute();
    } finally {
      if (seq === state.rentSeq) state.rentFetching = false;
    }
  }

  function renderRentals(data, type) {
    if (data.count >= 3) {
      els.rentalBadge.textContent = data.count + " avisos";
      els.rentalBadge.className = "rental-badge";
    } else if (data.count > 0) {
      els.rentalBadge.textContent = "Solo " + data.count + " avisos";
      els.rentalBadge.className = "rental-badge empty";
    } else {
      els.rentalBadge.textContent = "0 avisos";
      els.rentalBadge.className = "rental-badge empty";
    }

    const srcs = data.sources.length ? data.sources.join(" y ") : "—";
    els.rentalSub.textContent = data.count
      ? "Mediana de alquiler: S/ " + fmt(data.medianRent) + "/mes (≈ S/ " +
        fmt(data.medianRentPerM2) + "/m²/mes, de S/ " + fmt(data.minRentPerM2) +
        " a S/ " + fmt(data.maxRentPerM2) + "/m²). Fuentes: " + srcs + "."
      : "No se encontraron avisos de alquiler de " + type + "s en la zona. Se usa la base estática.";

    els.rentalList.innerHTML = "";
    const items = data.listings.map((l) => {
      const li = document.createElement("li");
      li.className = "market-item";
      const meta = [];
      if (l.area) meta.push(l.area + " m²");
      if (l.bedrooms != null) meta.push(l.bedrooms + " dorm.");
      if (l.bathrooms != null) meta.push(l.bathrooms + " baños");
      if (l.title) meta.push(l.title);
      const p = document.createElement("div");
      p.className = "m-price";
      p.innerHTML = "S/ " + fmt(l.rent) + " <small>" + meta.join(" · ") + "</small>";
      const m = document.createElement("div");
      m.className = "m-m2";
      m.textContent = "S/ " + fmt(l.rentPerM2) + "/m²";
      const tag = document.createElement("span");
      tag.className = "m-tag";
      tag.textContent = l.source;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "m-tasar";
      btn.textContent = "Estimar";
      btn.addEventListener("click", () => openListingRent(l));
      li.appendChild(p);
      li.appendChild(m);
      li.appendChild(tag);
      li.appendChild(btn);
      return li;
    });
    const showMore = items.length > 2;
    els.rentalMore.classList.toggle("hidden", !showMore);
    if (showMore) els.rentalMore.textContent = "Ver más avisos (" + items.length + ")";
    items.slice(0, 2).forEach((li) => els.rentalList.appendChild(li));
    state.rentRest = showMore ? items.slice(2) : [];
  }

  els.rentalMore.addEventListener("click", () => {
    (state.rentRest || []).forEach((li) => els.rentalList.appendChild(li));
    state.rentRest = [];
    els.rentalMore.classList.add("hidden");
  });


  /* ---------------- Modal de publicación de alquiler ---------------- */
  function openListingRent(l) {
    els.listingModal.classList.remove("hidden");
    document.body.classList.add("no-scroll");
    els.lmSource.textContent = l.source + " · publicación de alquiler";
    renderRentModal(l, null);
    if (!state.location) return;
    const current = readInputs();
    const inputs = {
      ...current,
      area: l.area || current.area,
      bedrooms: l.bedrooms != null ? l.bedrooms : current.bedrooms,
      bathrooms: l.bathrooms != null ? l.bathrooms : current.bathrooms
    };
    const r = computeRent(state.location, inputs, state.rentMarket, state.envProfile, state.descAdj);
    renderRentModal(l, r);

    if (l.url) {
      fetch("/api/listing-detail?url=" + encodeURIComponent(l.url))
        .then((res) => res.json())
        .then((d) => {
          if (els.listingModal.classList.contains("hidden")) return;
          renderRentModal(l, r, d);
        })
        .catch(() => {});
    }
  }

  function renderRentModal(l, r, detail) {
    const meta = [];
    if (l.area) meta.push(l.area + " m²");
    if (l.bedrooms != null) meta.push(l.bedrooms + " dorm.");
    if (l.bathrooms != null) meta.push(l.bathrooms + " baños");
    if (l.title) meta.push(l.title);

    const images = detail ? detail.images : l.image ? [l.image] : [];
    const gal = images.length
      ? '<div class="lm-gallery"><img class="lm-main" src="' + esc(images[0]) +
        '" alt="Publicación" onerror="this.closest(\'.lm-gallery\').style.display=\'none\'">' +
        (images.length > 1
          ? '<div class="lm-thumbs">' + images.slice(1, 6).map((s) =>
              '<img src="' + esc(s) + '" alt="Foto" loading="lazy" onerror="this.style.display=\'none\'">'
            ).join("") + "</div>"
          : "") +
        "</div>"
      : '<div class="lm-gallery lm-placeholder">Sin imágenes disponibles</div>';

    const priceBlock = r
      ? '<div class="lm-prices">' +
          '<div class="lm-ask"><span class="lm-k">Renta pedida (portal)</span>' +
          '<span class="lm-ask-v">S/ ' + fmt(l.rent) + '</span>' +
          '<span class="lm-ask-m2">S/ ' + fmt(l.rentPerM2) + '/m²/mes</span></div>' +
          '<div class="lm-est"><span class="lm-k">Alquiler estimado (IA)</span>' +
          '<span class="lm-est-v">S/ ' + fmt(r.monthly) + '</span>' +
          '<span class="lm-est-m2">≈ USD ' + fmtUSD(r.monthlyUSD) + ' · rango S/ ' +
          fmt(r.rangeLow) + ' – S/ ' + fmt(r.rangeHigh) + '</span></div>' +
        "</div>" +
        rentDeltaHtml(l, r)
      : '<div class="lm-prices"><div class="lm-ask"><span class="lm-k">Renta pedida (portal)</span>' +
        '<span class="lm-ask-v">S/ ' + fmt(l.rent) + '</span></div></div>';

    const detailHtml =
      detail && detail.description
        ? '<p class="lm-desc">' + esc(detail.description) + "</p>"
        : "";

    const openBtn = l.url
      ? '<a class="lm-open" href="' + esc(l.url) + '" target="_blank" rel="noopener">Ver publicación original ↗</a>'
      : "";

    els.lmBody.innerHTML =
      '<div class="lm-grid">' +
        '<div class="lm-media">' + gal + openBtn + "</div>" +
        '<div class="lm-info">' +
          '<h4>' + esc(meta.join(" · ")) + "</h4>" +
          priceBlock +
          detailHtml +
        "</div>" +
      "</div>";
  }

  function rentDeltaHtml(l, r) {
    const diffPct = (l.rent / r.monthly - 1) * 100;
    if (diffPct > 5) {
      return '<p class="lm-delta warn">La renta pedida está ' + Math.round(diffPct) +
        "% por encima del alquiler estimado.</p>";
    }
    if (diffPct < -5) {
      return '<p class="lm-delta good">La renta pedida está ' + Math.abs(Math.round(diffPct)) +
        "% por debajo del alquiler estimado. Posible oportunidad.</p>";
    }
    return '<p class="lm-delta">La renta pedida está alineada con el alquiler estimado.</p>';
  }

  /* ---------------- Modal de publicación y tasación ---------------- */
  function closeListingModal() {
    els.listingModal.classList.add("hidden");
    document.body.classList.remove("no-scroll");
  }

  function openListingValuation(l) {
    els.listingModal.classList.remove("hidden");
    document.body.classList.add("no-scroll");
    els.lmSource.textContent = l.source + " · publicación del aviso";
    renderListingModal(l, null);
    if (!state.location) return;
    const current = readInputs();
    const inputs = {
      ...current,
      area: l.area || current.area,
      bedrooms: l.bedrooms != null ? l.bedrooms : current.bedrooms,
      bathrooms: l.bathrooms != null ? l.bathrooms : current.bathrooms
    };
    const r = computeValuation(state.location, inputs, state.market, state.envProfile, state.descAdj);
    renderListingModal(l, r);

    if (l.url) {
      fetch("/api/listing-detail?url=" + encodeURIComponent(l.url))
        .then((res) => res.json())
        .then((d) => {
          if (els.listingModal.classList.contains("hidden")) return;
          renderListingModal(l, r, d);
        })
        .catch(() => {});
    }
  }

  function renderListingModal(l, r, detail) {
    const meta = [];
    if (l.area) meta.push(l.area + " m²");
    if (l.bedrooms != null) meta.push(l.bedrooms + " dorm.");
    if (l.bathrooms != null) meta.push(l.bathrooms + " baños");
    if (l.title) meta.push(l.title);

    const images = detail ? detail.images : l.image ? [l.image] : [];
    const gal = images.length
      ? '<div class="lm-gallery"><img class="lm-main" src="' + esc(images[0]) +
        '" alt="Publicación" onerror="this.closest(\'.lm-gallery\').style.display=\'none\'">' +
        (images.length > 1
          ? '<div class="lm-thumbs">' + images.slice(1, 6).map((s) =>
              '<img src="' + esc(s) + '" alt="Foto" loading="lazy" onerror="this.style.display=\'none\'">'
            ).join("") + "</div>"
          : "") +
        "</div>"
      : '<div class="lm-gallery lm-placeholder">Sin imágenes disponibles</div>';

    const priceBlock = r
      ? '<div class="lm-prices">' +
          '<div class="lm-ask"><span class="lm-k">Precio pedido (portal)</span>' +
          '<span class="lm-ask-v">S/ ' + fmt(l.price) + '</span>' +
          '<span class="lm-ask-m2">S/ ' + fmt(l.pricePerM2) + '/m²</span></div>' +
          '<div class="lm-est"><span class="lm-k">Tasación estimada (IA)</span>' +
          '<span class="lm-est-v">S/ ' + fmt(r.total) + '</span>' +
          '<span class="lm-est-m2">≈ USD ' + fmtUSD(r.totalUSD) + ' · rango S/ ' +
          fmt(r.rangeLow) + ' – S/ ' + fmt(r.rangeHigh) + '</span>' +
          '<span class="lm-real">Valor de realización: S/ ' + fmt(r.realizationTotal) +
          ' · ≈ USD ' + fmtUSD(r.realizationTotalUSD) + '</span></div>' +
        "</div>" +
        deltaHtml(l, r) +
        whyHtml(r)
      : '<div class="lm-prices"><div class="lm-ask"><span class="lm-k">Precio pedido (portal)</span>' +
        '<span class="lm-ask-v">S/ ' + fmt(l.price) + '</span></div></div>';

    const detailHtml =
      detail && detail.description
        ? '<p class="lm-desc">' + esc(detail.description) + "</p>"
        : "";

    const openBtn = l.url
      ? '<a class="lm-open" href="' + esc(l.url) + '" target="_blank" rel="noopener">Ver publicación original ↗</a>'
      : "";

    els.lmBody.innerHTML =
      '<div class="lm-grid">' +
        '<div class="lm-media">' + gal + openBtn + "</div>" +
        '<div class="lm-info">' +
          '<h4>' + esc(meta.join(" · ")) + "</h4>" +
          priceBlock +
          detailHtml +
        "</div>" +
      "</div>";
  }

  function deltaHtml(l, r) {
    const diffPct = (l.price / r.total - 1) * 100;
    if (diffPct > 5) {
      return '<p class="lm-delta warn">El precio pedido está ' + Math.round(diffPct) +
        "% por encima de la tasación. Los portales suelen incluir comisiones y margen de negociación.</p>";
    }
    if (diffPct < -5) {
      return '<p class="lm-delta good">El aviso está ' + Math.abs(Math.round(diffPct)) +
        "% por debajo de la tasación estimada. Posible oportunidad.</p>";
    }
    return '<p class="lm-delta">El precio pedido está alineado con la tasación estimada.</p>';
  }

  function whyHtml(r) {
    const env = state.envProfile;
    const envNote = env && env.rationale ? esc(env.rationale) : "";
    const factor = r.factors[0];
    const mktNote = "Tasación referencial: S/ " + fmt(r.effectivePerM2) + "/m² × " + r.area +
      " m² · " + (factor ? factor.label : "") + " · factor de entorno ×" + r.envFactor.toFixed(2) + ".";
    return '<div class="lm-why"><strong>Por qué</strong>' +
      (envNote ? "<p>" + envNote + "</p>" : "") +
      "<p>" + mktNote + "</p></div>";
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ---------------- Animación del precio ---------------- */
  function animatePrice(target) {
    const from = state.lastTotal;
    const start = performance.now();
    const dur = 450;
    function tick(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = from + (target - from) * eased;
      els.priceMain.textContent = "S/ " + fmt(val);
      if (t < 1) requestAnimationFrame(tick);
      else state.lastTotal = target;
    }
    requestAnimationFrame(tick);
  }

  /* ---------------- Entorno socioeconómico (IA) ---------------- */
  let envSeq = 0;
  async function fetchEnvironment() {
    const loc = state.location;
    if (!loc || (!loc.district && !loc.city)) return;
    const seq = ++envSeq;
    els.envPanel.classList.remove("hidden");
    els.envBadge.textContent = "…";
    els.envBadge.className = "env-badge loading";
    els.envSub.textContent = "Analizando el entorno con IA…";
    els.envAmenities.textContent = "—";
    els.envServices.textContent = "—";
    els.envFactorVal.textContent = "×1.00";
    els.envWhy.textContent = "";

    try {
      const params = new URLSearchParams({
        district: loc.district || "",
        city: loc.city || "",
        lat: loc.lat != null ? loc.lat : "",
        lon: loc.lon != null ? loc.lon : ""
      });
      const res = await fetch("/api/environment?" + params.toString());
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (seq !== envSeq || !state.location) return;
      state.envProfile = data;
      renderEnvironment(data);
      recompute();
    } catch (e) {
      if (seq !== envSeq) return;
      state.envProfile = null;
      els.envPanel.classList.add("hidden");
    }
  }

  /* ---------------- Descripción libre (IA) ---------------- */
  async function fetchDescription() {
    const loc = state.location;
    if (!loc) return;
    const desc = (els.descripcion && els.descripcion.value || "").trim();
    const seq = ++state.descSeq;
    if (desc.length < 15) {
      state.descAdj = null;
      els.descNote.classList.add("hidden");
      recompute();
      return;
    }
    const inputs = readInputs();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 40000);
      let res;
      try {
        res = await fetch("/api/descripcion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({
            district: loc.district || "",
            city: loc.city || "",
            type: inputs.type,
            inputs: inputs,
            description: desc
          })
        });
      } finally {
        clearTimeout(timer);
      }
      const data = await res.json().catch(() => ({}));
      if (seq !== state.descSeq || !state.location) return;
      state.descAdj = data && data.used ? data : null;
      recompute();
    } catch (e) {
      if (seq !== state.descSeq) return;
      state.descAdj = null;
      els.descNote.classList.add("hidden");
      recompute();
    }
  }

  let descDebounce = null;
  if (els.descripcion) {
    els.descripcion.addEventListener("input", () => {
      clearTimeout(descDebounce);
      descDebounce = setTimeout(() => {
        if (state.tasado) fetchDescription();
      }, 800);
    });
  }

  function renderEnvironment(env) {
    if (env.enabled === false) {
      els.envBadge.textContent = "Estándar";
      els.envBadge.className = "env-badge media";
      els.envSub.textContent = "IA de entorno no disponible; se aplica factor neutro (×1.00).";
      els.envAmenities.textContent = "—";
      els.envServices.textContent = "—";
      els.envFactorVal.textContent = "×1.00";
      els.envWhy.textContent = env.reason || "";
      return;
    }
    const badgeClass = { A: "alta", B: "alta", C: "media", D: "baja", E: "baja" }[env.nse] || "media";
    els.envBadge.textContent = env.nseLabel || "Medio";
    els.envBadge.className = "env-badge " + badgeClass;
    const zonaLabels = {
      premium: "Premium / frente al mar / exclusiva",
      central: "Céntrica / consolidada",
      normal: "Zona residencial estándar",
      periferia: "Periférica / en expansión"
    };
    if (env.zona && zonaLabels[env.zona] && !state.zoneTouched) {
      els.zona.value = env.zona;
    }
    els.envSub.textContent = "Entorno clasificado por IA con base en nivel socioeconómico, " +
      "equipamiento comercial y servicios del distrito." +
      (env.zona && zonaLabels[env.zona] ? " Zona interna: " + zonaLabels[env.zona] + "." : "");
    els.envAmenities.textContent = env.amenities != null ? env.amenities + "/5" : "—";
    els.envServices.textContent = env.services != null ? env.services + "/5" : "—";
    els.envFactorVal.textContent = "×" + env.environmentFactor.toFixed(2);
    els.envWhy.textContent = env.rationale || "";
  }

  renderFields();
  window.__test = { recompute, applyPlace, applyReverse };
})();
