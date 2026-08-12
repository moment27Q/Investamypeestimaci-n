(function () {
  "use strict";

  var els = {
    report: document.getElementById("report"),
    sheet: document.getElementById("informeSheet"),
    error: document.getElementById("informeError"),
    btnBack: document.getElementById("btnBack"),
    btnPrint: document.getElementById("btnPrint"),
    btnDocx: document.getElementById("btnDocx"),
    btnErrorBack: document.getElementById("btnErrorBack")
  };

  /* ---------------- Etiquetas ---------------- */
  var TYPE_LABELS = { departamento: "Departamento", casa: "Casa", terreno: "Terreno", local: "Local comercial", oficina: "Oficina", piso: "Piso" };
  var CONDITION_LABELS = { excelente: "Excelente", bueno: "Bueno", regular: "Regular", renovar: "Requiere renovación" };
  var ESTADO_LABELS = { nuevo: "Nuevo", usado: "Usado" };
  var ZONE_LABELS = { auto: "Automática", premium: "Premium", central: "Céntrica", normal: "Normal", periferia: "Periférica" };
  var FINISH_LABELS = { basico: "Básicos", intermedio: "Intermedios", premium: "Premium" };
  var AMENITIES_LABELS = { ninguno: "Ninguno", basico: "Básicos", medio: "Medios", completo: "Completos" };
  var REGIME_LABELS = { independiente: "Independiente", condominio: "Condominio" };
  var SI_NO = { si: "Sí", no: "No" };
  var SHAPE_LABELS = { regular: "Regular", irregular: "Irregular" };
  var TOPO_LABELS = { plana: "Plana", pendiente: "Con pendiente", desnivel: "Con desnivel" };
  var ZONING_LABELS = { residencial: "Residencial", comercial: "Comercial", industrial: "Industrial", mixto: "Mixto" };
  var SERVICES_LABELS = { completo: "Completos", parcial: "Parciales", ninguno: "Ninguno" };
  var URBAN_LABELS = { habilitado: "Urbano habilitado", no_habilitado: "No habilitado" };
  var CORNER_LABELS = { esquina: "Esquina", intermedio: "Intermedio" };

  /* ---------------- Helpers ---------------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmt(v) { return Math.round(v).toLocaleString("es-PE"); }
  function lbl(map, v) { return (map && map[v]) ? map[v] : (v || "—"); }
  function num(n) { return (n == null || n === "") ? "—" : String(n); }
  function siNo(v, yes, no) { return v === "si" ? (yes || "Sí") : (no || "No"); }

  function fill(ph, txt) {
    var content = txt ? esc(txt) : "";
    return '<span class="fill" data-ph="' + esc(ph) + '" contenteditable="true" spellcheck="false">' + content + "</span>";
  }

  function row(l, v) {
    return "<tr><th>" + esc(l) + "</th><td>" + v + "</td></tr>";
  }

  /* ---------------- Descripción textual ---------------- */
  function describeProperty(inputs, district) {
    var t = inputs.type || "departamento";
    var p1 = district || "el distrito indicado";
    if (t === "departamento") {
      return "Se trata de un departamento ubicado en " + p1 + ", con " + num(inputs.area) +
        " m² construidos, " + num(inputs.bedrooms) + " dormitorio(s) y " + num(inputs.bathrooms) +
        " baño(s), en el piso " + num(inputs.floor) + " de un edificio de " +
        (inputs.totalFloors ? num(inputs.totalFloors) : "—") + " piso(s)" +
        (inputs.elevator === "si" ? " con ascensor" : " sin ascensor") + ". " +
        lbl(ESTADO_LABELS, inputs.estado) + ", con aproximadamente " + num(inputs.age) +
        " años de antigüedad, en estado de conservación " + lbl(CONDITION_LABELS, inputs.condition).toLowerCase() +
        " y acabados " + lbl(FINISH_LABELS, inputs.finishes).toLowerCase() + ".";
    }
    if (t === "casa") {
      return "Casa en " + p1 + " con " + num(inputs.area) + " m² construidos sobre un terreno de " +
        num(inputs.terrenoArea || inputs.area) + " m², de " + (inputs.casaFloors ? num(inputs.casaFloors) : "—") +
        " piso(s), " + num(inputs.bedrooms) + " dormitorio(s) y " + num(inputs.bathrooms) +
        " baño(s). " + lbl(ESTADO_LABELS, inputs.estado) + ", aproximadamente " + num(inputs.age) +
        " años de antigüedad, conservación " + lbl(CONDITION_LABELS, inputs.condition).toLowerCase() +
        " y acabados " + lbl(FINISH_LABELS, inputs.finishes).toLowerCase() + ".";
    }
    if (t === "terreno") {
      return "Terreno urbano en " + p1 + " de " + num(inputs.area) + " m², con frente de " +
        num(inputs.front) + " ml, forma " + lbl(SHAPE_LABELS, inputs.shape).toLowerCase() +
        ", topografía " + lbl(TOPO_LABELS, inputs.topography).toLowerCase() + " y zonificación " +
        lbl(ZONING_LABELS, inputs.zoning).toLowerCase() + ". Servicios " +
        lbl(SERVICES_LABELS, inputs.services).toLowerCase() + " a pie de lote; " +
        lbl(URBAN_LABELS, inputs.urbanization).toLowerCase() + ".";
    }
    return (lbl(TYPE_LABELS, t) || "Inmueble") + " en " + p1 + " de " + num(inputs.area) + " m², " +
      lbl(ESTADO_LABELS, inputs.estado) + ", con aproximadamente " + num(inputs.age) +
      " años de antigüedad, en estado de conservación " + lbl(CONDITION_LABELS, inputs.condition).toLowerCase() +
      " y acabados " + lbl(FINISH_LABELS, inputs.finishes).toLowerCase() + ".";
  }

  function caracteristicas(inputs, r, env) {
    var t = inputs.type || "departamento";
    var rows = [
      row("Área", num(r.area) + " m²"),
      row("Estado de conservación", lbl(CONDITION_LABELS, inputs.condition)),
      row("Antigüedad", num(inputs.age) + " años"),
      row("Acabados", lbl(FINISH_LABELS, inputs.finishes))
    ];
    if (t === "departamento") {
      rows.push(row("Dormitorios", num(inputs.bedrooms)));
      rows.push(row("Baños", num(inputs.bathrooms)));
      rows.push(row("Piso / planta", num(inputs.floor)));
      rows.push(row("Pisos del edificio", num(inputs.totalFloors)));
      rows.push(row("Estacionamiento", num(inputs.parking)));
      rows.push(row("Ascensor", siNo(inputs.elevator)));
      rows.push(row("Mantenimiento mensual", "S/ " + num(inputs.maintenance)));
      rows.push(row("Régimen", lbl(REGIME_LABELS, inputs.regime)));
      rows.push(row("Amenities", lbl(AMENITIES_LABELS, inputs.amenities)));
    } else if (t === "casa") {
      rows.push(row("Dormitorios", num(inputs.bedrooms)));
      rows.push(row("Baños", num(inputs.bathrooms)));
      rows.push(row("Pisos de la casa", num(inputs.casaFloors)));
      rows.push(row("Terreno", num(inputs.terrenoArea) + " m²"));
      rows.push(row("Frente del lote", num(inputs.front) + " ml"));
      rows.push(row("Estacionamiento", num(inputs.parking)));
      rows.push(row("Forma del lote", lbl(SHAPE_LABELS, inputs.shape)));
      rows.push(row("Topografía", lbl(TOPO_LABELS, inputs.topography)));
      rows.push(row("Cerco perimetral", siNo(inputs.fence)));
    } else if (t === "terreno") {
      rows.push(row("Frente del lote", num(inputs.front) + " ml"));
      rows.push(row("Forma del lote", lbl(SHAPE_LABELS, inputs.shape)));
      rows.push(row("Topografía", lbl(TOPO_LABELS, inputs.topography)));
      rows.push(row("Zonificación", lbl(ZONING_LABELS, inputs.zoning)));
      rows.push(row("Servicios a pie de lote", lbl(SERVICES_LABELS, inputs.services)));
      rows.push(row("Habilitación urbana", lbl(URBAN_LABELS, inputs.urbanization)));
      rows.push(row("Posición del lote", lbl(CORNER_LABELS, inputs.corner)));
      rows.push(row("Cerca de vía principal", siNo(inputs.road)));
    } else {
      rows.push(row("Dormitorios", num(inputs.bedrooms)));
      rows.push(row("Baños", num(inputs.bathrooms)));
    }
    if (env && env.nse) {
      rows.push(row("Entorno (NSE)", env.nseLabel + " · amenities " + num(env.amenities) + "/5 · servicios " + num(env.services) + "/5"));
    } else {
      rows.push(row("Entorno", "Estándar (factor neutro ×1.00)"));
    }
    rows.push(row("Estado legal / saneamiento", fill("Ej.: saneado, en trámite…", "")));
    return "<table class=\"t\">" + rows.join("") + "</table>";
  }

  /* ---------------- Secciones ---------------- */
  function portada(r, district, state, type, inputs, fecha) {
    var year = new Date().getFullYear();
    return "<div class=\"portada\">" +
      "<p class=\"sub\">TASADOR PERÚ S.A.C. · SERVICIOS DE TASACIÓN</p>" +
      "<h1>Informe de Tasación</h1>" +
      "<p class=\"sub\">INFORME TÉCNICO DE VALORIZACIÓN COMERCIAL</p>" +
      "<p class=\"small\">Reglamento Nacional de Tasaciones del Perú · D.S. N.° 013-2002-VIVIENDA y modificatorias</p>" +
      "<table class=\"t\">" +
      row("N.° de informe", fill("INF-" + year + "-000", "INF-" + year + "-")) +
      row("Fecha de tasación", fill("dd/mm/aaaa", fecha)) +
      row("Tipo de inmueble", lbl(TYPE_LABELS, type)) +
      row("Ubicación", esc(district) + (state ? ", " + esc(state) : "")) +
      row("Área", num(r.area) + " m²") +
      row("Valor comercial estimado", "S/ " + fmt(r.total) + " (" + fmt(r.totalUSD) + " USD)") +
      row("Solicitante", fill("Nombre / entidad", "")) +
      row("Fines de la tasación", fill("Ej.: compraventa, hipoteca, sucesión…", "")) +
      "</table></div>";
  }

  function secIdentificacion(loc, inputs, type, r) {
    var district = loc.district || loc.city || "—";
    var state = loc.state || "—";
    return "<h2>1. Identificación del inmueble</h2>" +
      "<table class=\"t\">" +
      row("Dirección del inmueble", fill("Jr./Av./Calle N.° …", "")) +
      row("Distrito", esc(district)) +
      row("Provincia", fill("Provincia", "")) +
      row("Departamento", esc(state)) +
      row("Referencia catastral", fill("N.° …", "")) +
      row("Partida registral", fill("N.° …", "")) +
      row("Zonificación", lbl(ZONING_LABELS, inputs.zoning)) +
      row("Propietario", fill("Nombre del propietario", "")) +
      row("Tipo de inmueble", lbl(TYPE_LABELS, type)) +
      row("Área", num(r.area) + " m²") +
      row("Antigüedad", num(inputs.age) + " años") +
      "</table>";
  }

  function secDescripcion(loc, inputs, env) {
    return "<h2>2. Descripción del inmueble</h2>" +
      "<p>" + esc(describeProperty(inputs, loc.district || loc.city)) + "</p>" +
      "<h3>2.1 Características</h3>" +
      caracteristicas(inputs, { area: inputs.area }, env) +
      "<h3>2.2 Entorno y servicios</h3>" +
      (env && env.rationale
        ? "<p>" + esc(env.rationale) + "</p>"
        : "<p>Entorno socioeconómico estándar; se aplica un factor neutro sobre el valor base.</p>");
  }

  function secMetodologia(r) {
    var rows = r.factors.map(function (f) {
      if (f.pct === null) {
        return row(f.label, "S/ " + fmt(r.basePerM2) + "/m²");
      }
      var s = f.pct > 0 ? "+" : "";
      return row(f.label, "×" + f.factor.toFixed(2) + " (" + s + f.pct.toFixed(1) + "%)");
    });
    return "<h2>3. Metodología aplicada</h2>" +
      "<p>Se aplica el <strong>método de comparación directa</strong> previsto en el Reglamento Nacional de " +
      "Tasaciones del Perú: el valor unitario de referencia del mercado (S/ " + fmt(r.basePerM2) +
      "/m²) se ajusta mediante factores de homogeneización que corrigen diferencias de tamaño, edad, " +
      "conservación, ubicación y entorno, obteniéndose un valor unitario efectivo de S/ " +
      fmt(r.effectivePerM2) + "/m².</p>" +
      "<h3>3.1 Ajustes de homogeneización</h3>" +
      "<table class=\"t\">" + rows.join("") +
      "<tr class=\"tot\"><th>Valor unitario efectivo</th><td>S/ " + fmt(r.effectivePerM2) + "/m²</td></tr>" +
      "</table>" +
      "<p>Valor comercial = " + fmt(r.effectivePerM2) + " S//m² × " + fmt(r.area) + " m² = <strong>S/ " +
      fmt(r.total) + "</strong>.</p>";
  }

  function secMercado(r, rent, market, rentMarket) {
    var html = "<h2>4. Análisis de mercado</h2>";
    html += "<p>" + esc(r.confidenceMsg) + "</p>";

    var listings = (market && market.listings && market.listings.length) ? market.listings : [];
    if (listings.length) {
      html += "<h3>4.1 Avisos comparables de venta</h3>" +
        "<table class=\"t\"><tr><th>Descripción</th><th>Área</th><th>Precio</th><th>S//m²</th><th>Fuente</th></tr>";
      listings.slice(0, 6).forEach(function (l) {
        var meta = [];
        if (l.bedrooms != null) meta.push(l.bedrooms + " dorm.");
        if (l.bathrooms != null) meta.push(l.bathrooms + " baños");
        var desc = esc(l.title || "") + (meta.length ? " · " + meta.join(" · ") : "");
        html += "<tr><td>" + (desc || "—") + "</td><td>" + num(l.area) + " m²</td><td>S/ " +
          fmt(l.price) + "</td><td>S/ " + fmt(l.pricePerM2) + "</td><td>" + esc(l.source || "—") + "</td></tr>";
      });
      html += "</table>";
    }

    if (market && market.count >= 3) {
      html += "<p>Mediana de mercado: <strong>S/ " + fmt(market.medianPerM2) + "/m²</strong> (de S/ " +
        fmt(market.minPerM2) + " a S/ " + fmt(market.maxPerM2) + "/m²). Fuentes: " +
        esc((market.sources || []).join(", ")) + ".</p>";
    }

    html += "<h3>4.2 Valor de alquiler mensual</h3>" +
      "<p>La renta mensual estimada del inmueble asciende a <strong>S/ " + fmt(rent.monthly) +
      "</strong> (≈ " + fmt(rent.monthlyUSD) + " USD), lo que equivale a S/ " +
      fmt(rent.effectiveRentPerM2) + "/m²/mes.</p>";

    var rList = (rentMarket && rentMarket.listings && rentMarket.listings.length) ? rentMarket.listings : [];
    if (rList.length) {
      html += "<table class=\"t\"><tr><th>Descripción</th><th>Área</th><th>Renta</th><th>S//m²/mes</th><th>Fuente</th></tr>";
      rList.slice(0, 5).forEach(function (l) {
        html += "<tr><td>" + esc(l.title || "—") + "</td><td>" + num(l.area) + " m²</td><td>S/ " +
          fmt(l.price) + "</td><td>S/ " + fmt(l.pricePerM2) + "</td><td>" + esc(l.source || "—") + "</td></tr>";
      });
      html += "</table>";
    }
    return html;
  }

  function secValor(r, rent) {
    return "<h2>5. Valor de tasación</h2>" +
      "<table class=\"t\">" +
      row("Valor comercial", "<strong>S/ " + fmt(r.total) + "</strong>") +
      row("Valor en dólares americanos", fmt(r.totalUSD) + " USD") +
      row("Rango probable de mercado", "S/ " + fmt(r.rangeLow) + " — S/ " + fmt(r.rangeHigh)) +
      row("Valor unitario efectivo", "S/ " + fmt(r.effectivePerM2) + "/m²") +
      row("Valor de realización rápida", "S/ " + fmt(r.realizationTotal) + " (≈ " + fmt(r.realizationTotalUSD) + " USD)") +
      row("Renta mensual estimada", "S/ " + fmt(rent.monthly)) +
      "</table>" +
      "<h3>5.1 Croquis de ubicación</h3>" +
      "<div class=\"croquis\" contenteditable=\"true\" spellcheck=\"false\">CROQUIS / PLANO DE UBICACIÓN<br>(dibujar o describir la ubicación referencial)</div>";
  }

  function secConclusiones() {
    return "<h2>6. Conclusiones y limitaciones</h2>" +
      "<ul>" +
      "<li>El presente informe se emite conforme al Reglamento Nacional de Tasaciones del Perú (D.S. N.° 013-2002-VIVIENDA) y sus modificatorias.</li>" +
      "<li>La valoración responde a un análisis de mercado comparativo (método directo), sobre la base de avisos ofertados y de la base de datos del sistema.</li>" +
      "<li>El valor corresponde a condiciones de mercado a la fecha del informe; el valor de realización considera una venta en plazo reducido.</li>" +
      "<li>Se recomienda la verificación catastral, registral y la visita de inspección física antes de la firma definitiva del informe.</li>" +
      "<li>Los datos personales se tratarán conforme a la Ley N.° 29733 (protección de datos personales).</li>" +
      "<li>El valor aquí señalado es referencial y no constituye garantía de realización futura.</li>" +
      "</ul>";
  }

  function secFirmas() {
    return "<h2>7. Firmas</h2>" +
      "<div class=\"firmas\">" +
      "<div class=\"firma\">" +
      "<p class=\"linea\">El tasador</p>" +
      "<p>Nombre y apellidos: " + fill("Nombre y apellidos", "") + "</p>" +
      "<p>Registro C.N.A. / R.N.T.: " + fill("N.° de registro", "") + "</p>" +
      "<p>DNI: " + fill("DNI", "") + "</p>" +
      "<p class=\"firma-firma\">Firma y sello</p>" +
      "</div>" +
      "<div class=\"firma\">" +
      "<p class=\"linea\">Coordinador de tasaciones</p>" +
      "<p>Nombre y apellidos: " + fill("Nombre y apellidos", "") + "</p>" +
      "<p>Registro C.N.A. / R.N.T.: " + fill("N.° de registro", "") + "</p>" +
      "<p>DNI: " + fill("DNI", "") + "</p>" +
      "<p class=\"firma-firma\">Firma y sello</p>" +
      "</div>" +
      "</div>";
  }

  /* ---------------- Ensamblado ---------------- */
  function buildReport(snap) {
    var loc = snap.location || {};
    var inputs = snap.inputs || {};
    var env = snap.envProfile;
    var r = computeValuation(loc, inputs, snap.market, env);
    var rent = computeRent(loc, inputs, snap.rentMarket, env);
    var type = inputs.type || "departamento";
    var district = loc.district || loc.city || "—";
    var state = loc.state || "";
    var fecha = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });

    return [
      portada(r, district, state, type, inputs, fecha),
      "<div class=\"pagebreak\"></div>",
      secIdentificacion(loc, inputs, type, r),
      secDescripcion(loc, inputs, env),
      secMetodologia(r),
      secMercado(r, rent, snap.market, snap.rentMarket),
      secValor(r, rent),
      secConclusiones(),
      secFirmas()
    ].join("\n");
  }

  /* ---------------- Inicialización ---------------- */
  function init() {
    els.btnBack.addEventListener("click", function () {
      if (document.referrer && document.referrer.indexOf(location.host) !== -1) history.back();
      else location.href = "index.html";
    });
    els.btnErrorBack.addEventListener("click", function () { location.href = "index.html"; });
    els.btnPrint.addEventListener("click", function () { window.print(); });
    els.btnDocx.addEventListener("click", function () {
      try {
        var blob = generateWordDoc(els.report);
        var slug = "Informe-Tasacion-" + new Date().toISOString().slice(0, 10) + ".docx";
        saveAs(blob, slug);
      } catch (e) {
        alert("No se pudo generar el documento Word: " + e.message);
      }
    });

    var raw = null;
    try { raw = sessionStorage.getItem("informeSnapshot"); } catch (e) { raw = null; }
    if (!raw) {
      els.sheet.classList.add("hidden");
      els.error.classList.remove("hidden");
      els.btnDocx.classList.add("hidden");
      els.btnPrint.classList.add("hidden");
      return;
    }
    var snap = null;
    try { snap = JSON.parse(raw); } catch (e) { snap = null; }
    if (!snap || !snap.location) {
      els.sheet.classList.add("hidden");
      els.error.classList.remove("hidden");
      els.btnDocx.classList.add("hidden");
      els.btnPrint.classList.add("hidden");
      return;
    }
    els.report.innerHTML = buildReport(snap);
  }

  init();
})();
