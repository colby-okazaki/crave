# Tasks

About 8 weeks to a working first version. Stretch or shrink to fit your schedules. Tick boxes as you go.

## Week by week

| Week | Front end (Davin) | Back end (Colby) |
| --- | --- | --- |
| 1 | Talk to friends, sketch the flow | Pick the stack and the restaurant API |
| 1–2 | **Together:** agree on endpoints in `docs/API.md` | **Together:** agree on endpoints in `docs/API.md` |
| 2–3 | Figma mockups and style guide, quick tests | Groups, join codes, restaurant data |
| 4–5 | Build screens with fake data | Swipes, match logic, live updates |
| 6 | Connect screens to the real back end | Fix bugs found while connecting |
| 7 | Polish animations and edge cases | Put it online |
| 8 | Test with a real group at dinner | Fix what breaks |

## Shared (both of you, before building much)

- [ ] Agree on the endpoints and response shapes in [`docs/API.md`](docs/API.md)
- [ ] Decide what a restaurant card's data looks like (field names)
- [ ] Decide what counts as a match: everyone says yes, or most people?
- [ ] Decide what error messages look like
- [ ] Set up the GitHub repo and add each other as collaborators

## Front end (Davin)

**Design**
- [ ] Talk to a few friends about how their group usually picks a place
- [ ] Sketch the main flow
- [ ] Build mockups in Figma
- [ ] Small style guide: colors, type, buttons, card style (start from the logo red `#EE4135`)
- [ ] App icon and splash screen from the logo in `assets/logo/`
- [ ] Test the mockups with 3 to 5 people and fix what confuses them

**Screens**
- [ ] Home: start a group or join with a code
- [ ] Group setup: location, distance, price, food type
- [ ] Waiting room: who has joined so far
- [ ] Swipe: cards with photo, name, price, rating, distance
- [ ] Match: the fun moment, plus address and directions
- [ ] No match: widen filters or start over

**Wiring and polish**
- [ ] Swipe gestures and card animations
- [ ] Build every screen against the mock data in `docs/mock/`
- [ ] Connect each screen to the real endpoints
- [ ] Live updates over Socket.io (people joining, a match landing)
- [ ] Loading, empty, and error states on every screen
- [ ] "Open directions" button hands off to the phone's maps app

## Back end (Colby)

**Setup**
- [x] Pick the stack (language, framework, database) and write it in `backend/README.md`
- [ ] Pick the restaurant API (Google Places or Yelp); get a key; note the free-tier limits
- [ ] Keep keys in `backend/.env` only

**Groups**
- [x] `POST /groups`: create a group with location and filters, return ID and join code
- [x] Short, readable join codes that don't collide with open groups
- [x] `POST /groups/:code/join`: add a member by nickname, return group info and members
- [x] Close old groups after a while (e.g. 24 hours)

**Restaurant data**
- [ ] `GET /groups/:id/restaurants`: fetch nearby places using the group's filters (endpoint works with fake data; real provider still to do)
- [x] Every member gets the same stack in the same order (fetch once per group and store it)
- [ ] Map the provider's response to our card fields so the front end never sees provider-specific data

**Swipes and matching**
- [ ] `POST /groups/:id/swipes`: save one member's yes or no for one place
- [ ] After each swipe, check whether every member said yes to that place
- [ ] Return the match in the swipe response when this swipe made one
- [ ] Handle the stack running out with no match

**Live updates**
- [x] Socket.io room per group
- [x] Send `member_joined` when someone joins
- [ ] Send `match_found` to every phone when a match happens
- [x] Handle phones reconnecting (send current state on reconnect)

**Launch**
- [ ] Host the server and database online so it works on real phones
- [ ] Share the live base URL with Davin
- [ ] Fix what breaks during the dinner test
