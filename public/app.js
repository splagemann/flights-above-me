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
let searchCircle;
let aircraftLayer = L.layerGroup().addTo(map);
let overheadLine;
let currentPosition;
let refreshTimer;

function formatNumber(value, digits = 0) {
  if (value == null || Number.isNaN(value)) return '–';
  return new Intl.NumberFormat('de-AT', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  }).format(value);
}

function formatDistance(km) {
  if (km == null) return '–';
  return `${formatNumber(km, km < 10 ? 2 : 1)} km`;
}

function formatAltitude(meters) {
  if (meters == null) return '–';
  const feet = meters * 3.28084;
  return `${formatNumber(meters, 0)} m / ${formatNumber(feet, 0)} ft`;
}

function formatVelocity(ms) {
  if (ms == null) return '–';
  return `${formatNumber(ms * 3.6, 0)} km/h`;
}

function formatHeading(heading) {
  if (heading == null) return '–';
  return `${formatNumber(heading, 0)}°`;
}

function formatTimestamp(unixSeconds) {
  if (!unixSeconds) return '–';
  return new Date(unixSeconds * 1000).toLocaleTimeString('de-AT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
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
      fillColor: '#2ec5ff',
      fillOpacity: 0.9
    }).addTo(map).bindPopup('Du bist hier');
  } else {
    userMarker.setLatLng(latLng);
  }

  if (!searchCircle) {
    searchCircle = L.circle(latLng, {
      radius: 80000,
      color: '#66d9ff',
      weight: 1,
      opacity: 0.4,
      fillOpacity: 0.03
    }).addTo(map);
  } else {
    searchCircle.setLatLng(latLng);
  }
}

function clearAircraftVisuals() {
  aircraftLayer.clearLayers();
  if (overheadLine) {
    overheadLine.remove();
    overheadLine = null;
  }
}

function renderAircraft(data) {
  clearAircraftVisuals();
  aircraftCountEl.textContent = data.aircraft.length;

  data.aircraft.forEach((aircraft) => {
    const isOverhead = data.overhead && aircraft.icao24 === data.overhead.icao24;
    const marker = L.circleMarker([aircraft.latitude, aircraft.longitude], {
      radius: isOverhead ? 10 : 5,
      color: isOverhead ? '#ffd166' : '#95a8c2',
      weight: isOverhead ? 3 : 1,
      fillColor: isOverhead ? '#ffd166' : '#d8e4f5',
      fillOpacity: isOverhead ? 0.75 : 0.25
    }).bindPopup(`
      <strong>${aircraft.callsign}</strong><br />
      ${aircraft.originCountry}<br />
      Distanz: ${formatDistance(aircraft.distanceKm)}<br />
      Höhe: ${formatAltitude(aircraft.altitudeMeters)}
    `);

    marker.addTo(aircraftLayer);
  });

  if (data.overhead && currentPosition) {
    overheadLine = L.polyline([
      [currentPosition.lat, currentPosition.lon],
      [data.overhead.latitude, data.overhead.longitude]
    ], {
      color: '#ffd166',
      weight: 2,
      dashArray: '6 10',
      opacity: 0.8
    }).addTo(map);
  }
}

function formatAirport(airport) {
  if (!airport) return '–';
  const code = airport.iata || airport.icao || '???';
  const city = airport.municipality || airport.country || null;
  const name = airport.name || null;
  return [code, city, name].filter(Boolean).join(' · ');
}

function renderDetails(overhead) {
  if (!overhead) {
    emptyStateEl.classList.remove('hidden');
    detailsListEl.classList.add('hidden');
    return;
  }

  emptyStateEl.classList.add('hidden');
  detailsListEl.classList.remove('hidden');
  fields.callsign.textContent = overhead.callsign;
  fields.icao24.textContent = overhead.icao24;
  fields.country.textContent = overhead.originCountry;
  fields.route.textContent = overhead.route
    ? `${overhead.route.origin.iata || overhead.route.origin.icao || '???'} → ${overhead.route.destination.iata || overhead.route.destination.icao || '???'}`
    : '–';
  fields.origin.textContent = formatAirport(overhead.route?.origin);
  fields.destination.textContent = formatAirport(overhead.route?.destination);
  fields.distance.textContent = formatDistance(overhead.distanceKm);
  fields.altitude.textContent = formatAltitude(overhead.altitudeMeters);
  fields.velocity.textContent = formatVelocity(overhead.velocity);
  fields.heading.textContent = formatHeading(overhead.heading);
  fields.lastContact.textContent = formatTimestamp(overhead.lastContact);
}

async function loadFlights() {
  if (!currentPosition) return;

  setStatus('Lade Flugdaten…');

  try {
    const response = await fetch(`/api/flights?lat=${currentPosition.lat}&lon=${currentPosition.lon}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Unbekannter API-Fehler');
    }

    renderAircraft(data);
    renderDetails(data.overhead);
    updatedEl.textContent = formatTimestamp(data.timestamp || Math.floor(Date.now() / 1000));
    setStatus(data.overhead ? 'Aktiv' : 'Keine Flugzeuge gefunden');
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Flugdaten konnten nicht geladen werden', true);
  }
}

function scheduleRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(loadFlights, 15000);
}

function initLocation() {
  if (!navigator.geolocation) {
    setStatus('Geolocation wird von diesem Browser nicht unterstützt', true);
    return;
  }

  setStatus('Warte auf Standortfreigabe…');

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
initLocation();
