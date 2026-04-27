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

function normalizeRoute(flightroute) {
  if (!flightroute?.origin || !flightroute?.destination) return null;
  return {
    callsign: flightroute.callsign || null,
    airline: flightroute.airline?.name || null,
    origin: {
      icao: flightroute.origin.icao_code || null,
      iata: flightroute.origin.iata_code || null,
      name: flightroute.origin.name || null,
      municipality: flightroute.origin.municipality || null,
      country: flightroute.origin.country_name || null
    },
    destination: {
      icao: flightroute.destination.icao_code || null,
      iata: flightroute.destination.iata_code || null,
      name: flightroute.destination.name || null,
      municipality: flightroute.destination.municipality || null,
      country: flightroute.destination.country_name || null
    }
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

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return res.status(400).json({ error: 'lat and lon query params are required numbers' });
  }

  const bounds = createBoundingBox(lat, lon);
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

    if (overhead) {
      overhead.route = await fetchRouteForCallsign(overhead.callsign);
    }

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

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`flights-above-me listening on http://localhost:${PORT}`);
});
