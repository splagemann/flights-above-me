const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const OPENSKY_URL = 'https://opensky-network.org/api/states/all';
const ADSBDB_URL = 'https://api.adsbdb.com/v0/callsign';
const routeCache = new Map();
const ROUTE_CACHE_MS = 10 * 60 * 1000;

app.use(express.static(path.join(__dirname, 'public')));

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function createBoundingBox(lat, lon) {
  const latDelta = 0.8;
  const lonDelta = Math.max(0.8, 0.8 / Math.cos(toRadians(Math.max(Math.min(lat, 85), -85))));
  return {
    lamin: Math.max(-90, lat - latDelta),
    lamax: Math.min(90, lat + latDelta),
    lomin: Math.max(-180, lon - lonDelta),
    lomax: Math.min(180, lon + lonDelta)
  };
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function parseNumberParam(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return isFiniteNumber(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseBounds(query, fallbackLat, fallbackLon) {
  const lamin = parseNumberParam(query.lamin);
  const lamax = parseNumberParam(query.lamax);
  const lomin = parseNumberParam(query.lomin);
  const lomax = parseNumberParam(query.lomax);

  if ([lamin, lamax, lomin, lomax].every((value) => value != null)) {
    const south = clamp(Math.min(lamin, lamax), -90, 90);
    const north = clamp(Math.max(lamin, lamax), -90, 90);
    const west = clamp(Math.min(lomin, lomax), -180, 180);
    const east = clamp(Math.max(lomin, lomax), -180, 180);

    if (south === north || west === east) return null;
    return { lamin: south, lamax: north, lomin: west, lomax: east };
  }

  return createBoundingBox(fallbackLat, fallbackLon);
}

function normalizeAircraft(state, userLat, userLon) {
  const [
    icao24,
    callsign,
    originCountry,
    ,
    lastContact,
    longitude,
    latitude,
    baroAltitude,
    onGround,
    velocity,
    trueTrack,
    verticalRate,
    sensors,
    geoAltitude,
    squawk,
    spi,
    positionSource
  ] = state;

  if (latitude == null || longitude == null) {
    return null;
  }

  const distanceKm = haversineKm(userLat, userLon, latitude, longitude);
  const altitudeMeters = baroAltitude ?? geoAltitude ?? null;

  return {
    icao24,
    callsign: callsign?.trim() || 'Unknown',
    originCountry,
    latitude,
    longitude,
    baroAltitude,
    geoAltitude,
    altitudeMeters,
    onGround: Boolean(onGround),
    velocity,
    heading: trueTrack,
    verticalRate,
    lastContact,
    sensors,
    squawk,
    spi,
    positionSource,
    distanceKm
  };
}

function scoreAircraft(aircraft) {
  let score = aircraft.distanceKm;
  if (aircraft.onGround) score += 25;
  if (!aircraft.onGround) score -= 1.5;
  if (aircraft.altitudeMeters != null) score -= 0.75;
  if (aircraft.altitudeMeters != null && aircraft.altitudeMeters < 14000) score -= 0.25;
  return score;
}

function numberFromKeys(source, keys) {
  for (const key of keys) {
    const parsed = parseNumberParam(source?.[key]);
    if (parsed != null) return parsed;
  }
  return null;
}

function normalizeAirport(airport) {
  if (!airport) return null;
  return {
    icao: airport.icao_code || airport.icao || null,
    iata: airport.iata_code || airport.iata || null,
    name: airport.name || null,
    municipality: airport.municipality || null,
    country: airport.country_name || airport.country || null,
    latitude: numberFromKeys(airport, ['latitude', 'lat', 'latitude_deg']),
    longitude: numberFromKeys(airport, ['longitude', 'lon', 'lng', 'longitude_deg'])
  };
}

function normalizeRoute(flightroute) {
  if (!flightroute?.origin || !flightroute?.destination) return null;
  return {
    callsign: flightroute.callsign || null,
    airline: flightroute.airline?.name || null,
    origin: normalizeAirport(flightroute.origin),
    destination: normalizeAirport(flightroute.destination)
  };
}

async function fetchRouteForCallsign(callsign) {
  const cleaned = callsign?.trim()?.toUpperCase();
  if (!cleaned || cleaned === 'UNKNOWN') return null;

  const cached = routeCache.get(cleaned);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const response = await fetch(`${ADSBDB_URL}/${encodeURIComponent(cleaned)}`, {
      headers: { 'User-Agent': 'flights-above-me/1.0' }
    });

    if (!response.ok) {
      if (response.status === 404) {
        routeCache.set(cleaned, { value: null, expiresAt: Date.now() + ROUTE_CACHE_MS });
        return null;
      }
      throw new Error(`ADSBDB request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const route = normalizeRoute(payload?.response?.flightroute);
    routeCache.set(cleaned, { value: route, expiresAt: Date.now() + ROUTE_CACHE_MS });
    return route;
  } catch (_error) {
    return null;
  }
}

app.get('/api/flights', async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) {
    return res.status(400).json({ error: 'lat and lon query params are required numbers' });
  }

  const bounds = parseBounds(req.query, lat, lon);
  if (!bounds) {
    return res.status(400).json({ error: 'bounds query params must describe a non-empty map view' });
  }

  const url = new URL(OPENSKY_URL);
  Object.entries(bounds).forEach(([key, value]) => url.searchParams.set(key, value));

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'flights-above-me/1.0'
      }
    });

    if (!response.ok) {
      return res.status(502).json({ error: `OpenSky request failed with status ${response.status}` });
    }

    const payload = await response.json();
    const aircraft = (payload.states || [])
      .map((state) => normalizeAircraft(state, lat, lon))
      .filter(Boolean)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const overhead = aircraft.length
      ? [...aircraft].sort((a, b) => scoreAircraft(a) - scoreAircraft(b))[0]
      : null;

    res.json({
      timestamp: payload.time,
      userLocation: { lat, lon },
      bounds,
      overhead,
      aircraft
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unknown error while fetching OpenSky data' });
  }
});

app.get('/api/routes/:callsign', async (req, res) => {
  try {
    const route = await fetchRouteForCallsign(req.params.callsign);
    res.json({ route });
  } catch (error) {
    console.error('Route fetch error:', error);
    res.status(502).json({ error: 'Route konnte nicht geladen werden' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`flights-above-me listening on http://localhost:${PORT}`);
});
