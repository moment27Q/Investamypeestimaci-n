const GEO = {
  async search(query) {
    try {
      return await GEO._fetchJSON(apiUrl("/api/geocode?q=" + encodeURIComponent(query)));
    } catch (e) {
      if (e.authoritative) throw e;
      return GEO._fetchJSON("https://nominatim.openstreetmap.org/search?format=jsonv2" +
        "&addressdetails=1&countrycodes=pe&limit=8&dedupe=1&accept-language=es&q=" +
        encodeURIComponent(query));
    }
  },

  async reverse(lat, lon) {
    try {
      const data = await GEO._fetchJSON(apiUrl("/api/reverse?lat=" + lat + "&lon=" + lon));
      if (!data.lat) throw new Error("Sin resultado");
      return data;
    } catch (e) {
      if (e.authoritative) throw e;
      const data = await GEO._fetchJSON("https://nominatim.openstreetmap.org/reverse?format=jsonv2" +
        "&addressdetails=1&accept-language=es&lat=" + lat + "&lon=" + lon);
      if (!data.lat) throw new Error("Sin resultado");
      return data;
    }
  },

  _fetchJSON(url) {
    return fetch(url, { headers: { "Accept": "application/json" } })
      .then((res) => {
        if (!res.ok) throw new Error("Geocoder HTTP " + res.status);
        return res.json();
      })
      .then((data) => {
        if (data && data.error) {
          const err = new Error(data.error);
          err.authoritative = true;
          throw err;
        }
        return data;
      });
  },

  formatAddress(a, name) {
    if (!a) return name || "Ubicación";
    const parts = [];
    const street = a.road || a.pedestrian || a.path || a.residential || a.cycleway;
    if (street) {
      parts.push((a.house_number ? a.house_number + " " : "") + street);
    } else if (a.house_number) {
      parts.push(a.house_number);
    }
    const zone = a.suburb || a.neighbourhood || a.city_district || a.municipality || a.town;
    if (zone) parts.push(zone);
    if (a.city && a.city !== zone) parts.push(a.city);
    if (a.state && a.state !== a.city && a.state !== zone) parts.push(a.state);
    if (a.country && a.country !== "Perú" && a.country !== "Peru") parts.push(a.country);
    return parts.join(", ") || name || "Ubicación";
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
function prioritizePlaces(places) {
  const addr = [];
  const other = [];
  for (const p of places) {
    const a = p.address || {};
    if (a.road || a.house_number) addr.push(p);
    else other.push(p);
  }
  return addr.concat(other);
}

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
