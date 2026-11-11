# Project stats

Numbers we can back up, kept here so the resume blurb is easy to write later. Every number below was measured by a script in this repo. Re-run the scripts and update this file as the project grows; don't type numbers in by hand.

## How to measure

| What | Command | Measures |
| --- | --- | --- |
| Repo facts | `./scripts/repo-stats.sh` | Commits, contributors, PRs merged, code size, endpoints, tests |
| Back end performance | `cd backend && RATE_LIMIT=off npm run dev`, then in a second terminal `npm run loadtest -- --groups 200 --members 6` | Response times and live-update delay with many phones connected |

The load test starts a group per simulated host, joins the other members, and keeps every phone on a live Socket.io connection. `--groups` and `--members` set the size.

## Back end load test

Run on 2026-11-07, Mac with an Apple M3 chip (8 cores), Node 24. The server and the test ran on the same computer, over localhost, with groups stored in memory and fake restaurant data. Each group creates, joins, loads the restaurant stack, and then everyone swipes yes on the same place.

Run: 200 groups x 6 members = **1,200 phones connected at once**, 0 failures, **200 of 200 groups matched**, 2,600 HTTP requests in 0.53 s (about 4,900 per second).

| Measurement (ms) | Samples | p50 | p95 | p99 | Max |
| --- | --- | --- | --- | --- | --- |
| `POST /groups` | 200 | 62.6 | 80.5 | 82.9 | 83.1 |
| `POST /groups/:code/join` | 1000 | 16.2 | 31.1 | 33.7 | 34.2 |
| Join to host's phone notified (`member_joined`) | 1000 | 15.4 | 24.3 | 33.6 | 34.1 |
| Socket connect to first `state` event | 1200 | 39.5 | 59.8 | 63.8 | 70.1 |
| `GET /groups/:id/restaurants` | 200 | 11.3 | 14.2 | 15.3 | 38.8 |
| `POST /groups/:id/swipes` | 1200 | 12.5 | 39.7 | 41.6 | 42.0 |
| Last yes to host's phone notified (`match_found`) | 200 | 12.5 | 14.7 | 16.2 | 40.1 |

How to read these: p50 is the typical request, p95 means 95 out of 100 were faster than that, and p99 is the slow tail. "Last yes to host notified" is the real-time number: the time from the final friend tapping yes until the host's phone gets the match.

Also measured: `npm test` runs 10 automated tests (match rule, repeats, late joiners, errors, live `match_found`).

## Repo facts

Snapshot of `main` on 2026-11-03, from `./scripts/repo-stats.sh`:

| Stat | Value |
| --- | --- |
| Days from first to latest commit | 6 |
| Commits | 9 |
| Contributors | 2 |
| Pull requests merged | 3 |
| Back end source files / lines (TypeScript) | 4 / 236 |
| Back end HTTP endpoints | 3 |
| Socket.io events the server sends | 2 |
| Automated tests | 0 |

Lines of code is a weak number; hiring managers care more about what it does and how well. The load test numbers are the stronger ones.

## Draft resume wording

Update the numbers from the latest run before using any of this. Keep claims within what was measured: say "in local load tests", since it hasn't run on a hosted server with real phones yet.

- Built the real-time back end for Crave, a group restaurant-matching app (TypeScript, Node.js, Express, Socket.io), working with a front-end partner against a shared API contract.
- Load-tested locally with 1,200 simultaneous live connections across 200 groups: zero failures, and a 32 ms p95 delay between a friend joining and the host's phone updating.
- Shipped through GitHub pull requests with a teammate: 3 merged PRs in the first 6 days.

## Worth adding as the project grows

- **Automated tests:** the test count and pass rate are easy to quote once they exist.
- **Hosted numbers:** repeat the load test against the deployed server, and from a different machine than the server.
- **Real-user numbers:** the week 8 dinner test gives how many people, how many groups, and how long from opening the app to a match.
- **Swipe and match speed:** once swipes exist, measure the time from the last swipe to every phone showing the match screen.
