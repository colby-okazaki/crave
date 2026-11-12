# Back end

**Owner:** Colby

Owns the data, the rules, and keeping everyone's phone in sync.

## Responsibilities

| Area | What it does |
| --- | --- |
| Groups | Create a group, make a short join code, track who's in it, close old groups after a while |
| Restaurant data | Pull nearby places from a maps API (Google Places or Yelp) using the group's location and filters |
| Swipes | Save each person's yes or no for each place |
| Match logic | After every swipe, check whether everyone said yes to the same place |
| Live updates | Push "member joined" and "match found" to every phone right away (Socket.io) |
| Users | Nickname per group only; real accounts come later |
| Hosting | Server and database online so it works on real phones |

## Secrets

Copy `.env.example` to `.env` and fill it in. The server reads `.env` on start. `.env` is git-ignored; never commit keys, and never send them to the front end.

## Stack

TypeScript, Node.js, Express, Socket.io. Groups live in memory for now (they reset when the server restarts); a database comes later. Swipes and match logic are built; real restaurant data is not.

## Run it locally

```bash
cd backend
npm install
npm run dev
```

The server starts on `http://localhost:3000` (set `PORT` to change it). Check it with `GET /health`. Run the tests with `npm test`.

The front end is a web app on a different address (for example `http://localhost:5173`, or a phone opening the Vite Network URL), so the server sends CORS headers. By default it allows any origin, which is fine for local work. Before deploying, set `CORS_ORIGIN` in `.env` to the front end's real address.

## Rate limits

Join codes are only 4 digits, so one address is limited to 10 wrong join attempts a minute (successful joins don't count, so a whole table can join together), 20 new groups a minute, and 300 requests a minute overall. Over the limit the server answers `429` with `RATE_LIMITED`. Behind a host's proxy, set `TRUST_PROXY=1` so visitors are counted by their real address. Set `RATE_LIMIT=off` only for the load test or local testing.

## Run it in Docker

Run from the repo root (the build needs `docs/mock/`):

```bash
docker build -f backend/Dockerfile -t crave-backend .
docker run --rm -p 3000:3000 --env-file backend/.env crave-backend
```

The image runs as a normal (non-root) user and never contains `.env`; pass settings with `--env-file` or your host's environment settings. This is what we'll hand to a host when we put the server online. Groups still live in memory, so they reset when the container restarts.

## What works so far

| Endpoint | Status |
| --- | --- |
| `POST /groups` | Done |
| `POST /groups/:code/join` | Done |
| `GET /groups/:id/restaurants` | Fake data in `docs/mock/` by default. With `RESTAURANT_SOURCE=osm` in `.env` it returns real places from OpenStreetMap (free, no key, but no photos, prices or ratings, and the public servers are sometimes busy) |
| `POST /groups/:id/swipes` | Done. A match needs everyone to like the same place (at least 2 people) |
| Socket.io: `state` and `member_joined` events | Done |
| Socket.io: `no_match` event (everyone swiped everything, nobody matched) | Done |
| Socket.io: `match_found` event, and `state` carries the match for phones that reconnect | Done |

Tasks: see [`../TASKS.md`](../TASKS.md#back-end-colby).
