(function () {
  const $ = (id) => document.getElementById(id);
  const els = {
    input: $("addressInput"),
    suggestions: $("suggestions"),
    grid: $("projectsGrid"),
    status: $("projectsStatus"),
    listingModal: $("listingModal"),
    lmSource: $("lmSource"),
    lmBody: $("lmBody"),
    lmClose: $("lmClose")
  };

  const fmt = (n) => Math.round(n).toLocaleString("es-PE");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let current = null;
  let seq = 0;

  const params = new URLSearchParams(location.search);
  const initDistrict = params.get("district");
  const initCity = params.get("city");
  if (initDistrict || initCity) {
    current = { district: initDistrict || "", city: initCity || "" };
    els.input.value = initDistrict || initCity;
    fetchProjects();
  }

  /* ---------------- Autocompletado ---------------- */
  let debounceTimer = null;

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

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".autocomplete")) hideSuggestions();
  });

  document.querySelectorAll(".chip[data-ex]").forEach((c) => {
    c.addEventListener("click", () => {
      els.input.value = c.dataset.ex;
      runSearch(c.dataset.ex, true);
    });
  });

  async function runSearch(q, autoSelect) {
    try {
      const places = prioritizePlaces(await GEO.search(q));
      if (els.input.value.trim() !== q) return;
      renderSuggestions(places);
      if (autoSelect && places.length) {
        els.input.value = GEO.formatAddress(places[0].address, places[0].display_name);
        applyPlace(places[0]);
        hideSuggestions();
      }
    } catch (e) {
      showStatus("No se pudo conectar con el buscador. Reintenta.", true);
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

  function applyPlace(place) {
    const loc = placeToLocation(place);
    current = { district: loc.district || "", city: loc.city || "" };
    fetchProjects();
  }

  /* ---------------- Búsqueda de proyectos ---------------- */
  async function fetchProjects() {
    const loc = current;
    if (!loc || (!loc.district && !loc.city)) return;
    const mySeq = ++seq;
    els.grid.innerHTML = "";
    showStatus("Buscando proyectos nuevos en " + (loc.district || loc.city) + "… esto puede tardar 10–40 s.");

    try {
      const p = new URLSearchParams({ district: loc.district || "", city: loc.city || "", all: "1" });
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60000);
      let res;
      try {
        res = await fetch("/api/nexo?" + p.toString(), { signal: ctrl.signal });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (mySeq !== seq) return;
      render(data);
    } catch (e) {
      if (mySeq !== seq) return;
      showStatus("No se pudieron obtener proyectos de Nexo Inmobiliario. Intenta de nuevo.", true);
    }
  }

  function render(data) {
    const zone = data.district || data.city || "la zona";
    els.grid.innerHTML = "";
    if (!data.count) {
      showStatus("No se encontraron proyectos nuevos de Nexo Inmobiliario en " + zone + ".");
      return;
    }
    showStatus(data.count + " proyectos en " + zone + ": desde S/ " + fmt(data.minPrice) +
      " hasta S/ " + fmt(data.maxPrice) + ". Fuente: Nexo Inmobiliario.");

    data.projects.forEach((p) => {
      const card = document.createElement("article");
      card.className = "project-card";

      const media = document.createElement("div");
      media.className = "pc-media";
      if (p.image) {
        const img = document.createElement("img");
        img.loading = "lazy";
        img.src = p.image;
        img.onerror = () => { img.style.display = "none"; };
        media.appendChild(img);
      }
      const phase = document.createElement("span");
      phase.className = "pc-phase";
      phase.textContent = p.phase;
      media.appendChild(phase);

      const body = document.createElement("div");
      body.className = "pc-body";

      const name = document.createElement("div");
      name.className = "pc-name";
      name.textContent = p.name;

      const price = document.createElement("div");
      price.className = "pc-price";
      price.textContent = "Desde S/ " + fmt(p.priceFrom);

      const meta = [];
      if (p.areaMin != null && p.areaMax != null) meta.push(p.areaMin + "–" + p.areaMax + " m²");
      else if (p.areaMin != null) meta.push(p.areaMin + " m²");
      if (p.bedroomsMin != null && p.bedroomsMax != null) meta.push(p.bedroomsMin + "–" + p.bedroomsMax + " dorm.");
      const metaDiv = document.createElement("div");
      metaDiv.className = "pc-meta";
      metaDiv.textContent = meta.join(" · ");

      const actions = document.createElement("div");
      actions.className = "pc-actions";
      const open = document.createElement("a");
      open.className = "pc-btn pc-open";
      open.textContent = "Ver en Nexo ↗";
      open.target = "_blank";
      open.rel = "noopener";
      if (p.url) open.href = p.url;
      const photos = document.createElement("button");
      photos.type = "button";
      photos.className = "pc-btn pc-photos";
      photos.textContent = "Fotos";
      photos.addEventListener("click", () => openModal(p));

      body.appendChild(name);
      body.appendChild(price);
      body.appendChild(metaDiv);
      if (p.builder) {
        const b = document.createElement("div");
        b.className = "pc-builder";
        b.textContent = p.builder;
        body.appendChild(b);
      }
      actions.appendChild(open);
      actions.appendChild(photos);
      body.appendChild(actions);

      card.appendChild(media);
      card.appendChild(body);
      els.grid.appendChild(card);
    });
  }

  function showStatus(msg, isError) {
    els.status.classList.remove("hidden");
    els.status.classList.toggle("error", !!isError);
    els.status.textContent = msg;
  }

  /* ---------------- Modal de fotos ---------------- */
  function openModal(p) {
    els.listingModal.classList.remove("hidden");
    document.body.classList.add("no-scroll");
    els.lmSource.textContent = "Nexo Inmobiliario · proyecto nuevo";
    renderModal(p, null);
    if (p.url) {
      fetch("/api/listing-detail?url=" + encodeURIComponent(p.url))
        .then((res) => res.json())
        .then((d) => {
          if (els.listingModal.classList.contains("hidden")) return;
          renderModal(p, d);
        })
        .catch(() => {});
    }
  }

  function renderModal(p, detail) {
    const meta = [];
    if (p.areaMin != null && p.areaMax != null) meta.push(p.areaMin + "–" + p.areaMax + " m²");
    else if (p.areaMin != null) meta.push(p.areaMin + " m²");
    if (p.bedroomsMin != null && p.bedroomsMax != null) meta.push(p.bedroomsMin + "–" + p.bedroomsMax + " dorm.");
    if (p.phase) meta.push(p.phase);

    const images = detail && detail.images && detail.images.length ? detail.images : p.image ? [p.image] : [];
    const gal = images.length
      ? '<div class="lm-gallery"><img class="lm-main" src="' + esc(images[0]) +
        '" alt="Proyecto" onerror="this.closest(\'.lm-gallery\').style.display=\'none\'">' +
        (images.length > 1
          ? '<div class="lm-thumbs">' + images.slice(1, 6).map((s) =>
              '<img src="' + esc(s) + '" alt="Foto" loading="lazy" onerror="this.style.display=\'none\'">'
            ).join("") + "</div>"
          : "") +
        "</div>"
      : '<div class="lm-gallery lm-placeholder">Sin imágenes disponibles</div>';

    const detailHtml =
      detail && detail.description
        ? '<p class="lm-desc">' + esc(detail.description) + "</p>"
        : "";

    const openBtn = p.url
      ? '<a class="lm-open" href="' + esc(p.url) + '" target="_blank" rel="noopener">Ver proyecto original ↗</a>'
      : "";

    const where = [p.direccion, p.distrito].filter(Boolean).join(", ");

    els.lmBody.innerHTML =
      '<div class="lm-grid">' +
        '<div class="lm-media">' + gal + openBtn + "</div>" +
        '<div class="lm-info">' +
          '<h4>' + esc(p.name) + "</h4>" +
          '<div class="lm-prices">' +
            '<div class="lm-ask"><span class="lm-k">Precio desde (proyecto)</span>' +
            '<span class="lm-ask-v">S/ ' + fmt(p.priceFrom) + '</span>' +
            '<span class="lm-ask-m2">' + esc(meta.join(" · ")) + "</span></div>" +
            (p.builder
              ? '<div class="lm-est"><span class="lm-k">Inmobiliaria</span>' +
                '<span class="lm-est-v">' + esc(p.builder) + '</span>' +
                (where ? '<span class="lm-est-m2">' + esc(where) + "</span>" : "") +
                "</div>"
              : "") +
          "</div>" +
          detailHtml +
        "</div>" +
      "</div>";
  }

  els.lmClose.addEventListener("click", closeModal);
  els.listingModal.addEventListener("click", (e) => {
    if (e.target === els.listingModal) closeModal();
  });
  els.lmBody.addEventListener("click", (e) => {
    const t = e.target.closest(".lm-thumbs img");
    if (!t) return;
    const main = els.lmBody.querySelector(".lm-main");
    if (main) main.src = t.src;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.listingModal.classList.contains("hidden")) closeModal();
  });

  function closeModal() {
    els.listingModal.classList.add("hidden");
    document.body.classList.remove("no-scroll");
  }
})();
