<p align="center"><img src="assets/logo/crave-logo-1024.png" alt="Crave logo" width="160"></p>

# Crave

A group of friends can't agree on where to eat. Everyone swipes yes or no on nearby restaurants, and the app shows a match when the whole group likes the same place.

## Tech stack

| Part | Built with |
| --- | --- |
| Language | **TypeScript** on both the front end and the back end |
| Front end | **React 19**, **Vite**, React Router, CSS modules (a mobile-first web app) |
| Back end | **Node.js 24**, **Express 5**, **Socket.io** for live updates |
| Data | In-memory groups for now (database planned); restaurants from fake data, with a free **OpenStreetMap** source in progress |
| Testing | Node's built-in test runner (`npm test`), plus a load test (`npm run loadtest`) |
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

Updated as each pull request merges. Last updated: 2026-11-07.

| Area | State |
| --- | --- |
| Back end: create and join a group (4-digit codes), live member updates, old groups cleaned up | Done |
| Back end: restaurants endpoint | Done, fake data for now |
| Back end: swipes, match logic (everyone must say yes), `match_found` and `no_match` events | Done, tested |
| Back end: rate limits on joining and creating groups, Docker setup for hosting | Done (open pull request) |
| Back end: hosting it online, database | Not built yet |
| Front end: Home, Join, Lobby, Swipe and Details screens | Done, still on mock data |
| Front end: match screen, connection to the real server | Not built yet |

Load-test numbers and repo stats are in [`STATS.md`](STATS.md).

## Run it locally

Back end (`http://localhost:3000`):

```bash
cd backend && npm install && npm run dev
```

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
