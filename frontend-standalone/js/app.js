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
    zonaValue: $("zonaValue"),
    areaLabel: $("areaLabel"),
    totalFloors: $("totalFloors"),
    elevator: $("elevator"),
    parking: $("parking"),
    storage: $("storage"),
    finishes: $("finishes"),
    finishesValue: $("finishesValue"),
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
    leadModal: $("leadModal"),
    leadForm: $("leadForm"),
    leadName: $("leadName"),
    leadLastName: $("leadLastName"),
    leadEmail: $("leadEmail"),
    leadPhone: $("leadPhone"),
    leadAddress: $("leadAddress"),
    leadStatus: $("leadStatus"),
    leadSubmit: $("leadSubmit"),
    leadClose: $("leadClose"),
    tasarBtn: $("tasarBtn"),
    resultCard: $("resultCard"),
    loadingPanel: $("loadingPanel"),
    descripcion: $("descripcion"),
    descNote: $("descNote"),
    propertyPhotos: $("propertyPhotos"),
    propertyPhotoPreviews: $("propertyPhotoPreviews"),
    propertyPhotoStatus: $("propertyPhotoStatus"),
    propertyPhotoNote: $("propertyPhotoNote")
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
    tasado: false,
    loading: false,
    runSeq: 0,
    marketDone: false,
    rentDone: false,
    envDone: false,
    aiLocSeq: 0,
    descAdj: null,
    descSeq: 0,
    photos: [],
    photoAdj: null,
    photoSeq: 0
  };

  const fmt = (n) => Math.round(n).toLocaleString("es-PE");
  const fmtUSD = (n) =>
    Math.round(n).toLocaleString("es-PE", { maximumFractionDigits: 0 });

  /* ---------------- Fotos de la propiedad ---------------- */
  const MAX_PROPERTY_PHOTOS = 4;
  const MAX_PROPERTY_PHOTO_SIZE = 10 * 1024 * 1024;
  const PROPERTY_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

  function setPropertyPhotoStatus(message, isError) {
    if (!els.propertyPhotoStatus) return;
    els.propertyPhotoStatus.textContent = message;
    els.propertyPhotoStatus.classList.toggle("err", !!isError);
  }

  function renderPropertyPhotos() {
    if (!els.propertyPhotoPreviews) return;
    els.propertyPhotoPreviews.innerHTML = "";
    state.photos.forEach((photo, index) => {
      const item = document.createElement("div");
      item.className = "photo-item";
      const image = document.createElement("img");
      image.src = photo.url;
      image.alt = "Foto de la propiedad " + (index + 1);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "photo-remove";
      remove.title = "Quitar foto " + (index + 1);
      remove.setAttribute("aria-label", remove.title);
      remove.dataset.photoIndex = index;
      remove.textContent = "×";
      item.append(image, remove);
      els.propertyPhotoPreviews.appendChild(item);
    });
  }

  function preparePropertyPhoto(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const image = new Image();
        image.onload = () => {
          const maxEdge = 960;
          const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        image.onerror = reject;
        image.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function addPropertyPhotos(files) {
    const available = MAX_PROPERTY_PHOTOS - state.photos.length;
    const selected = files.slice(0, Math.max(0, available));
    const hasExcess = files.length > selected.length;
    let hasInvalidFile = false;

    for (const file of selected) {
      if (!PROPERTY_IMAGE_TYPES.includes(file.type) || file.size > MAX_PROPERTY_PHOTO_SIZE) {
        hasInvalidFile = true;
        continue;
      }
      try {
        const dataUrl = await preparePropertyPhoto(file);
        state.photos.push({ file, url: URL.createObjectURL(file), dataUrl });
      } catch (e) {
        hasInvalidFile = true;
      }
    }
    state.photoAdj = null;
    state.photoSeq++;
    setFinishes("intermedio", { pending: true });
    renderPropertyPhotos();

    const count = state.photos.length;
    if (hasExcess || hasInvalidFile) {
      const reason = hasExcess
        ? "El límite es de " + MAX_PROPERTY_PHOTOS + " fotos."
        : "Solo se aceptan JPG, PNG o WebP de hasta 10 MB.";
      setPropertyPhotoStatus(count + " de " + MAX_PROPERTY_PHOTOS + " foto(s) añadida(s). " + reason, true);
    } else {
      setPropertyPhotoStatus(count + " de " + MAX_PROPERTY_PHOTOS + " foto(s) añadida(s).", false);
    }
    if (state.tasado) {
      recompute();
      fetchPropertyPhotos();
    }
  }

  if (els.propertyPhotos) {
    els.propertyPhotos.addEventListener("change", async () => {
      await addPropertyPhotos(Array.from(els.propertyPhotos.files || []));
      els.propertyPhotos.value = "";
    });
  }
  if (els.propertyPhotoPreviews) {
    els.propertyPhotoPreviews.addEventListener("click", (event) => {
      const button = event.target.closest(".photo-remove");
      if (!button) return;
      const index = Number(button.dataset.photoIndex);
      const photo = state.photos[index];
      if (!photo) return;
      URL.revokeObjectURL(photo.url);
      state.photos.splice(index, 1);
      state.photoAdj = null;
      state.photoSeq++;
      setFinishes("intermedio", { pending: true });
      if (els.propertyPhotoNote) els.propertyPhotoNote.classList.add("hidden");
      renderPropertyPhotos();
      setPropertyPhotoStatus(state.photos.length
        ? state.photos.length + " de " + MAX_PROPERTY_PHOTOS + " foto(s) añadida(s)."
        : "Puedes añadir hasta 4 fotos en JPG, PNG o WebP.", false);
      if (state.tasado) recompute();
    });
  }

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

  /* ---------------- Validación de ubicación ---------------- */
  function invalidLocationReason(loc, place) {
    const a = (place && place.address) || {};
    const water = [
      a.sea, a.ocean, a.bay, a.gulf, a.strait, a.lake, a.reservoir,
      a.river, a.water, a.canal, a.dam
    ].filter(Boolean);
    if (water.length) {
      return "La ubicación es errónea: el punto cae en " + water[0] +
        " (fuera de tierra firme). Elige un punto sobre la propiedad.";
    }
    if (!loc.district && !loc.city && !loc.state &&
        !(a.road || a.suburb || a.neighbourhood || a.city_district ||
          a.town || a.municipality || a.county)) {
      return "La ubicación es errónea: el punto no corresponde a ninguna zona con referencia urbana. Elige un punto sobre la propiedad.";
    }
    return null;
  }

  function checkAIValidation(loc) {
    const seq = ++state.aiLocSeq;
    const params = new URLSearchParams({
      lat: loc.lat != null ? loc.lat : "",
      lon: loc.lon != null ? loc.lon : "",
      district: loc.district || "",
      city: loc.city || "",
      address: loc.display || ""
    });
    fetch("/api/validate-location?" + params.toString())
      .then((r) => r.json())
      .then((data) => {
        if (seq !== state.aiLocSeq) return;
        if (data && data.enabled && data.valid === false) {
          state.location = null;
          if (marker) { map.removeLayer(marker); marker = null; }
          showStatus("Ubicación errónea: " + (data.reason || "el punto no corresponde a una propiedad habitable."), true, true);
          resetResults();
        }
      })
      .catch(() => {});
  }

  function rejectLocation(reason) {
    state.location = null;
    if (marker) { map.removeLayer(marker); marker = null; }
    showStatus(reason, true, true);
    resetResults();
  }

  const zonaLabels = {
    auto: "Auto (calculada)",
    premium: "Premium / frente al mar / exclusiva",
    central: "Céntrica / consolidada",
    normal: "Zona residencial estándar",
    periferia: "Periférica / en expansión"
  };

  function setZona(val) {
    if (val && zonaLabels[val]) {
      els.zona.value = val;
      els.zonaValue.textContent = zonaLabels[val];
      els.zonaValue.classList.remove("muted");
    } else {
      els.zonaValue.textContent = "Evaluando la zona…";
      els.zonaValue.classList.add("muted");
    }
  }

  const finishesLabels = { basico: "Básico", intermedio: "Intermedio", premium: "Premium" };

  function setFinishes(val, opts) {
    opts = opts || {};
    const v = finishesLabels[val] ? val : "intermedio";
    els.finishes.value = v;
    if (!els.finishesValue) return;
    if (opts.pending) {
      els.finishesValue.textContent = "Pendiente de foto del interior…";
      els.finishesValue.classList.add("muted");
    } else {
      els.finishesValue.textContent = finishesLabels[v] + (opts.muted ? " (por defecto)" : "");
      els.finishesValue.classList.toggle("muted", !!opts.muted);
    }
  }

  function applyPlace(place) {
    const loc = placeToLocation(place);
    const bad = invalidLocationReason(loc, place);
    if (bad) { rejectLocation(bad); return; }
    state.location = loc;
    setMarker(loc.lat, loc.lon);
    setZona("auto");
    setFinishes("intermedio", { pending: true });
    const { pretty } = placeLabel(place);
    const zone = loc.district || loc.city || "zona detectada";
    els.zoneLabel.textContent = zone + " · " + pretty;
    els.mapStatus.textContent = pretty + " · presiona Tasar para calcular";
    els.mapStatus.classList.remove("hidden");
    resetResults();
    checkAIValidation(loc);
  }

  async function applyReverse(lat, lon) {
    try {
      const place = await GEO.reverse(lat, lon);
      const loc = placeToLocation(place);
      const bad = invalidLocationReason(loc, place);
      if (bad) { rejectLocation(bad); return; }
      state.location = loc;
      setMarker(lat, lon);
      setZona("auto");
      setFinishes("intermedio", { pending: true });
      const { pretty } = placeLabel(place);
      els.zoneLabel.textContent = (loc.district || loc.city || "zona detectada") + " · " + pretty;
      els.mapStatus.textContent = pretty + " · presiona Tasar para calcular";
      els.mapStatus.classList.remove("hidden");
      resetResults();
      checkAIValidation(loc);
    } catch (e) {
      const msg = /fuera de tierra firme|Sin resultado|errónea/i.test(e.message)
        ? e.message
        : "No se pudo geocodificar ese punto. Prueba con un lugar más cercano a tierra.";
      rejectLocation(msg);
    }
  }

  /* ---------------- Botón Tasar ---------------- */
  function hideAllResults() {
    const priceBlock = document.querySelector(".price-block");
    const empty = document.querySelector(".empty-state");
    if (priceBlock) priceBlock.classList.add("hidden");
    if (empty) empty.classList.add("hidden");
    [els.marketPanel, els.envPanel, els.rentalPanel, els.confidence,
      els.breakdown, els.legalPanel, els.descNote].forEach((el) => el && el.classList.add("hidden"));
    if (els.propertyPhotoNote) els.propertyPhotoNote.classList.add("hidden");
  }

  function setLoading(on) {
    state.loading = on;
    if (els.loadingPanel) els.loadingPanel.classList.toggle("hidden", !on);
    if (on) hideAllResults();
  }

  function revealResults() {
    if (state.marketDone) els.marketPanel.classList.remove("hidden");
    if (state.envDone && state.envProfile) els.envPanel.classList.remove("hidden");
  }

  function resetResults() {
    state.tasado = false;
    state.lastTotal = 0;
    state.market = null;
    state.rentMarket = null;
    state.envProfile = null;
    state.descAdj = null;
    state.photoAdj = null;
    state.marketSeq++;
    state.rentSeq++;
    state.descSeq++;
    envSeq++;
    hideAllResults();
    const empty = document.querySelector(".empty-state");
    if (empty) empty.classList.remove("hidden");
    if (els.loadingPanel) els.loadingPanel.classList.add("hidden");
    state.loading = false;
  }

  function runValuation() {
    if (!state.location) {
      showStatus("Primero ingresa la ubicación de la propiedad.");
      const firstCard = document.querySelector(".col-main .card");
      if (firstCard) firstCard.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (!state.photos.length) {
      showStatus("Debes subir al menos una foto del interior de la propiedad para que la IA determine los acabados y pueda hacer la tasación.");
      const photoCard = document.querySelector(".property-photos");
      if (photoCard) photoCard.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    openLeadModal();
  }

  function openLeadModal() {
    if (!els.leadModal) { startValuation(); return; }
    els.leadForm.reset();
    const loc = state.location;
    if (els.leadAddress && loc) {
      els.leadAddress.value = loc.display || loc.address || "";
    }
    setLeadStatus("", null);
    els.leadSubmit.disabled = false;
    els.leadSubmit.textContent = "Tasar ahora";
    els.leadModal.classList.remove("hidden");
    document.body.classList.add("no-scroll");
    setTimeout(() => {
      const first = els.leadModal.querySelector("input");
      if (first) first.focus();
    }, 50);
  }

  function closeLeadModal() {
    if (!els.leadModal) return;
    els.leadModal.classList.add("hidden");
    document.body.classList.remove("no-scroll");
  }

  function setLeadStatus(msg, type) {
    if (!els.leadStatus) return;
    els.leadStatus.textContent = msg || "";
    els.leadStatus.classList.toggle("hidden", !msg);
    els.leadStatus.classList.toggle("err", type === "err");
    els.leadStatus.classList.toggle("ok", type === "ok");
  }

  function sendLeadAndStart() {
    if (!els.leadModal) { startValuation(); return; }
    const name = els.leadName.value.trim();
    const lastName = els.leadLastName.value.trim();
    const email = els.leadEmail.value.trim();
    const phone = els.leadPhone.value.trim();
    const address = els.leadAddress.value.trim();

    if (!name || !lastName || !email || !phone || !address) {
      setLeadStatus("Completa todos los campos para continuar.", "err");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setLeadStatus("Ingresa un correo electrónico válido.", "err");
      return;
    }

    els.leadSubmit.disabled = true;
    els.leadSubmit.textContent = "Enviando…";
    setLeadStatus("", null);

    const data = {
      _subject: "Nueva tasación solicitada — " + name + " " + lastName,
      _template: "table",
      _replyto: email,
      Nombre: name,
      Apellido: lastName,
      Correo: email,
      Telefono: phone,
      Direccion: address
    };

    fetch("https://formsubmit.co/ajax/contacto@tasador.investamype.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    })
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        const success = json && (json.success === "true" || json.success === true);
        if (!ok && !success) throw new Error("No se pudo enviar el correo.");
        setLeadStatus("Datos enviados. Calculando tu tasación…", "ok");
        setTimeout(() => {
          closeLeadModal();
          startValuation();
        }, 600);
      })
      .catch(() => {
        setLeadStatus("No se pudo enviar el correo. Verifica tu conexión e intenta de nuevo.", "err");
        els.leadSubmit.disabled = false;
        els.leadSubmit.textContent = "Tasar ahora";
      });
  }

  if (els.leadForm) els.leadForm.addEventListener("submit", (e) => { e.preventDefault(); sendLeadAndStart(); });
  if (els.leadClose) els.leadClose.addEventListener("click", closeLeadModal);
  if (els.leadModal) els.leadModal.addEventListener("click", (e) => {
    if (e.target === els.leadModal) closeLeadModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && els.leadModal && !els.leadModal.classList.contains("hidden")) closeLeadModal();
  });

  function startValuation() {
    const runId = ++state.runSeq;
    state.tasado = true;
    state.market = null;
    state.rentMarket = null;
    state.envProfile = null;
    state.marketDone = false;
    state.rentDone = false;
    state.envDone = false;
    setLoading(true);
    saveSnapshot();
    Promise.allSettled([
      fetchMarket(),
      fetchRentals(),
      fetchEnvironment(),
      fetchDescription(),
      fetchPropertyPhotos()
    ]).then(() => {
      if (!state.tasado || runId !== state.runSeq) return;
      setLoading(false);
      revealResults();
      recompute();
      if (els.resultCard) els.resultCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
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

  function showStatus(msg, isError, persist) {
    els.mapStatus.textContent = msg;
    els.mapStatus.classList.remove("hidden");
    els.mapStatus.classList.toggle("err", !!isError);
    clearTimeout(showStatus._t);
    if (!persist) {
      showStatus._t = setTimeout(
        () => els.mapStatus.classList.add("hidden"),
        isError ? 8000 : 4000
      );
    }
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
    els.totalFloors, els.elevator, els.parking, els.storage,
    els.finishes, els.amenities, els.maintenance, els.regime, els.casaFloors,
    els.shape, els.topography, els.fence, els.zoning, els.services,
    els.corner, els.urbanization, els.road
  ].forEach((el) => {
    el.addEventListener("input", recompute);
    el.addEventListener("change", recompute);
  });

  els.zona.addEventListener("change", recompute);

  els.casaFloors.addEventListener("input", () => {
    const v = parseInt(els.casaFloors.value, 10);
    if (v === 0) {
      els.casaFloors.value = 1;
      recompute();
    }
  });

  /* Estacionamiento: botones Sí/No sincronizados con el select oculto */
  const parkingToggle = $("parkingToggle");
  if (parkingToggle && els.parking) {
    parkingToggle.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-toggle-btn");
      if (!btn || !parkingToggle.contains(btn)) return;
      parkingToggle.querySelectorAll(".btn-toggle-btn").forEach((b) =>
        b.classList.toggle("active", b === btn)
      );
      els.parking.value = btn.dataset.parking;
      recompute();
    });
  }

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
    if (!state.tasado || !state.location || state.loading) return;
    const inputs = readInputs();
    const r = computeValuation(state.location, inputs, state.market, state.envProfile, state.descAdj, state.photoAdj);

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
        "<b>IA</b> usó tu comentario como guía y ajustó el valor <b>" + sign + pct.toFixed(1) + "%</b> (" +
        esc(state.descAdj.summary || "") + "): " +
        esc(state.descAdj.rationale || "");
    } else {
      els.descNote.classList.add("hidden");
    }
    if (state.photoAdj && state.photoAdj.used) {
      const pct = (state.photoAdj.factor - 1) * 100;
      const sign = pct > 0 ? "+" : "";
      const cond = state.photoAdj.condition || "bueno";
      const fin = state.photoAdj.finishes || "intermedio";
      els.propertyPhotoNote.classList.remove("hidden");
      els.propertyPhotoNote.innerHTML =
        "<b>IA con fotos</b> vio la propiedad: estado visible <b>" + esc(cond) +
        "</b> · acabados <b>" + esc(fin) + "</b>" +
        (pct ? " · ajuste <b>" + sign + pct.toFixed(1) + "%</b>" : " · sin ajuste") +
        (state.photoAdj.interiorVisible === false ? " · ⚠ no se ve el interior, acabados asumidos" : "") +
        ". " +
        esc(state.photoAdj.rationale || state.photoAdj.observations || "La evidencia visual fue incorporada de forma conservadora.");
    } else if (els.propertyPhotoNote) {
      els.propertyPhotoNote.classList.add("hidden");
    }
    saveSnapshot();
  }

  async function fetchPropertyPhotos() {
    if (!state.photos.length || !state.location) return;
    const seq = ++state.photoSeq;
    setPropertyPhotoStatus("La IA está revisando " + state.photos.length + " foto(s) para ajustar la tasación…", false);
    try {
      const res = await fetch("/api/analiza-fotos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "valuation",
          district: state.location.district || "",
          city: state.location.city || "",
          lat: state.location.lat != null ? state.location.lat : null,
          lon: state.location.lon != null ? state.location.lon : null,
          inputs: readInputs(),
          images: state.photos.slice(0, MAX_PROPERTY_PHOTOS).map((photo) => photo.dataUrl)
        })
      });
      const data = await res.json().catch(() => ({}));
      if (seq !== state.photoSeq) return;
      state.photoAdj = data && data.used ? data : null;
      if (state.photoAdj) {
        setFinishes(state.photoAdj.finishes);
        const pct = (state.photoAdj.factor - 1) * 100;
        const interiorMsg = state.photoAdj.interiorVisible === false
          ? " Las fotos no muestran el interior; los acabados se tomaron como intermedio."
          : "";
        setPropertyPhotoStatus("Fotos analizadas por IA. Ajuste visual: " + (pct > 0 ? "+" : "") + pct.toFixed(1) + "%." + interiorMsg, state.photoAdj.interiorVisible === false);
      } else {
        setFinishes("intermedio", { muted: true });
        setPropertyPhotoStatus("Las fotos no pudieron aportar un ajuste: " + ((data && data.reason) || "se mantiene el cálculo base."), true);
      }
      recompute();
    } catch (e) {
      if (seq !== state.photoSeq) return;
      state.photoAdj = null;
      setFinishes("intermedio", { muted: true });
      setPropertyPhotoStatus("No se pudo analizar las fotos; se mantiene el cálculo base.", true);
      recompute();
    }
  }

  /* ---------------- Precios de mercado (comparables reales) ---------------- */
  async function fetchMarket() {
    const loc = state.location;
    if (!loc || (!loc.district && !loc.city)) return;
    const type = readInputs().type;

    const seq = ++state.marketSeq;
    state.marketFetching = true;
    state.marketDone = true;
    if (!state.loading) els.marketPanel.classList.remove("hidden");
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
    state.rentDone = true;
    if (!state.loading) els.rentalPanel.classList.remove("hidden");
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
    state.envDone = true;
    if (!state.loading) els.envPanel.classList.remove("hidden");
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
    if (env.zona) {
      setZona(env.zona);
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
