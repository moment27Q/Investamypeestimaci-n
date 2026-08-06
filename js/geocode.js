const GEO = {
  searchUrl: "https://nominatim.openstreetmap.org/search",
  reverseUrl: "https://nominatim.openstreetmap.org/reverse",
  lastRequest: 0,

  async _fetch(url) {
    const now = Date.now();
    const wait = Math.max(0, 1000 - (now - this.lastRequest));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequest = Date.now();
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) throw new Error("Error de geocodificación (" + res.status + ")");
    return res.json();
  },

  async search(query) {
    const q = encodeURIComponent(query);
    const url = this.searchUrl +
      "?format=jsonv2&addressdetails=1&countrycodes=pe&limit=6&accept-language=es&q=" + q;
    return this._fetch(url);
  },

  async reverse(lat, lon) {
    const url = this.reverseUrl +
      "?format=jsonv2&addressdetails=1&accept-language=es&lat=" + lat + "&lon=" + lon;
    return this._fetch(url);
  },

  parseAddress(addr) {
    if (!addr) return { district: null, city: null, state: null, country: null };
    const district = matchDistrictName([
      addr.suburb, addr.city_district, addr.neighbourhood,
      addr.town, addr.municipality, addr.city, addr.county
    ]);
    let city = matchCityName([
      addr.city, addr.town, addr.municipality, addr.city_district, addr.county, addr.state
    ]);
    if (!city) {
      const cityKey = normalize(addr.city || addr.town || "");
      if (cityKey === "lima" || cityKey === "callao") city = cityKey;
    }
    return {
      district: district,
      city: city,
      state: addr.state || null,
      country: addr.country || null,
      display: addr["display_name"] || null
    };
  }
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

function matchDistrictName(fields) {
  for (const f of fields) {
    if (!f) continue;
    const n = normalize(f);
    if (DATA.aliases[n]) return DATA.aliases[n];
    for (const key in DATA.districts) {
      if (normalize(key) === n) return key;
    }
  }
  return null;
}

function matchCityName(fields) {
  for (const f of fields) {
    if (!f) continue;
    const n = normalize(f);
    for (const key in DATA.cities) {
      if (normalize(key) === n) return key;
    }
    if (n === "lima" || n === "callao") return n;
  }
  return null;
}

function placeToLocation(place) {
  const p = place.address || {};
  const parsed = GEO.parseAddress(p);
  let district = parsed.district;
  let city = parsed.city;

  if (!district && DATA.provinceCities[normalize(p.suburb)]) {
    const pc = DATA.provinceCities[normalize(p.suburb)];
    city = pc.city;
  }

  if (!district) {
    // Reintentar con ciudad
    city = matchCityName([
      p.city, p.town, p.suburb, p.municipality, p.city_district, p.county
    ]);
    if (!city) city = parsed.city;
  }

  return {
    lat: parseFloat(place.lat),
    lon: parseFloat(place.lon),
    district: district,
    city: city,
    state: parsed.state,
    country: parsed.country,
    display: place.display_name || parsed.display
  };
}
