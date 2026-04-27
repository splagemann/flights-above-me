# flights-above-me

A small web app that uses browser geolocation, Leaflet, and OpenSky data to show nearby aircraft and highlight the one most likely above you.

## Features

- shows your current location on a map
- fetches nearby aircraft through a tiny Node/Express backend
- highlights the aircraft most likely “above you”
- shows callsign, ICAO24, origin country, altitude, speed, route, and distance
- refreshes automatically every 15 seconds

## Local development

```bash
npm install
npm start
```

Open:

- http://localhost:3000

## API

- `GET /api/flights?lat=<latitude>&lon=<longitude>`

Example:

```bash
curl 'http://localhost:3000/api/flights?lat=48.2082&lon=16.3738'
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
