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
    footTotal: $("footTotal"),
    confidence: $("confidence"),
    confTitle: $("confTitle"),
    confMsg: $("confMsg"),
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
    zona: $("zona")
  };

  const state = {
    location: null,
    lastTotal: 0
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

  async function runSearch(q, autoSelect) {
    try {
      const places = await GEO.search(q);
      if (els.input.value.trim() !== q) return;
      renderSuggestions(places);
      if (autoSelect && places.length) {
        selectedPlace = places[0];
        els.input.value = shortName(places[0].display_name);
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
      d.innerHTML = name.replace(/, Peru|, Perú/g, "") + "<small>" + shortName(name) + "</small>";
      d.addEventListener("click", () => {
        selectedPlace = p;
        els.input.value = shortName(name);
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
  function applyPlace(place) {
    const loc = placeToLocation(place);
    state.location = loc;
    setMarker(loc.lat, loc.lon);
    const zone = loc.district || loc.city || "zona detectada";
    els.zoneLabel.textContent = zone + " · " + (loc.display || "").slice(0, 60);
    els.mapStatus.textContent = loc.display || "Ubicación seleccionada";
    els.mapStatus.classList.remove("hidden");
    recompute();
  }

  async function applyReverse(lat, lon) {
    try {
      const place = await GEO.reverse(lat, lon);
      const loc = placeToLocation(place);
      state.location = loc;
      setMarker(lat, lon);
      els.zoneLabel.textContent = loc.district || loc.city || "zona detectada";
      els.mapStatus.textContent = (place.display_name || "Ubicación").slice(0, 80);
      els.mapStatus.classList.remove("hidden");
      recompute();
    } catch (e) {
      showStatus("No se pudo geocodificar ese punto.");
    }
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
      recompute();
    });
  });

  els.area.addEventListener("input", () => {
    els.areaVal.textContent = els.area.value + " m²";
    recompute();
  });
  els.dorm.addEventListener("input", () => {
    els.dormVal.textContent = els.dorm.value;
    recompute();
  });
  els.bano.addEventListener("input", () => {
    els.banoVal.textContent = els.bano.value;
    recompute();
  });
  els.edad.addEventListener("input", () => {
    els.edadVal.textContent = els.edad.value + " años";
    recompute();
  });

  [els.piso, els.condicion, els.estado, els.zona].forEach((el) => {
    el.addEventListener("input", recompute);
    el.addEventListener("change", recompute);
  });

  function readInputs() {
    const active = document.querySelector(".type-btn.active");
    return {
      type: active ? active.dataset.type : "departamento",
      area: parseFloat(els.area.value) || 70,
      bedrooms: parseInt(els.dorm.value) || 2,
      bathrooms: parseInt(els.bano.value) || 2,
      age: parseInt(els.edad.value) || 10,
      floor: parseInt(els.piso.value) || 3,
      condition: els.condicion.value,
      estado: els.estado.value,
      zone: els.zona.value
    };
  }

  /* ---------------- Cálculo ---------------- */
  function recompute() {
    if (!state.location) return;
    const inputs = readInputs();
    const r = computeValuation(state.location, inputs);

    const priceBlock = document.querySelector(".price-block");
    const empty = document.querySelector(".empty-state");
    priceBlock.classList.remove("hidden");
    empty.classList.add("hidden");

    animatePrice(r.total);

    els.priceUSD.textContent = "≈ USD " + fmtUSD(r.totalUSD) +
      " · $" + fmtUSD(r.rangeLowUSD) + " – $" + fmtUSD(r.rangeHighUSD);
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

  window.__test = { recompute, applyPlace, applyReverse };
})();
