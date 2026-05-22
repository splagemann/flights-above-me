const statusEl = document.getElementById('status');
const locationEl = document.getElementById('location');
const updatedEl = document.getElementById('updated');
const aircraftCountEl = document.getElementById('aircraftCount');
const refreshButton = document.getElementById('refreshButton');
const emptyStateEl = document.getElementById('emptyState');
const detailsListEl = document.getElementById('detailsList');

const fields = {
  callsign: document.getElementById('callsign'),
  icao24: document.getElementById('icao24'),
  country: document.getElementById('country'),
  route: document.getElementById('route'),
  origin: document.getElementById('origin'),
  destination: document.getElementById('destination'),
  distance: document.getElementById('distance'),
  altitude: document.getElementById('altitude'),
  velocity: document.getElementById('velocity'),
  heading: document.getElementById('heading'),
  lastContact: document.getElementById('lastContact')
};

const map = L.map('map', {
  zoomControl: true
}).setView([48.2082, 16.3738], 8);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let userMarker;
let aircraftLayer = L.layerGroup().addTo(map);
let routeLayer = L.layerGroup().addTo(map);
let currentPosition;
let currentFlights = [];
let currentOverhead;
let selectedFlightId;
let selectedRouteRequestId = 0;
let refreshTimer;
let moveRefreshTimer;
const routeCache = new Map();

function formatNumber(value, digits = 0) {
  if (value == null || Number.isNaN(value)) return '-';
  return new Intl.NumberFormat('de-AT', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  }).format(value);
}

function formatDistance(km) {
  if (km == null) return '-';
  return `${formatNumber(km, km < 10 ? 2 : 1)} km`;
}

function formatAltitude(meters) {
  if (meters == null) return '-';
  const feet = meters * 3.28084;
  return `${formatNumber(meters, 0)} m / ${formatNumber(feet, 0)} ft`;
}

function formatVelocity(ms) {
  if (ms == null) return '-';
  return `${formatNumber(ms * 3.6, 0)} km/h`;
}

function formatHeading(heading) {
  if (heading == null) return '-';
  return `${formatNumber(heading, 0)}°`;
}

function formatTimestamp(unixSeconds) {
  if (!unixSeconds) return '-';
  return new Date(unixSeconds * 1000).toLocaleTimeString('de-AT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? 'var(--danger)' : 'var(--text)';
}

function setLocation(lat, lon) {
  locationEl.textContent = `${formatNumber(lat, 4)}, ${formatNumber(lon, 4)}`;
}

function updateUserVisuals(lat, lon) {
  const latLng = [lat, lon];
  if (!userMarker) {
    userMarker = L.circleMarker(latLng, {
      radius: 8,
      color: '#ffffff',
      weight: 2,
      fillColor: '#0077ff',
      fillOpacity: 0.95
    }).addTo(map).bindPopup('Du bist hier');
  } else {
    userMarker.setLatLng(latLng);
  }
}

function getFlightId(aircraft) {
  return aircraft.icao24 || aircraft.callsign;
}

function getRouteKey(aircraft) {
  return aircraft.callsign?.trim()?.toUpperCase();
}

function formatAirport(airport) {
  if (!airport) return '-';
  const code = airport.iata || airport.icao || '???';
  const city = airport.municipality || airport.country || null;
  const name = airport.name || null;
  return [code, city, name].filter(Boolean).join(' · ');
}

function formatRouteShort(route) {
  if (!route) return '-';
  const origin = route.origin?.iata || route.origin?.icao || '???';
  const destination = route.destination?.iata || route.destination?.icao || '???';
  return `${origin} -> ${destination}`;
}

function buildPopupContent(aircraft, route) {
  return `
    <div class="flight-popup">
      <strong>${escapeHtml(aircraft.callsign)}</strong><br />
      ${escapeHtml(aircraft.originCountry || '-')}<br />
      Von: ${escapeHtml(formatAirport(route?.origin))}<br />
      Nach: ${escapeHtml(formatAirport(route?.destination))}<br />
      Distanz: ${escapeHtml(formatDistance(aircraft.distanceKm))}<br />
      Höhe: ${escapeHtml(formatAltitude(aircraft.altitudeMeters))}
    </div>
  `;
}

function createAircraftIcon(heading, isOverhead, isSelected) {
  const color = isOverhead ? '#ffd166' : '#ff3b30';
  const strokeColor = isSelected ? '#ffffff' : '#07111f';
  const strokeWidth = isSelected ? 1.5 : 1;
  const size = isOverhead || isSelected ? 28 : 22;
  const rotation = heading ?? 0;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}"><g transform="rotate(${rotation},12,12)"><path d="M12 2 L14.5 10 L22 11.5 L14.5 13.5 L16 21 L12 19 L8 21 L9.5 13.5 L2 11.5 L9.5 10 Z" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linejoin="round"/></g></svg>`;

  return L.divIcon({
    html: svg,
    className: 'aircraft-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2)]
  });
}

function getBoundsQuery() {
  const bounds = map.getBounds();
  return new URLSearchParams({
    lat: currentPosition.lat,
    lon: currentPosition.lon,
    lamin: bounds.getSouth(),
    lamax: bounds.getNorth(),
    lomin: bounds.getWest(),
    lomax: bounds.getEast()
  });
}

function clearRouteLines() {
  routeLayer.clearLayers();
}

function drawRouteLines(aircraft, route) {
  clearRouteLines();
  if (!aircraft || !route) return;

  const aircraftLatLng = [aircraft.latitude, aircraft.longitude];
  const endpoints = [
    { airport: route.origin, color: '#19d3a2' },
    { airport: route.destination, color: '#ff7a59' }
  ];

  endpoints.forEach(({ airport, color }) => {
    if (airport?.latitude == null || airport?.longitude == null) return;
    L.polyline([aircraftLatLng, [airport.latitude, airport.longitude]], {
      color,
      weight: 3,
      opacity: 0.9,
      dashArray: '7 8'
    }).addTo(routeLayer);
  });
}

function renderDetails(aircraft) {
  if (!aircraft) {
    emptyStateEl.classList.remove('hidden');
    detailsListEl.classList.add('hidden');
    return;
  }

  emptyStateEl.classList.add('hidden');
  detailsListEl.classList.remove('hidden');
  fields.callsign.textContent = aircraft.callsign;
  fields.icao24.textContent = aircraft.icao24;
  fields.country.textContent = aircraft.originCountry;
  fields.route.textContent = formatRouteShort(aircraft.route);
  fields.origin.textContent = formatAirport(aircraft.route?.origin);
  fields.destination.textContent = formatAirport(aircraft.route?.destination);
  fields.distance.textContent = formatDistance(aircraft.distanceKm);
  fields.altitude.textContent = formatAltitude(aircraft.altitudeMeters);
  fields.velocity.textContent = formatVelocity(aircraft.velocity);
  fields.heading.textContent = formatHeading(aircraft.heading);
  fields.lastContact.textContent = formatTimestamp(aircraft.lastContact);
}

async function loadRouteForFlight(aircraft) {
  const key = getRouteKey(aircraft);
  if (!key || key === 'UNKNOWN') return null;

  if (routeCache.has(key)) {
    return routeCache.get(key);
  }

  const response = await fetch(`/api/routes/${encodeURIComponent(key)}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Route konnte nicht geladen werden');
  }

  routeCache.set(key, data.route);
  return data.route;
}

async function selectFlight(aircraft, marker) {
  selectedFlightId = getFlightId(aircraft);
  const requestId = ++selectedRouteRequestId;
  renderDetails(aircraft);
  marker.setPopupContent(buildPopupContent(aircraft, aircraft.route));
  marker.openPopup();
  clearRouteLines();

  try {
    const route = await loadRouteForFlight(aircraft);
    aircraft.route = route;

    if (selectedRouteRequestId !== requestId || selectedFlightId !== getFlightId(aircraft)) return;

    marker.setPopupContent(buildPopupContent(aircraft, route));
    renderDetails(aircraft);
    drawRouteLines(aircraft, route);
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Route konnte nicht geladen werden', true);
  }
}

function clearAircraftVisuals() {
  aircraftLayer.clearLayers();
  clearRouteLines();
}

function renderAircraft(data) {
  clearAircraftVisuals();
  aircraftCountEl.textContent = data.aircraft.length;
  currentFlights = data.aircraft;
  currentOverhead = data.overhead;

  if (selectedFlightId && !currentFlights.some((aircraft) => getFlightId(aircraft) === selectedFlightId)) {
    selectedFlightId = null;
  }

  data.aircraft.forEach((aircraft) => {
    const isOverhead = currentOverhead && aircraft.icao24 === currentOverhead.icao24;
    const isSelected = selectedFlightId === getFlightId(aircraft);
    const marker = L.marker([aircraft.latitude, aircraft.longitude], {
      icon: createAircraftIcon(aircraft.heading, isOverhead, isSelected)
    }).bindPopup(buildPopupContent(aircraft, aircraft.route));

    marker.on('click', () => {
      selectFlight(aircraft, marker);
    });

    marker.addTo(aircraftLayer);

    if (isSelected) {
      selectFlight(aircraft, marker);
    }
  });

  if (!selectedFlightId) {
    renderDetails(currentOverhead);
    if (currentOverhead) {
      const overhead = currentOverhead;
      loadRouteForFlight(overhead)
        .then((route) => {
          overhead.route = route;
          if (!selectedFlightId && currentOverhead?.icao24 === overhead.icao24) {
            renderDetails(overhead);
          }
        })
        .catch((error) => {
          console.error(error);
        });
    }
  }
}

async function loadFlights() {
  if (!currentPosition) return;

  setStatus('Lade Flugdaten...');

  try {
    const response = await fetch(`/api/flights?${getBoundsQuery().toString()}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Unbekannter API-Fehler');
    }

    renderAircraft(data);
    updatedEl.textContent = formatTimestamp(data.timestamp || Math.floor(Date.now() / 1000));
    setStatus(data.aircraft.length ? 'Aktiv' : 'Keine Flugzeuge in der Kartenansicht');
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Flugdaten konnten nicht geladen werden', true);
  }
}

function scheduleRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(loadFlights, 15000);
}

function scheduleMoveRefresh() {
  if (!currentPosition) return;
  if (moveRefreshTimer) clearTimeout(moveRefreshTimer);
  moveRefreshTimer = setTimeout(loadFlights, 450);
}

function initLocation() {
  if (!navigator.geolocation) {
    setStatus('Geolocation wird von diesem Browser nicht unterstützt', true);
    return;
  }

  setStatus('Warte auf Standortfreigabe...');

  navigator.geolocation.getCurrentPosition(
    (position) => {
      currentPosition = {
        lat: position.coords.latitude,
        lon: position.coords.longitude
      };

      setLocation(currentPosition.lat, currentPosition.lon);
      updateUserVisuals(currentPosition.lat, currentPosition.lon);
      map.setView([currentPosition.lat, currentPosition.lon], 10);
      loadFlights();
      scheduleRefresh();
    },
    (error) => {
      setStatus(`Standortfehler: ${error.message}`, true);
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 30000
    }
  );
}

refreshButton.addEventListener('click', loadFlights);
map.on('moveend', scheduleMoveRefresh);
initLocation();
