<p align="center"><img src="assets/logo/crave-logo-1024.png" alt="Crave logo" width="160"></p>

# Crave

A group of friends can't agree on where to eat. Everyone swipes yes or no on nearby restaurants, and the app shows a match when the whole group likes the same place.

## Tech stack

| Part | Built with |
| --- | --- |
| Language | **TypeScript** on both the front end and the back end |
| Front end | **React 19**, **Vite**, React Router, CSS modules (a mobile-first web app) |
| Back end | **Node.js 24**, **Express 5**, **Socket.io** for live updates |
| Data | In-memory groups, saved to Postgres or a file when `DATABASE_URL` / `DATA_FILE` is set so they survive restarts; real restaurants and place search from free **OpenStreetMap** services (Nominatim, with Overpass as backup), or fake data for offline work |
| Testing | Node's built-in test runner (62 tests, `npm test`), plus a load test (`npm run loadtest`) |
| Tooling | Docker image for the server, rate limiting, GitHub pull requests |

Back end numbers, measured by a script in this repo: 1,200 phones connected at once with 0 failures. See [`STATS.md`](STATS.md).

## Who owns what

| Area | Owner | Folder |
| --- | --- | --- |
| Front end: screens, swipes, animations, design | Davin | [`frontend/`](frontend/) |
| Back end: groups, restaurant data, swipes, match logic, live updates, hosting | Colby | [`backend/`](backend/) |
| API contract: endpoints, field names, events, errors | Both | [`docs/API.md`](docs/API.md) |

The full task split is in [`TASKS.md`](TASKS.md). Measured numbers for the resume are in [`STATS.md`](STATS.md).

## Status

Updated as each pull request merges. Last updated: 2026-11-18.

**Done so far**

| Area | State |
| --- | --- |
| Online on Render (free plan): app at https://crave-app-ykml.onrender.com, server at https://crave-backend-43ve.onrender.com | Live. Tried with two players: create, join, start, both like one place, match arrives in about 0.2 s. Free servers sleep when idle, so the first visit can be slow, and a restart ends open groups |
| Back end: create and join a group (4-digit codes), live member updates, old groups cleaned up | Done |
| Back end: restaurants endpoint | Done, fake data by default |
| Back end: swipes, match logic (everyone must say yes), `match_found` and `no_match` events | Done, tested |
| Back end: rate limits on joining and creating groups, Docker setup for hosting | Done |
| Back end: real restaurant data from OpenStreetMap (free, no key), switched on with `RESTAURANT_SOURCE=osm` | Done, tried live: 20 places in about 1.4 s. No prices or ratings, and photos and hours only for some places, so the front end must handle empty fields |
| Back end: Google Places as an optional source (`RESTAURANT_SOURCE=google`): a real photo, price and rating on each card, photos served through our server so the key stays private, falls back to OpenStreetMap if Google fails | Live on Render: prices, ratings and hours show. Photos don't show yet; the server logs what Google sends for photos to find out why ([`docs/DEPLOY.md`](docs/DEPLOY.md)) |
| Back end: place search, so a typed location becomes coordinates (`GET /geocode`) | Done, tried live |
| Back end: load tested | 1,200 phones connected at once, 0 failures, rerun 2026-11-19 with the full server; 64 automated tests ([`STATS.md`](STATS.md)) |
| Back end: nudge (once a minute per person), quick vote after a no-match (winner becomes the match), and a new round in the same group | Done, tested |
| Back end: progress per person, end round early, closest picks; search radius up to 20 miles; the front end's cuisine names (burgers, boba, middle eastern…) now match OpenStreetMap's words | Done, tested |
| Back end: host-only filters and start, `hostId` in `state`, and leaving a group (the leaver's votes go, the host role passes on, the rest can still match) | Done, tested |
| Front end: all 9 screens (Home, Create, Join, Lobby, Swipe, Details, Waiting, Match, No match), connected to the real server, with a fake-data mode (`npm run dev:mock`) | Done, not yet tried on a real phone |
| Front end: leave (the host role passes on), live progress on the Waiting screen, nudge (with the "X nudged you" banner), end round early, closest picks, quick vote and a new round in the same group, all on the real server | Done, tested with three browsers against the server; not yet on a real phone |
| Front end: loading, empty and error states on every screen, a "Waking up the server…" note when the free server is slow to answer, "Reconnecting…" when the live connection drops, and a logo placeholder for places without a photo (price and rating are hidden when unknown) | Done |
| Front end: the Crave name and logo red (`#EE4135`) throughout, favicon, app icons and home-screen install (manifest), a splash while the app loads, and a style guide ([`docs/STYLE.md`](docs/STYLE.md)) | Done |
| Back end: a join after an early end or a no match reopens the round and clears earlier votes, `member_joined` now says `reopened`, and the overall rate limit is 1200 a minute so a table on one Wi-Fi isn't cut off | Done, tested |
| Back end: open groups are saved (Postgres via `DATABASE_URL`, or a file via `DATA_FILE`) every few seconds and on shutdown, and restored on start | Done, tested with a real restart on a file. Postgres code not tried against a live database yet |
| Both: API contract in [`docs/API.md`](docs/API.md), and the front end and back end agree on the 4-digit code format | Done |

**Next**

| Area | Owner |
| --- | --- |
| Front end: try it on a real phone; test the design with 3 to 5 people | Davin |
| Back end: find out why Google photos don't show (read the `Google sent...` line in the `crave-backend` logs)  | Colby |
| Back end: set `DATABASE_URL` on Render (free Postgres) so groups survive restarts and sleep ([`docs/DEPLOY.md`](docs/DEPLOY.md)) | Colby |
| Both: test with a real group at dinner | Both |

## Run it locally

Back end (`http://localhost:3000`):

```bash
cd backend && npm install && npm run dev
```

By default the back end serves fake restaurants, so it works with no internet. To use real places, copy `backend/.env.example` to `backend/.env` and set `RESTAURANT_SOURCE=osm` (free, no key needed).

Front end (Vite prints the address, usually `http://localhost:5173`):

```bash
cd frontend && npm install && npm run dev
```

More detail is in [`backend/README.md`](backend/README.md) and [`frontend/README.md`](frontend/README.md).

## Project layout

```
crave/
├── README.md          this file
├── TASKS.md           frontend vs backend tasks, week by week
├── assets/logo/       the Crave logo (placeholder for now)
├── docs/
│   ├── API.md         the contract both sides build against
│   └── mock/          fake responses Davin can use before the back end is ready
├── frontend/          Davin's code
└── backend/           Colby's code
```

## Brand (for now)

| Item | Value |
| --- | --- |
| Name | Crave |
| Logo | [`assets/logo/`](assets/logo/): heart with a fork, line style |
| Primary color | `#EE4135` (the logo red) |
| Background | `#FFFFFF` |

The logo is a placeholder. Davin's style guide can build on it or replace it.

## How it works

1. One person starts a group and picks a location and filters (distance, price, type of food).
2. They share a 4-digit code with friends.
3. Everyone joins and sees the same stack of restaurant cards.
4. Each person swipes right (yes) or left (no) on their own phone.
5. As soon as everyone says yes to the same place, all phones show a match screen.
6. The match screen has the address, hours, and a button to open directions.

## First version vs. later

The first version only needs to do one thing well: get a group to a match.

| First version | Later |
| --- | --- |
| Join with a code, nickname only | Real accounts and saved friend groups |
| Location, distance, price filters | Diet filters (vegan, halal, gluten-free) |
| Swipe yes or no | "Super like" or ranked picks |
| Match when everyone says yes | Show the top 3 if nobody fully matches |
| Address and directions on match | Reservations, past matches, sharing |

## Working together

- One repo, this folder as the root. Each person works mostly in their own folder.
- Work on a branch, open a pull request, the other person glances at it, then merge to `main`.
- Changes to `docs/API.md` need both of you to agree before merging, since you both depend on it.
- Never commit API keys. They live in `backend/.env`, which is git-ignored
