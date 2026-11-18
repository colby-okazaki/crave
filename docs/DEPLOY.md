# Putting Crave online

Crave is live on Render: the app is at https://crave-app-ykml.onrender.com and the server at https://crave-backend-43ve.onrender.com. The steps below are how it was set up. Render added a random suffix to both names, so the first guess for `CORS_ORIGIN` and `VITE_API_URL` was wrong and had to be replaced with the real addresses.

The repo is set up for [Render](https://render.com): it runs the Docker image, supports the live connections Socket.io needs, and has a free plan. Any host that runs a Docker image and supports websockets works the same way: use the settings below.

> **Free plan catch:** free servers usually go to sleep after a while with no traffic and take a short time to wake up, and a sleep or restart ends every open group (groups live in memory). Fine for testing; for a real dinner, open the app a minute early, or pay for an always-on plan. Check the host's current free-plan terms before relying on it.

## Steps (about 10 minutes)

1. Make a Render account and connect GitHub (this needs your own login).
2. **New > Blueprint**, pick this repo. Render reads [`render.yaml`](../render.yaml) and creates two services: `crave-backend` and `crave-app`.
3. Wait for the first deploys. Copy both web addresses (like `https://crave-backend.onrender.com` and `https://crave-app.onrender.com`; yours will differ).
4. Fill in the two settings the blueprint leaves empty (Environment tab of each service):
   - on `crave-backend`: **`CORS_ORIGIN`** = the front end's address (no trailing slash)
   - on `crave-app`: **`VITE_API_URL`** = the back end's address
5. Redeploy `crave-app` (the back end's address is baked in when it builds). `crave-backend` picks up its setting on its own.
6. Check `https://<backend>/health` shows `{"ok":true}`, then open the front end on a phone.

## What the settings do

| Setting | Where | Value |
| --- | --- | --- |
| `RESTAURANT_SOURCE` | back end | `osm` for real restaurants (free, no key). Without it you get 5 fake places |
| `TRUST_PROXY` | back end | `1`, so the rate limits count each phone's own address, not the host's proxy |
| `CORS_ORIGIN` | back end | The front end's address, so browsers may call the server |
| `VITE_API_URL` | front end (build time) | The back end's address |
| `PORT` | back end | The host sets it; the server reads it |

Leave `RATE_LIMIT` unset online (it's only turned off for load tests).

## Check it works

- Open the front end on two phones, create a group on one, join on the other with the 4-digit code, swipe, match.
- "Use my current location" only works over **https**, which Render provides by default.
- To re-run the load test against a server, start a throwaway copy with `RATE_LIMIT=off` (not the live one) and run `cd backend && BASE_URL=https://<that server> npm run loadtest`.

## Later

- A custom domain, and a paid always-on plan.

## Keeping groups across restarts

By default groups live in memory, so a restart, a redeploy or the free plan's sleep ends every open group. Set one of these on `crave-backend` to keep them:

- **`DATABASE_URL`** (recommended online): a Postgres address. Render's free Postgres works (New > PostgreSQL, then copy its **Internal Database URL**; check its current free-plan limits, it has expired after 30 days before), or use Neon or Supabase. The server makes its own table, `crave_state`, and keeps every open group in one row.
- **`DATA_FILE`**: a file path, for a machine with a disk that persists. Render's free plan wipes its disk on every restart, so this only helps locally or on a paid disk.

The server saves every 5 seconds when something changed and once more when the host tells it to stop, then reloads on start (logs `Restored N open groups.`). Phones reconnect on their own and carry on. At most the last few seconds of swipes can be lost on a hard crash. Groups still close after 24 hours. Tested with a file store and a real restart; the Postgres path is not tried against a live database yet.

## Real photos with Google Places

OpenStreetMap has almost no photos (none in a test of 80 places), so for photos on every card use Google Places. It's billed per request, so set it up with a spending cap.

1. In [Google Cloud](https://console.cloud.google.com), use a project on your own account (a school or work organization may block API keys).
2. Turn on billing, then **set a budget with an alert and a cap**. Check the current Places API pricing and free monthly credit on Google's pricing page first.
3. Enable **Places API (New)** and create an API key. Under "API restrictions", limit the key to Places API (New).
4. In Render, open `crave-backend`, then **Environment**, and paste the key into `GOOGLE_PLACES_API_KEY`. `render.yaml` already sets `RESTAURANT_SOURCE` to `google` (a blueprint overwrites values edited by hand, so change it in the file, not the dashboard). Never put the key in GitHub or send it in chat.
5. Check a group's cards: each should have a `photoUrl` that starts with the server's address.

How it behaves:
- Photos load through the server (`/photos/...`), so the key never reaches phones. The server keeps each photo for an hour so a table of phones costs one Google request, not six.
- If Google errors or the quota runs out, the server falls back to OpenStreetMap, so the app keeps working (without photos).
- Price and rating appear when Google has them, so the front end's price filter starts working.
- Google's terms limit how long place data may be stored. Groups keep their cards in memory for the group's life (up to 24 hours), so read their current terms if this goes beyond a school project.
