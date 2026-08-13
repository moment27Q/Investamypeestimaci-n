(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  var els = {
    addressInput: $("addressInput"),
    suggestions: $("suggestions"),
    geoBtn: $("geoBtn"),
    map: $("map"),
    mapStatus: $("mapStatus"),
    zoneLabel: $("zoneLabel"),
    zoneLabelSub: $("zoneLabelSub"),
    formPanel: $("formPanel"),
    landArea: $("landArea"),
    landAreaVal: $("landAreaVal"),
    zoning: $("zoning"),
    budget: $("budget"),
    budgetVal: $("budgetVal"),
    objective: $("objective"),
    objetivo: $("objetivo"),
    modeGrid: $("modeGrid"),
    calcBtn: $("calcBtn"),
    calcHint: $("calcHint"),
    results: $("results"),
    resultsEmpty: $("resultsEmpty"),
    sumLand: $("sumLand"),
    sumLandZone: $("sumLandZone"),
    sumBuilt: $("sumBuilt"),
    sumBuiltDetail: $("sumBuiltDetail"),
    sumGain: $("sumGain"),
    sumGainPct: $("sumGainPct"),
    recoCallout: $("recoCallout"),
    modeResults: $("modeResults"),
    provModal: $("provModal"),
    provModalTitle: $("provModalTitle"),
    provModalBody: $("provModalBody"),
    provClose: $("provClose"),
    aiStatus: $("aiStatus"),
    aiBody: $("aiBody"),
    photoZone: $("photoZone"),
    photoInput: $("photoInput"),
    photoPick: $("photoPick"),
    photoPreviews: $("photoPreviews"),
    photoActions: $("photoActions"),
    photoAnalyze: $("photoAnalyze"),
    photoStatus: $("photoStatus"),
    photoResult: $("photoResult")
  };

  /* ---------------- Parámetros técnicos (referenciales, Lima-Perú) ---------------- */
  var ZONING = {
    residencial_media: { label: "Residencial densidad media (R3)", far: 2.8, floors: 4 },
    residencial_alta:  { label: "Residencial densidad alta (R5)", far: 3.5, floors: 8 },
    comercial:         { label: "Comercial (C)", far: 3.2, floors: 6 },
    mixto:             { label: "Mixto (RM)", far: 3.0, floors: 6 },
    otro:              { label: "Sin zonificación / rural", far: 1.6, floors: 2 }
  };

  var MODES = {
    albañil:      { key: "albañil", label: "Con albañil", ic: "👷", sub: "Autoconstrucción gestionada por ti", costPerM2: 3000, overheadPct: 0.10, monthsPerM2: 42, extraMonths: 4 },
    constructora: { key: "constructora", label: "Constructora", ic: "🏗️", sub: "Empresa constructora llave en mano", costPerM2: 3700, overheadPct: 0.08, monthsPerM2: 85, extraMonths: 5 },
    inmobiliaria: { key: "inmobiliaria", label: "Inmobiliaria", ic: "🏢", sub: "Ellos construyen y venden; tu aporte es el terreno", costPerM2: 0, overheadPct: 0, monthsPerM2: 95, extraMonths: 14 }
  };

  /* ---------------- Estado ---------------- */
  var state = {
    location: null,
    mode: "todas",
    ai: null,
    aiLoading: false,
    photos: [],
    photoAnalysis: null,
    analyzing: false,
    resultsShown: false
  };

  /* ---------------- Mapa ---------------- */
  var map = L.map("map").setView([-12.09, -77.04], 11);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  var marker = null;
  function setMarker(lat, lon) {
    if (!marker) {
      marker = L.marker([lat, lon]).addTo(map);
    } else {
      marker.setLatLng([lat, lon]);
    }
    map.setView([lat, lon], Math.max(map.getZoom(), 14));
  }

  function showPanel() {
    if (els.formPanel) els.formPanel.classList.remove("hidden");
  }

  async function applyReverse(lat, lon) {
    try {
      var place = await GEO.reverse(lat, lon);
      var loc = placeToLocation(place);
      state.location = loc;
      setMarker(lat, lon);
      var pretty = GEO.formatAddress(place.address, place.display_name);
      els.addressInput.value = pretty;
      els.zoneLabel.textContent = loc.district || loc.city || "Ubicación";
      els.zoneLabelSub.textContent = pretty;
      els.zoneLabel.classList.add("set");
      els.mapStatus.textContent = pretty;
      els.mapStatus.classList.remove("hidden");
      showPanel();
      calc();
    } catch (e) {
      els.mapStatus.textContent = "No se pudo geocodificar ese punto.";
      els.mapStatus.classList.remove("hidden");
    }
  }

  map.on("click", function (e) {
    applyReverse(e.latlng.lat, e.latlng.lng);
  });

  els.geoBtn.addEventListener("click", function () {
    if (!navigator.geolocation) {
      els.mapStatus.textContent = "Tu navegador no soporta geolocalización.";
      els.mapStatus.classList.remove("hidden");
      return;
    }
    els.mapStatus.textContent = "Ubicando…";
    els.mapStatus.classList.remove("hidden");
    navigator.geolocation.getCurrentPosition(
      function (pos) { applyReverse(pos.coords.latitude, pos.coords.longitude); },
      function () {
        els.mapStatus.textContent = "No se pudo obtener tu ubicación.";
        els.mapStatus.classList.remove("hidden");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  function fmt(v) { return Math.round(v).toLocaleString("es-PE"); }
  function money(v) { return "S/ " + fmt(v); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ---------------- Lectura de entradas ---------------- */
  function readInputs() {
    var landArea = els.landAreaVal && els.landAreaVal.tagName === "INPUT"
      ? parseFloat(els.landAreaVal.value)
      : parseFloat(els.landArea.value);
    return {
      landArea: landArea || 200,
      zoning: els.zoning.value,
      budget: parseFloat(els.budget.value) || 0,
      objective: els.objective ? els.objective.value : "equilibrio",
      objetivo: els.objetivo ? els.objetivo.value.trim().slice(0, 1000) : "",
      mode: state.mode,
      share: 50
    };
  }

  /* ---------------- Motor de cálculo ---------------- */
  function computeMax(loc, inputs, analysis) {
    var base = resolveBasePrice(loc, null);
    var basePrice = base.base;
    var z = ZONING[inputs.zoning] || ZONING.otro;

    /* Ajustes derivados del análisis de fotos (IA de visión) */
    var landFactor = 1, buildFactor = 1, topoExtra = 0, demolition = 0, envBonus = 0;
    if (analysis && analysis.enabled !== false) {
      var hab = analysis.habilitacion || "habilitado";
      landFactor = hab === "habilitado" ? 1 : hab === "parcial" ? 0.92 : 0.82;
      var est = analysis.estadoTerreno || "limpio";
      buildFactor = est === "limpio" ? 1 : est === "descuidado" ? 0.97 : (est === "con_construccion" || est === "en_uso") ? 0.98 : 1;
      var topo = analysis.topografia || "plana";
      topoExtra = topo === "pendiente" ? 120 : topo === "desnivel" ? 180 : 0;
      if (est === "con_construccion" || est === "en_uso") demolition = inputs.landArea * 120;
      var q = Number(analysis.entorno) || 3;
      envBonus = (q - 3) * 0.01;
    }

    var builtArea = Math.round(Math.min(inputs.landArea * z.far, inputs.landArea * z.floors));
    var landPerM2 = basePrice * 0.50 * landFactor;
    var landValue = Math.round(landPerM2 * inputs.landArea);
    var salePerM2 = basePrice * 1.05 * (1 + envBonus);
    var saleTotal = Math.round(salePerM2 * builtArea);
    var rentaTotal = Math.round(builtArea * rentBaseFromPrice(salePerM2) * 0.9);
    var share = inputs.share;

    var results = [];
    Object.keys(MODES).forEach(function (k) {
      var m = MODES[k];
      var unitCost = m.costPerM2 + (k === "inmobiliaria" ? 0 : topoExtra);
      var cost = builtArea * unitCost;
      var overhead = cost * m.overheadPct;
      var userCash = Math.round(cost + overhead + demolition * (k === "inmobiliaria" ? 0 : 1));
      var value = k === "inmobiliaria" ? Math.round(saleTotal * share / 100) : Math.round(saleTotal * buildFactor);
      var net = value - userCash;
      var gain = net - landValue;
      var months = Math.round(builtArea / m.monthsPerM2) + m.extraMonths;
      var effectiveRenta = k === "inmobiliaria" ? Math.round(rentaTotal * share / 100) : Math.round(rentaTotal * buildFactor);
      results.push({
        key: k,
        label: m.label,
        ic: m.ic,
        sub: m.sub,
        costPerM2: Math.round(unitCost),
        userCash: userCash,
        value: value,
        net: net,
        gain: gain,
        months: months,
        renta: effectiveRenta,
        share: k === "inmobiliaria" ? share : null,
        affordable: inputs.budget >= userCash
      });
    });

    function score(r) {
      if (inputs.objective === "renta") return r.renta - r.months * 400;
      if (inputs.objective === "venta") return r.net;
      return r.net - r.months * 8000;
    }
    var sorted = results.slice().sort(function (a, b) { return score(b) - score(a); });
    var best = sorted[0];

    return {
      basePrice: basePrice,
      zone: base.label,
      builtArea: builtArea,
      far: z.far,
      floors: z.floors,
      landValue: landValue,
      salePerM2: salePerM2,
      saleTotal: saleTotal,
      rentaTotal: rentaTotal,
      results: results,
      best: best,
      score: score,
      objective: inputs.objective,
      analysis: analysis
    };
  }

  /* ---------------- Render de resultados ---------------- */
  function render(r, aiShare) {
    var share = aiShare || 50;
    r.results.forEach(function (res) {
      if (res.key === "inmobiliaria" && aiShare) {
        res.value = Math.round(r.saleTotal * aiShare / 100);
        res.net = res.value - res.userCash;
        res.gain = res.net - r.landValue;
        res.share = aiShare;
        res.renta = Math.round(r.rentaTotal * aiShare / 100);
      }
    });
    r.best = r.results.slice().sort(function (a, b) { return r.score(b) - r.score(a); })[0];

    els.sumLand.textContent = money(r.landValue);
    els.sumLandZone.textContent = r.zone;
    els.sumBuilt.textContent = money(r.saleTotal);
    els.sumBuiltDetail.textContent = r.builtArea.toLocaleString("es-PE") + " m² construibles (FAR ×" + r.far + ")";
    var maxGain = Math.max.apply(null, r.results.map(function (x) { return x.gain; }));
    var best = r.best;
    els.sumGain.textContent = money(best.net);
    els.sumGainPct.textContent = "+" + Math.round(maxGain / Math.max(r.landValue, 1) * 100) + "% vs. vender el terreno hoy";

    renderReco(best, r);
    renderModes(r);
    renderAI(r, share);
  }

  function renderReco(best, r) {
    var ai = state.ai;
    var aiBest = ai && ai.plan && ai.plan.mejorModo ? ai.plan.mejorModo : null;
    var title = aiBest ? "Recomendación de la IA" : "Recomendación según tu objetivo";
    var body = ai && ai.plan && ai.plan.porQue
      ? esc(ai.plan.porQue)
      : "Con tu objetivo de " + objectiveLabel(r.objective) + ", el plan con mayor beneficio es <strong>" +
        esc(best.label) + "</strong>: ganancia neta de " + money(best.net) + " en unos " +
        best.months + " meses.";
    els.recoCallout.innerHTML =
      '<div class="reco-badge">✦ ' + esc(title) + '</div>' +
      '<p><strong>' + esc(aiBest ? MODES[aiBest].label : best.label) + '</strong> — ' + body + '</p>';
    els.recoCallout.classList.remove("hidden");
  }

  function objectiveLabel(o) {
    return { venta: "vender con la mayor ganancia", renta: "generar renta mensual", equilibrio: "equilibrar ganancia y rapidez" }[o] || o;
  }

  function renderModes(r) {
    var sel = state.mode === "todas" ? Object.keys(MODES) : [state.mode];
    var aiBest = state.ai && state.ai.plan && state.ai.plan.mejorModo;

    lastBuiltArea = r.builtArea;

    function renderProviders(k, builtArea) {
      var list = (window.PROVEEDORES || []).filter(function (p) { return p.key === k; });
      if (!list.length) return "";
      var title = k === "albañil" ? "Albañiles disponibles" : "Constructoras disponibles";

      return '<div class="prov-section">' +
        '<div class="prov-head">' +
          '<span class="prov-ic">' + (k === "albañil" ? "👷" : "🏗️") + '</span>' +
          '<span class="prov-title">' + esc(title) + '</span>' +
          '<span class="prov-count">' + list.length + ' disponibles</span>' +
          '<button type="button" class="prov-more" data-open-providers="' + k + '">Ver todos →</button>' +
        '</div>' +
        '<div class="prov-note">Toca “Ver todos” para comparar las propuestas de cada profesional según tu presupuesto y el área de tu terreno.</div>' +
        '</div>';
    }

    var html = sel.map(function (k) {
      var m = r.results.filter(function (x) { return x.key === k; })[0];
      if (!m) return "";
      var badges = [];
      if (m.key === r.best.key) badges.push('<span class="mb-badge">Mejor beneficio</span>');
      if (m.key === aiBest) badges.push('<span class="mb-badge ai">Recomendado por IA</span>');
      if (m.key !== "inmobiliaria" && !m.affordable) badges.push('<span class="mb-badge warn">Presupuesto insuficiente</span>');

      var rows = "";
      rows += '<div class="mr-row"><span>Tu inversión</span><b>' + (m.key === "inmobiliaria" ? "S/ 0 (aporte: el terreno)" : money(m.userCash)) + '</b></div>';
      rows += '<div class="mr-row"><span>Plazo estimado</span><b>' + m.months + ' meses</b></div>';
      rows += '<div class="mr-row"><span>Valor de venta estimado</span><b>' + money(m.value) + '</b></div>';
      rows += '<div class="mr-row"><span>Ganancia neta</span><b class="mr-pos">' + money(m.net) + '</b></div>';
      rows += '<div class="mr-row"><span>Adicional vs. vender hoy</span><b class="mr-pos">+' + money(m.gain) + '</b></div>';
      rows += '<div class="mr-row"><span>Renta mensual estimada</span><b>' + money(m.renta) + '</b></div>';
      if (m.key === "inmobiliaria") {
        rows += '<div class="mr-row"><span>Participación del propietario</span><b>' + m.share + '% del valor de venta</b></div>';
      }
      rows += '<div class="mr-row"><span>Costo por m²</span><b>' + (m.costPerM2 ? money(m.costPerM2) + "/m²" : "financiado por la inmobiliaria") + '</b></div>';

      return '<div class="mode-result' + (m.key === r.best.key ? " best" : "") + '">' +
        '<div class="mr-head"><span class="mr-ic">' + m.ic + '</span>' +
        '<div><div class="mr-name">' + esc(m.label) + '</div><div class="mr-sub">' + esc(m.sub) + '</div></div>' +
        '<div class="mr-badges">' + badges.join("") + '</div></div>' +
        '<div class="mr-body">' + rows + '</div></div>';
    }).join("");

    var sections = "";
    if (sel.indexOf("albañil") !== -1) sections += renderProviders("albañil", r.builtArea);
    if (sel.indexOf("constructora") !== -1) sections += renderProviders("constructora", r.builtArea);

    els.modeResults.innerHTML = '<div class="mode-results-grid">' + html + '</div>' + sections;
  }

  function provItemHtml(p, k, builtArea, budget) {
    var m = MODES[k];
    var rate = p.costPerM2 * (1 + (m.overheadPct || 0));
    var totalCost = Math.round(rate * builtArea);
    var affordable = budget >= totalCost;
    var area = affordable
      ? builtArea
      : Math.floor(budget / rate / 10) * 10;
    area = Math.max(area, 0);
    var cost = Math.round(rate * area);
    var months = Math.max(1, Math.round(area / m.monthsPerM2) + m.extraMonths);
    var gap = Math.max(0, totalCost - budget);

    var status = affordable
      ? '<b class="ok">Cubre tu proyecto completo (' + builtArea.toLocaleString("es-PE") + ' m²)</b>'
      : '<b class="warn">Con tu presupuesto construye ~' + area.toLocaleString("es-PE") + " m²" +
        (gap ? " · faltan " + money(gap) : "") + "</b>";

    return '<div class="prov-item">' +
      '<div class="prov-top">' +
        '<span class="prov-avatar">' + esc(p.initials) + '</span>' +
        '<div class="prov-info">' +
          '<b>' + esc(p.name) + '</b>' +
          '<span>' + esc(p.role) + ' · ' + p.years + ' años · ' + esc(p.coverage) + '</span>' +
        '</div>' +
        '<span class="prov-rating">★ ' + p.rating + '</span>' +
      '</div>' +
      '<div class="prov-tags">' + (p.tags || []).map(function (t) { return '<span>' + esc(t) + '</span>'; }).join("") + '</div>' +
      '<div class="prov-proposal">' +
        '<div class="prov-proposal-head"><span>Propuesta según tu presupuesto efectivo</span>' + status + '</div>' +
        '<div class="prov-cols">' +
          '<div><b>' + money(p.costPerM2) + '/m²</b><span>costo por m²</span></div>' +
          '<div><b>' + (area ? area.toLocaleString("es-PE") + " m²" : "—") + '</b><span>área a construir</span></div>' +
          '<div><b>' + (cost ? money(cost) : "—") + '</b><span>inversión estimada</span></div>' +
          '<div><b>' + months + ' meses</b><span>plazo estimado</span></div>' +
        '</div>' +
        (p.phone
          ? '<a class="prov-contact" href="https://wa.me/' + esc(p.phone) +
            '?text=' + encodeURIComponent("Hola " + p.name.split(" ")[0] + ", vi tu propuesta en Tasador Perú para construir mi propiedad de ~" + area + " m². ¿Podemos conversar?") +
            '" target="_blank" rel="noopener">WhatsApp · +' + p.phone.slice(0, 3) + " " + p.phone.slice(3, 6) + " " + p.phone.slice(6) + '</a>'
          : "") +
      '</div>' +
    '</div>';
  }

  var lastBuiltArea = 0;

  function openProviders(k) {
    var list = (window.PROVEEDORES || []).filter(function (p) { return p.key === k; });
    if (!list.length) return;
    var inputs = readInputs();
    var budget = inputs.budget;
    var builtArea = lastBuiltArea || 0;
    var title = k === "albañil" ? "Albañiles disponibles" : "Constructoras disponibles";

    els.provModalTitle.textContent = title;
    els.provModalBody.innerHTML =
      '<div class="prov-modal-summary">' +
        '<div><b>' + money(budget) + '</b><span>Presupuesto efectivo para construir</span></div>' +
        '<div><b>' + builtArea.toLocaleString("es-PE") + ' m²</b><span>Área construible de tu terreno</span></div>' +
        '<div><b>' + list.length + '</b><span>Profesionales para comparar</span></div>' +
      '</div>' +
      '<div class="prov-grid">' + list.map(function (p) { return provItemHtml(p, k, builtArea, budget); }).join("") + '</div>';

    els.provModal.classList.remove("hidden");
    document.body.classList.add("no-scroll");
  }

  function closeProviders() {
    els.provModal.classList.add("hidden");
    document.body.classList.remove("no-scroll");
  }

  /* ---------------- Asesor IA ---------------- */
  var STATIC_ADVICE = {
    albañil: {
      porQue: "Es el plan con mayor ganancia neta si puedes dedicarle tiempo: el costo por m² es el más bajo y todo el margen queda en tu bolsillo.",
      argumentos: [
        "Vamos a pagar por avance de obra verificado y certificado, no por adelantado.",
        "Necesito recibos firmados por cada pago y factura de los materiales que adquiera.",
        "El contrato incluye penalidad si no cumples el cronograma pactado."
      ],
      clausulas: [
        "Pagos por hitos verificados (cimientos, estructura, techos, acabados), reteniendo 10–20% hasta 30 días después de la entrega.",
        "Plazo máximo con penalidad económica por cada día de atraso.",
        "Responsabilidad por vicios ocultos por al menos 2 años.",
        "Materiales comprados por el propietario o con rendición documentada."
      ],
      riesgos: [
        "Adelantos de dinero sin avance de obra verificado.",
        "Obra sin licencia municipal: multas y riesgo de demolición.",
        "Construir sin plano firmado por ingeniero colegiado."
      ],
      preguntas: [
        "¿Qué obras similares ha terminado y puedo visitar?",
        "¿Quién responde si aparece un problema estructural después de entregar?"
      ],
      consejo: "Gestiona tú las licencias, contrata un ingeniero estructural y no adelantes dinero sin avance certificado."
    },
    constructora: {
      porQue: "Mayor seguridad y tiempos más cortos; ideal si tienes el presupuesto y quieres evitar la gestión diaria.",
      argumentos: [
        "Quiero tres cotizaciones por escrito con la misma carta de especificaciones.",
        "Pagaremos por avance certificado, con supervisión técnica independiente.",
        "Incluyan la garantía por vicios ocultos dentro del contrato."
      ],
      clausulas: [
        "Garantía de obra y responsabilidad por vicios ocultos conforme al Código Civil.",
        "Cronograma con penalidades por retraso.",
        "Supervisión técnica independiente a cargo del propietario.",
        "Fianza de fiel cumplimiento de al menos el 10% del contrato."
      ],
      riesgos: [
        "Adicionales ocultos si las especificaciones no están claras por escrito.",
        "Subcontratación sin control de calidad.",
        "Exigir el 100% del pago antes de terminar la obra."
      ],
      preguntas: [
        "¿Cuánto cuesta el m² y qué incluye exactamente (acabados e instalaciones)?",
        "¿Están registrados como constructores? ¿Qué obras han entregado?"
      ],
      consejo: "Define por escrito alcance y acabados, contrata supervisión técnica y no pagues más del 15% sin avance."
    },
    inmobiliaria: {
      porQue: "No necesitas efectivo: ellos financian la construcción y tu terreno es tu capital. Exige entre 45% y 60% del valor de venta.",
      argumentos: [
        "Mi terreno es el activo clave: sin él no existe el proyecto.",
        "Quiero la valorización del terreno por un perito independiente.",
        "Propongo 50% como base; con penalidad si el proyecto se retrasa."
      ],
      clausulas: [
        "Porcentaje mínimo garantizado de participación (en unidades o en efectivo).",
        "Auditoría del costo de obra por un tercero independiente.",
        "Cronograma con penalidades por retraso.",
        "Garantía hipotecaria o prendaria sobre el proyecto a favor del propietario.",
        "Ninguna cesión de dominio sin notario y estudio de títulos previo."
      ],
      riesgos: [
        "Que vendan rápido a precio bajo solo para cubrir sus costos.",
        "Retrasos que licúen tu ganancia real.",
        "Cláusulas que te obliguen a aportar dinero adicional."
      ],
      preguntas: [
        "¿Cuál es el costo de obra presupuestado y quién lo audita?",
        "¿Qué pasa si no se venden todas las unidades?",
        "¿Mi participación está garantizada antes de sus gastos?"
      ],
      consejo: "Exige 50% como piso razonable, haz auditar el costo de obra y no entregues el terreno sin notario."
    }
  };

  function staticAdvice(mode) {
    return STATIC_ADVICE[mode] || STATIC_ADVICE.albañil;
  }

  function ul(items) {
    return '<ul>' + items.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul>";
  }

  function renderAI(r, share) {
    var ai = state.ai;
    var bestKey = ai && ai.plan && ai.plan.mejorModo ? ai.plan.mejorModo : r.best.key;
    var adv = (ai && ai.plan) ? ai.plan : staticAdvice(bestKey);

    var html = "";
    if (ai && ai.enabled) {
      els.aiStatus.textContent = "Analizado con " + (ai.model || "IA") + " · actuando exclusivamente a tu favor.";
      html += '<div class="ai-mejor">Mejor opción según la IA: <strong>' + esc(MODES[bestKey].label) + '</strong></div>';
    } else {
      els.aiStatus.textContent = "La IA no está disponible ahora (" + esc((ai && ai.reason) || "sin conexión") +
        "). Se muestran consejos estándar que protegen tus intereses.";
      html += '<div class="ai-mejor">Mejor opción según el cálculo: <strong>' + esc(MODES[bestKey].label) + '</strong></div>';
    }

    if (adv.porQue) html += '<div class="ai-sec"><h4>Por qué</h4><p>' + esc(adv.porQue) + '</p></div>';

    if (adv.argumentos && adv.argumentos.length) {
      html += '<div class="ai-sec"><h4>Frases para negociar a tu favor</h4>' + ul(adv.argumentos) + '</div>';
    }
    if (adv.clausulas && adv.clausulas.length) {
      html += '<div class="ai-sec"><h4>Cláusulas que debes exigir</h4>' + ul(adv.clausulas) + '</div>';
    }
    if (adv.riesgos && adv.riesgos.length) {
      html += '<div class="ai-sec"><h4>Riesgos y señales de alerta</h4>' + ul(adv.riesgos) + '</div>';
    }
    if (adv.preguntas && adv.preguntas.length) {
      html += '<div class="ai-sec"><h4>Preguntas antes de firmar</h4>' + ul(adv.preguntas) + '</div>';
    }

    var sh = adv.shareInmobiliaria;
    if (sh) {
      html += '<div class="ai-sec ai-share"><h4>Si negocias con una inmobiliaria</h4><p>Exige entre <strong>' +
        sh.min + '%</strong> y <strong>' + sh.max + '%</strong> del valor de venta; lo razonable es pedir <strong>' +
        sh.razonable + '%</strong>.</p></div>';
    }
    if (adv.consejo) {
      html += '<div class="ai-sec ai-consejo"><h4>Consejo final</h4><p>' + esc(adv.consejo) + '</p></div>';
    }

    els.aiBody.innerHTML = html;
  }

  async function fetchAI(r, inputs) {
    var loc = state.location;
    if (!loc) return;
    state.aiLoading = true;
    els.aiStatus.textContent = "La IA analiza tu caso y defiende tus intereses frente a albañiles, constructoras e inmobiliarias…";
    els.aiBody.innerHTML = '<div class="ai-loading"><i></i> Pensando a favor tuyo…</div>';

    var costAlbanil = r.results.filter(function (x) { return x.key === "albañil"; })[0].userCash;
    var costConstructora = r.results.filter(function (x) { return x.key === "constructora"; })[0].userCash;

    var params = new URLSearchParams({
      district: loc.district || "",
      city: loc.city || "",
      landArea: inputs.landArea,
      builtArea: r.builtArea,
      zoning: inputs.zoning,
      budget: inputs.budget,
      objective: inputs.objective,
      objetivo: inputs.objetivo,
      mode: inputs.mode,
      salePerM2: Math.round(r.salePerM2),
      landValue: r.landValue,
      saleTotal: r.saleTotal,
      rentaMonthly: r.rentaTotal,
      costAlbanil: costAlbanil,
      costConstructora: costConstructora,
      shareDefault: inputs.share,
      fotoAnalisis: photoSummary() || ""
    });

    try {
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, 50000);
      var res = await fetch(apiUrl("/api/maximiza?" + params.toString()), { signal: ctrl.signal });
      clearTimeout(timer);
      var data = await res.json().catch(function () { return {}; });
      state.ai = (data && data.enabled) ? data : { enabled: false, reason: (data && data.reason) || "error" };
    } catch (e) {
      state.ai = { enabled: false, reason: "el servidor no respondió" };
    }
    state.aiLoading = false;

    var aiShare = state.ai.enabled && state.ai.plan && state.ai.plan.shareInmobiliaria
      ? state.ai.plan.shareInmobiliaria.razonable
      : null;
    render(r, aiShare);
  }

  /* ---------------- Calcular ---------------- */
  function calc(fromButton) {
    var loc = state.location;
    if (!loc) {
      els.calcHint.textContent = "Selecciona la ubicación de tu terreno primero.";
      els.calcHint.classList.add("err");
      return;
    }
    els.calcHint.textContent = "";
    els.calcHint.classList.remove("err");
    var inputs = readInputs();
    var r = computeMax(loc, inputs, state.photoAnalysis);
    state.ai = null;
    renderPhotoResult();
    render(r, null);
    fetchAI(r, inputs);
    if (fromButton || state.resultsShown) {
      state.resultsShown = true;
      if (els.resultsEmpty) els.resultsEmpty.classList.add("hidden");
      els.results.classList.remove("hidden");
      els.results.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  /* ---------------- Fotos del predio (análisis con IA de visión) ---------------- */
  var MAX_PHOTOS = 6;
  var MAX_IMG_EDGE = 1280;
  var ANALYZE_IMG_EDGE = 640;

  function setPhotoStatus(msg, isErr) {
    els.photoStatus.textContent = msg;
    els.photoStatus.classList.toggle("err", !!isErr);
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function toDataUrl(img, edge) {
    var scale = Math.min(1, edge / Math.max(img.width, img.height));
    var w = Math.max(1, Math.round(img.width * scale));
    var h = Math.max(1, Math.round(img.height * scale));
    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.82);
  }

  function renderPhotoPreviews() {
    els.photoPreviews.innerHTML = "";
    state.photos.forEach(function (p, i) {
      var wrap = document.createElement("div");
      wrap.className = "photo-item";
      wrap.innerHTML =
        '<img src="' + p.dataUrl + '" alt="Foto ' + (i + 1) + '">' +
        '<button type="button" class="photo-remove" title="Quitar foto" data-idx="' + i + '">×</button>';
      els.photoPreviews.appendChild(wrap);
    });
    els.photoActions.classList.toggle("hidden", state.photos.length === 0);
  }

  async function onPhotoPicked() {
    var files = Array.from(els.photoInput.files || []);
    els.photoInput.value = "";
    if (!files.length) return;
    var pending = files.slice(0, MAX_PHOTOS - state.photos.length);
    if (files.length > pending.length) setPhotoStatus("Solo se guardan hasta " + MAX_PHOTOS + " fotos.");
    for (var i = 0; i < pending.length; i++) {
      try {
        var img = await loadImage(pending[i]);
        var big = toDataUrl(img, MAX_IMG_EDGE);
        var small = toDataUrl(img, ANALYZE_IMG_EDGE);
        if (big.length > 4000000) { setPhotoStatus("Se omitió una foto demasiado pesada."); continue; }
        state.photos.push({ dataUrl: big, small: small });
      } catch (e) { /* archivo inválido, se ignora */ }
    }
    renderPhotoPreviews();
    if (state.photos.length) setPhotoStatus(state.photos.length + " foto(s) añadidas. Puedes analizarlas con IA.");
  }

  function photoSummary() {
    var a = state.photoAnalysis;
    if (!a || a.enabled === false) return "";
    return [
      "Estado del terreno: " + a.estadoTerreno,
      "Topografía: " + a.topografia,
      "Habilitación: " + a.habilitacion,
      "Uso actual: " + a.usoActual,
      "Acceso a vía: " + a.accesoVia,
      "Entorno (1-5): " + a.entorno,
      a.observaciones ? "Observaciones: " + a.observaciones : ""
    ].filter(Boolean).join(". ");
  }

  function renderPhotoResult() {
    var a = state.photoAnalysis;
    if (!a || a.enabled === false) { els.photoResult.classList.add("hidden"); els.photoResult.innerHTML = ""; return; }
    var inputs = readInputs();
    var notes = [];
    if (a.habilitacion === "parcial") notes.push("Terreno parcialmente habilitado → valor del terreno × 0.92");
    if (a.habilitacion === "no_habilitado") notes.push("Terreno sin habilitar → valor del terreno × 0.82");
    if (a.estadoTerreno === "descuidado") notes.push("Terreno descuidado → valor construido × 0.97");
    if (a.estadoTerreno === "con_construccion" || a.estadoTerreno === "en_uso") {
      notes.push("Hay construcción que demoler → valor construido × 0.98 y −S/ " + fmt(inputs.landArea * 120) + " de demolición");
    }
    if (a.topografia === "pendiente") notes.push("Pendiente → +S/ 120 por m² construido");
    if (a.topografia === "desnivel") notes.push("Desnivel → +S/ 180 por m² construido");
    var bonus = Math.round(a.entorno - 3);
    if (bonus !== 0) notes.push("Entorno " + a.entorno + "/5 → precio de venta " + (bonus > 0 ? "+" : "") + bonus + "%");

    els.photoResult.innerHTML =
      '<div class="photo-result-head">' +
        '<span>📷 Análisis de fotos aplicado</span>' +
        '<button type="button" class="photo-result-clear" id="photoResultClear">Quitar</button>' +
      "</div>" +
      '<div class="photo-result-chips">' +
        chip("Estado", a.estadoTerreno) + chip("Topografía", a.topografia) +
        chip("Habilitación", a.habilitacion) + chip("Uso", a.usoActual) +
        chip("Acceso", a.accesoVia) + chip("Entorno", a.entorno + "/5") +
      "</div>" +
      (a.observaciones ? '<p class="photo-result-obs">' + esc(a.observaciones) + "</p>" : "") +
      '<ul class="photo-result-notes">' + notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>";
    els.photoResult.classList.remove("hidden");
    var clearBtn = $("photoResultClear");
    if (clearBtn) clearBtn.addEventListener("click", function () {
      state.photoAnalysis = null;
      renderPhotoResult();
      if (state.location) calc();
    });
  }

  function chip(label, value) {
    return '<span class="photo-chip"><b>' + esc(label) + ":</b> " + esc(value) + "</span>";
  }

  async function analyzePhotos() {
    if (!state.photos.length) { setPhotoStatus("Añade al menos una foto.", true); return; }
    var loc = state.location;
    if (!loc) { setPhotoStatus("Selecciona la ubicación del predio primero.", true); return; }
    state.analyzing = true;
    els.photoAnalyze.disabled = true;
    setPhotoStatus("Analizando " + Math.min(4, state.photos.length) + " foto(s) con IA…");
    els.photoResult.classList.add("hidden");
    try {
      var res = await fetch(apiUrl("/api/analiza-fotos"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          district: loc.district || "",
          city: loc.city || "",
          lat: loc.lat != null ? loc.lat : null,
          lon: loc.lon != null ? loc.lon : null,
          images: state.photos.slice(0, 4).map(function (p) { return p.small || p.dataUrl; })
        })
      });
      var data = await res.json().catch(function () { return {}; });
      if (data && data.enabled !== false) {
        state.photoAnalysis = data;
        setPhotoStatus("Análisis de fotos aplicado al cálculo.");
        renderPhotoResult();
        if (state.location) calc();
      } else {
        state.photoAnalysis = null;
        renderPhotoResult();
        setPhotoStatus("La IA no pudo analizar las fotos: " + ((data && data.reason) || "inténtalo de nuevo."), true);
      }
    } catch (e) {
      state.photoAnalysis = null;
      renderPhotoResult();
      setPhotoStatus("No se pudo conectar con el analizador de fotos.", true);
    }
    state.analyzing = false;
    els.photoAnalyze.disabled = false;
  }


  /* ---------------- Geocodificación (autocomplete) ---------------- */
  var sugTimer = null;
  var sugSeq = 0;

  els.addressInput.addEventListener("input", function () {
    clearTimeout(sugTimer);
    var q = els.addressInput.value.trim();
    if (q.length < 3) { els.suggestions.classList.add("hidden"); return; }
    sugTimer = setTimeout(function () { runSearch(q); }, 350);
  });

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".autocomplete")) hideSuggestions();
  });

  function hideSuggestions() { els.suggestions.classList.add("hidden"); }

  async function runSearch(q) {
    var seq = ++sugSeq;
    try {
      var places = await GEO.search(q);
      if (seq !== sugSeq) return;
      var list = prioritizePlaces(places).slice(0, 6);
      els.suggestions.innerHTML = "";
      if (!list.length) {
        els.suggestions.classList.add("hidden");
        return;
      }
      list.forEach(function (p) {
        var label = GEO.formatAddress(p.address, p.name || p.display_name);
        var d = document.createElement("button");
        d.type = "button";
        d.className = "sug-item";
        d.innerHTML = '<span class="sug-label">' + esc(label) + "</span>";
        d.addEventListener("click", function () { applyPlace(p); hideSuggestions(); });
        els.suggestions.appendChild(d);
      });
      els.suggestions.classList.remove("hidden");
    } catch (e) {
      els.suggestions.classList.add("hidden");
    }
  }

  function applyPlace(place) {
    var loc = placeToLocation(place);
    state.location = loc;
    setMarker(loc.lat, loc.lon);
    els.addressInput.value = GEO.formatAddress(place.address, place.display_name || place.name || "");
    els.zoneLabel.textContent = loc.district || loc.city || "Ubicación";
    els.zoneLabelSub.textContent = GEO.formatAddress(place.address, place.display_name || place.name || "");
    els.zoneLabel.classList.add("set");
    els.mapStatus.textContent = GEO.formatAddress(place.address, place.display_name || place.name || "");
    els.mapStatus.classList.remove("hidden");
    showPanel();
    calc();
  }

  /* ---------------- Prellenado desde tasación ---------------- */
  function prefillFromValuation() {
    try {
      var raw = sessionStorage.getItem("informeSnapshot");
      if (!raw) return;
      var snap = JSON.parse(raw);
      if (!snap || !snap.location) return;
      var loc = snap.location;
      state.location = {
        lat: loc.lat, lon: loc.lon, district: loc.district, city: loc.city,
        state: loc.state, country: loc.country, display: loc.display
      };
      if (loc.lat != null && loc.lon != null) setMarker(loc.lat, loc.lon);
      els.addressInput.value = loc.display || (loc.district || loc.city || "");
      els.zoneLabel.textContent = loc.district || loc.city || "Ubicación";
      els.zoneLabelSub.textContent = "Datos de tu tasación: " + (loc.display || "");
      els.zoneLabel.classList.add("set");
      showPanel();
      if (snap.inputs && snap.inputs.type === "terreno") {
        var a = parseFloat(snap.inputs.area);
        if (a) {
          els.landAreaVal.value = a;
          els.landArea.value = Math.min(a, parseFloat(els.landArea.max));
        }
        updateLabels();
      }
      calc();
    } catch (e) { /* sin prellenado */ }
  }

  /* ---------------- Eventos ---------------- */
  function syncLandArea() {
    var v = parseFloat(els.landAreaVal.value);
    if (isNaN(v) || v <= 0) return;
    v = Math.max(10, Math.min(50000, v));
    var sMin = parseFloat(els.landArea.min);
    var sMax = parseFloat(els.landArea.max);
    els.landArea.value = v < sMin ? sMin : v > sMax ? sMax : v;
  }

  function updateLabels() {
    els.landAreaVal.value = Math.round(parseFloat(els.landArea.value) || 0);
    els.budgetVal.textContent = "S/ " + fmt(parseFloat(els.budget.value));
  }

  els.landArea.addEventListener("input", function () {
    els.landAreaVal.value = Math.round(parseFloat(els.landArea.value));
  });
  els.landAreaVal.addEventListener("input", function () {
    syncLandArea();
  });
  els.budget.addEventListener("input", function () {
    els.budgetVal.textContent = "S/ " + fmt(parseFloat(els.budget.value));
  });
  els.zoning.addEventListener("change", calc);
  if (els.objective) els.objective.addEventListener("change", calc);
  if (els.objetivo) els.objetivo.addEventListener("change", calc);

  els.modeGrid.addEventListener("click", function (e) {
    var card = e.target.closest(".mode-card");
    if (!card) return;
    els.modeGrid.querySelectorAll(".mode-card").forEach(function (c) { c.classList.remove("active"); });
    card.classList.add("active");
    state.mode = card.dataset.mode;
    calc();
  });

  els.calcBtn.addEventListener("click", function () { calc(true); });

  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-open-providers]");
    if (btn) { openProviders(btn.dataset.openProviders); return; }
    if (e.target.closest(".prov-contact")) return;
  });

  els.provClose.addEventListener("click", closeProviders);
  els.provModal.addEventListener("click", function (e) {
    if (e.target === els.provModal) closeProviders();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !els.provModal.classList.contains("hidden")) closeProviders();
  });

  els.photoPick.addEventListener("click", function () { els.photoInput.click(); });
  els.photoInput.addEventListener("change", onPhotoPicked);
  els.photoAnalyze.addEventListener("click", analyzePhotos);
  els.photoPreviews.addEventListener("click", function (e) {
    var btn = e.target.closest(".photo-remove");
    if (!btn) return;
    var idx = Number(btn.dataset.idx);
    state.photos.splice(idx, 1);
    renderPhotoPreviews();
    if (!state.photos.length) state.photoAnalysis = null;
  });

  document.querySelectorAll(".chip").forEach(function (ch) {
    ch.addEventListener("click", function () {
      els.addressInput.value = ch.dataset.ex;
      runSearch(ch.dataset.ex);
    });
  });

  updateLabels();
  prefillFromValuation();
})();
