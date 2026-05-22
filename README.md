# flights-above-me

A small web app that uses browser geolocation, Leaflet, and OpenSky data to show aircraft in the current map view and highlight the one most likely above you.

## Features

- shows your current location on a map
- fetches aircraft in the current map view through a tiny Node/Express backend
- highlights the aircraft most likely “above you”
- shows callsign, ICAO24, origin country, altitude, speed, route, and distance
- draws direct route reference lines from a selected aircraft to its origin and destination when route coordinates are available
- refreshes automatically every 15 seconds

## Local development

```bash
npm install
npm start
```

Open:

- http://localhost:3000

## API

- `GET /api/flights?lat=<latitude>&lon=<longitude>&lamin=<south>&lamax=<north>&lomin=<west>&lomax=<east>`
- `GET /api/routes/<callsign>`

Example:

```bash
curl 'http://localhost:3000/api/flights?lat=48.2082&lon=16.3738&lamin=47.8&lamax=48.6&lomin=15.8&lomax=16.9'
```

## Production deployment

This repo contains a `Dockerfile` and `compose.yaml` for deployment behind the shared `nginx-proxy` stack on `flights.basti.dev`.

```bash
docker compose up -d --build
```

## Caveats

- OpenSky's public API can be rate-limited or incomplete.
- “Above you” is heuristic-based: the app currently prefers the closest airborne aircraft.
- Browser geolocation must be allowed.
