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

- **A database** so groups survive restarts and sleep. The store is in memory today; `backend/src/groups.ts` is the one place to swap.
- A custom domain, and a paid always-on plan.
