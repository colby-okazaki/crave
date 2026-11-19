# Project stats

Numbers we can back up, kept here so the resume blurb is easy to write later. Every number below was measured by a script in this repo. Re-run the scripts and update this file as the project grows; don't type numbers in by hand.

## How to measure

| What | Command | Measures |
| --- | --- | --- |
| Repo facts | `./scripts/repo-stats.sh` | Commits, contributors, PRs merged, code size, endpoints, tests |
| Back end performance | `cd backend && RATE_LIMIT=off PORT=3055 npm run dev`, then in a second terminal `BASE_URL=http://localhost:3055 npm run loadtest -- --groups 200 --members 6` (port 3000 may be taken by Docker) | Response times and live-update delay with many phones connected |

The load test starts a group per simulated host, joins the other members, and keeps every phone on a live Socket.io connection. `--groups` and `--members` set the size.

## Back end load test

Run on 2026-11-19, Mac with an Apple M3 chip (8 cores), Node 24. The server and the test ran on the same computer, over localhost, with groups stored in memory and fake restaurant data. Each group creates, joins, loads the restaurant stack, and then everyone swipes yes on the same place.

Run: 200 groups x 6 members = **1,200 phones connected at once**, 0 failures, **200 of 200 groups matched**, 2,600 HTTP requests in 0.62 s (about 4,200 per second). Same result as the first run on 2026-11-07, after the server grew from 3 to 15 endpoints.

| Measurement (ms) | Samples | p50 | p95 | p99 | Max |
| --- | --- | --- | --- | --- | --- |
| `POST /groups` | 200 | 56.6 | 89.2 | 90.9 | 91.4 |
| `POST /groups/:code/join` | 1000 | 21.0 | 29.5 | 32.8 | 33.8 |
| Join to host's phone notified (`member_joined`) | 1000 | 19.2 | 27.8 | 32.8 | 33.8 |
| Socket connect to first `state` event | 1200 | 45.0 | 64.6 | 73.2 | 77.0 |
| `GET /groups/:id/restaurants` | 200 | 18.3 | 29.6 | 33.2 | 33.3 |
| `POST /groups/:id/swipes` | 1200 | 18.7 | 51.9 | 55.8 | 58.5 |
| Last yes to host's phone notified (`match_found`) | 200 | 8.9 | 45.2 | 45.2 | 45.3 |

How to read these: p50 is the typical request, p95 means 95 out of 100 were faster than that, and p99 is the slow tail. "Last yes to host notified" is the real-time number: the time from the final friend tapping yes until the host's phone gets the match.

Also measured: `npm test` runs 64 automated tests (match rule, repeats, late joiners, leaving, host-only actions, nudges, votes, rounds, rate limits, OpenStreetMap and Google data, saving and restoring groups, live events).

## Repo facts

Snapshot of `main` on 2026-11-19, from `./scripts/repo-stats.sh`:

| Stat | Value |
| --- | --- |
| Days from first to latest commit | 22 |
| Commits | 84 |
| Contributors | 2 people (3 git author names, since Davin committed under two) |
| Pull requests merged | 33 |
| Back end source files / lines (TypeScript) | 24 / 2,809 |
| Back end HTTP endpoints | 15 |
| Socket.io events the server sends | 12 |
| Automated tests | 64 |

Lines of code is a weak number; hiring managers care more about what it does and how well. The load test numbers are the stronger ones.
