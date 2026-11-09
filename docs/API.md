# API contract (draft)

This is a **starting draft** for you both to edit in week 1–2. Field names here are suggestions; once you agree, treat this file as the source of truth and change it only when both of you are OK with it.

All requests and responses are JSON. The server allows cross-origin requests from the web front end (see `CORS_ORIGIN` in `backend/.env.example`). The member's ID goes in a header so the server knows who's swiping:

```
X-Member-Id: m_7f3a
```

## Endpoints

| Action | Endpoint | Sends back |
| --- | --- | --- |
| Start a group | `POST /groups` | Group ID, join code, your member ID |
| Join a group | `POST /groups/:code/join` | Group info, members, your member ID |
| Get restaurant cards | `GET /groups/:id/restaurants` | List of places |
| Send a swipe | `POST /groups/:id/swipes` | OK, or a match if this swipe made one |
| Live updates | Socket.io connection | `state`, `member_joined`, `match_found` events |

The join code is a **4-digit number sent as text** (for example `"0427"`, so keep any leading zero).

### Start a group

`POST /groups`

```json
{
  "nickname": "Colby",
  "location": { "lat": 37.7749, "lng": -122.4194 },
  "filters": { "radiusMeters": 3000, "price": [1, 2], "cuisine": ["mexican", "thai"] }
}
```

Response `201`:

```json
{
  "groupId": "g_9c21",
  "joinCode": "4271",
  "memberId": "m_7f3a"
}
```

### Join a group

`POST /groups/4271/join`

```json
{ "nickname": "Davin" }
```

Response `200`:

```json
{
  "groupId": "g_9c21",
  "memberId": "m_b812",
  "members": [
    { "id": "m_7f3a", "nickname": "Colby" },
    { "id": "m_b812", "nickname": "Davin" }
  ]
}
```

### Get restaurant cards

`GET /groups/g_9c21/restaurants`

Every member gets the same list in the same order. See [`mock/restaurants.json`](mock/restaurants.json) for a full example.

```json
{
  "restaurants": [
    {
      "id": "r_001",
      "name": "La Taqueria",
      "photoUrl": "https://example.com/photo.jpg",
      "price": 1,
      "rating": 4.6,
      "distanceMeters": 850,
      "address": "2889 Mission St, San Francisco, CA",
      "hours": "11:00–21:00",
      "location": { "lat": 37.7509, "lng": -122.4181 }
    }
  ]
}
```

- `price`: 1–4 (shown as $ to $$$$)
- `rating`: 0–5, one decimal

### Send a swipe

`POST /groups/g_9c21/swipes`

```json
{ "restaurantId": "r_001", "liked": true }
```

Response `200`, no match yet:

```json
{ "ok": true, "match": null }
```

Response `200`, this swipe made a match:

```json
{ "ok": true, "match": { "restaurantId": "r_001" } }
```

Rules:
- Send `X-Member-Id`, like the restaurants request. Get the stack with `GET /groups/:id/restaurants` first; only places in that stack can be swiped.
- A match needs **everyone** in the group to like the same place, and at least 2 people.
- A person's first swipe on a place counts. Sending it again changes nothing, so retrying after a bad connection is safe.
- Someone who joins later has to like the place too before it can match.
- Once a group has a match it keeps it. Every later swipe returns that same match, so a phone that missed `match_found` still finds out.

### Live updates

Live updates use [Socket.io](https://socket.io) (not a plain WebSocket). Connect to the server's base URL and pass the group and member IDs from the join response:

```ts
import { io } from "socket.io-client";

const socket = io(BASE_URL, { auth: { groupId: "g_9c21", memberId: "m_7f3a" } });

socket.on("state", ({ members, match }) => { /* ... */ });
socket.on("member_joined", ({ member }) => { /* ... */ });
socket.on("match_found", ({ restaurant }) => { /* ... */ });
```

If the IDs don't belong to an open group, the connection is refused and `connect_error` fires with the message `GROUP_NOT_FOUND`. Socket.io reconnects on its own after a dropped connection.

| Event | When | Payload |
| --- | --- | --- |
| `state` | Right after connecting, and again after every reconnect, so a phone that dropped catches up | `{ "members": [ … ], "match": null }`, or `"match": { "restaurant": { … } }` (same restaurant as `match_found`) once the group has matched |
| `member_joined` | Someone joins the group | `{ "member": { "id": "m_b812", "nickname": "Davin" } }` |
| `match_found` | A swipe made a match | `{ "restaurant": { "id": "r_001", "name": "La Taqueria", "address": "2889 Mission St, San Francisco, CA", "hours": "11:00–21:00", "location": { "lat": 37.7509, "lng": -122.4181 } } }` |

## Errors

Every error uses the same shape, so the front end can show `message` directly:

```json
{ "error": { "code": "GROUP_NOT_FOUND", "message": "That code doesn't match an open group." } }
```

| Code | HTTP | When |
| --- | --- | --- |
| `GROUP_NOT_FOUND` | 404 | Bad or expired join code / group ID |
| `GROUP_CLOSED` | 410 | Group timed out |
| `NICKNAME_TAKEN` | 409 | Someone in the group already has that nickname |
| `INVALID_INPUT` | 400 | Missing or bad fields |
| `NO_RESTAURANTS` | 200 + empty list | Nothing matched the filters (not an error; show the "widen filters" screen) |
| `SERVER_BUSY` | 503 | Every join code is in use (rare; try again shortly) |
| `SERVER_ERROR` | 500 | Anything else |

## Open questions

- [x] Match rule: everyone says yes (built that way).
- [x] A person who joins late sees the whole stack from the start, and has to like a place for it to match.
- [ ] How many restaurants per group? (Suggest 20 to start.)
- [ ] Can the group creator change filters after people join?
