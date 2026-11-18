# Front end

**Owner:** Davin

Everything people see and tap: screens, swipe gestures, animations, and the live "someone joined" / "it's a match" moments.

## Run it

React + TypeScript web app built with Vite, designed for phones first.

**With the real back end** (two terminals):

```sh
cd backend && npm install && npm run dev      # http://localhost:3000
cd frontend && npm install && npm run dev     # http://localhost:5173
```

The app looks for the back end on port 3000 of the same computer, so the Vite **Network** URL works on a phone on the same Wi-Fi too. To point it somewhere else, copy [`.env.example`](.env.example) to `.env.local` and set `VITE_API_URL`.

On a phone opened through the Network URL (plain `http`), browsers won't share your location, so type a place on the "Start a group" screen instead.

**Without the back end** (fake data and fake friends who join, swipe and vote):

```sh
npm run dev:mock
```

Features the back end doesn't have yet (progress per person, nudge, end round, closest picks, quick vote, new round in the same group) only show up in fake-data mode.

- Design tokens (colors, type, spacing) live in [`src/styles/theme.css`](src/styles/theme.css). Use them instead of hardcoded values.
- Shared components are in `src/components/`, screens in `src/screens/`.

## Screens

| Screen | What it shows |
| --- | --- |
| Home | Start a group, or join one with a code |
| Group setup | Location, distance, price, food type |
| Waiting room | Who has joined so far (live) |
| Swipe | Restaurant cards: photo, name, price, rating, distance |
| Match | The fun moment, plus address, hours, and directions |
| No match | The stack ran out: widen filters or start over |

## Talking to the back end

All server calls go through [`src/api/`](src/api/): `real.ts` (the back end, following [`../docs/API.md`](../docs/API.md)) and `mock.ts` (fake-data mode) both implement the same `CraveApi` in `types.ts`. Live updates (people joining, the host starting, a match) come over Socket.io in `live.ts`.

## Brand

Logo files are in [`../assets/logo/`](../assets/logo/) (PNG at 2000px and 1024px, plus the original WebP). Primary color is `#EE4135`, the logo red. Colors, type, spacing and components are in the style guide, [`docs/STYLE.md`](../docs/STYLE.md); the favicon, app icons and home-screen manifest are in [`public/`](public/).

## Rules

- No API keys in this folder. Restaurant data comes from our back end, never straight from Google or Yelp.
- Every screen needs a loading, empty, and error state.

Tasks: see [`../TASKS.md`](../TASKS.md#front-end-davin).
