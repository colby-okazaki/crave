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

Copy `.env.example` to `.env` and fill it in. `.env` is git-ignored; never commit keys, and never send them to the front end.

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

## What works so far

| Endpoint | Status |
| --- | --- |
| `POST /groups` | Done |
| `POST /groups/:code/join` | Done |
| `GET /groups/:id/restaurants` | Works, but returns the fake data in `docs/mock/` until we connect Google Places or Yelp |
| `POST /groups/:id/swipes` | Done. A match needs everyone to like the same place (at least 2 people) |
| Socket.io: `state` and `member_joined` events | Done |
| Socket.io: `no_match` event (everyone swiped everything, nobody matched) | Done |
| Socket.io: `match_found` event, and `state` carries the match for phones that reconnect | Done |

Tasks: see [`../TASKS.md`](../TASKS.md#back-end-colby).
