# Crave style guide

How Crave looks, so new screens match the old ones. Every value here is a token in [`frontend/src/styles/theme.css`](../frontend/src/styles/theme.css); use the token in code, never the hex. If you need a new value, add a token there first and list it here.

## Name and logo

- The app is called **Crave** (one word, capital C).
- The logo is a heart drawn as one line, with a fork inside it ([`assets/logo/`](../assets/logo/)). In the app it appears as the **logo mark**: white on a red rounded tile (Home, app icon, favicon, splash), or red on a soft tint (photo placeholder).
- Files:
  - [`frontend/src/assets/logo-mark.svg`](../frontend/src/assets/logo-mark.svg) is red; [`logo-mark-white.svg`](../frontend/src/assets/logo-mark-white.svg) is white.
  - [`frontend/public/`](../frontend/public/) has the favicon, the app icons (192, 512, maskable 512, Apple 180) and `manifest.webmanifest`.
- Leave room around the mark: at least a quarter of its width on every side. Don't recolor it except red-on-light or white-on-red.

## Color

| Token | Hex | Use |
| --- | --- | --- |
| `--color-primary` | `#EE4135` | Brand red: main buttons, the Match page, the group code, links, selected chips' border |
| `--color-primary-pressed` | `#D4372C` | Main button while pressed or hovered |
| `--color-primary-soft` | `#FFE8E3` | Selected chip, avatar circles, the "Share invite" pill, photo placeholder |
| `--color-on-primary` | `#FFFFFF` | Text and icons on red |
| `--color-bg` | `#FCF7F2` | Page background (warm cream); also the phone's status bar color |
| `--color-surface` | `#FFFFFF` | Cards, secondary buttons, dialogs |
| `--color-border` | `#E5E0DB` | Card and chip outlines |
| `--color-text` | `#1C1C21` | Headings and body text; also the banner background |
| `--color-text-muted` | `#737380` | Subtitles, hints, meta lines ("Mexican · $$ · 0.8 mi away") |
| `--color-disabled-bg` / `-text` | `#E0DEDB` / `#737380` | Disabled buttons |
| `--color-like` / `-soft` | `#29AD6B` / `#E0F5E8` | Like button, LIKE stamp, "Open now", "Done" pills |
| `--color-pass` | `#ED4545` | Pass button and NOPE stamp |
| `--color-error` | `#D92D20` | Error messages |
| `--color-progress-track` | `#EBE5E0` | Empty part of the swipe progress bar |
| Confetti | `#FFD94D` `#8CD9FF` `#FFB2CC` | Match screen only |

Contrast (WCAG):

| Pair | Ratio |
| --- | --- |
| Body text on cream | 15.9:1 |
| Muted text on cream | 4.4:1 |
| Muted text on white | 4.7:1 |
| Error on cream | 4.5:1 |
| White on brand red (button labels, Match page) | 3.9:1 |

White on brand red passes for large text and icons (3:1). It falls just short of the 4.5:1 for normal-size text, so button labels stay 17 px semibold and short. `#D4372C` (the pressed red) reaches 4.8:1 if we ever need small white text on red.

Pass red and brand red are almost the same color. That's fine because Pass always comes with its ✕ icon, but don't use red alone to mean "no".

## Type

One family: **Inter** (variable, loaded from `@fontsource-variable/inter`), falling back to the system font.

| Token | Size | Weight | Where |
| --- | --- | --- | --- |
| `--font-size-match-title` | 38 | Bold | "It's a match!" |
| `--font-size-display` | 34 | Bold | Home headline |
| `--font-size-title` | 30 | Bold | Screen titles ("Join a group") |
| `--font-size-headline` | 28 | Bold | "You're done swiping!" |
| `--font-size-sheet-title` | 26 | Bold | Details sheet |
| `--font-size-card-title` | 24 | Bold | Restaurant name on a card |
| `--font-size-body`, `-button`, `-input` | 17 | Regular / Semibold (buttons) | Body text, buttons, text fields (17 px keeps iPhones from zooming in) |
| `--font-size-subtitle` | 16 | Regular | Subtitles |
| `--font-size-eyebrow`, `-meta` | 15 | Semibold / Regular | "Crave" above the Home headline; card meta line |
| `--font-size-label` | 14 | Medium | Field labels, banners, errors |
| `--font-size-caption` | 13 | Regular | Small notes |
| `--font-size-overline` | 12 | Semibold, 1.5 px tracking, caps | "GROUP CODE", pills |

The group code is the exception: 40 px with 10 px letter spacing, in brand red.

## Space and shape

- Screens: 24 px sides, 60 px top, 36 px bottom (more if the phone has a notch or home bar), 16 px between blocks, max width 430 px.
- Tap targets are at least **44 × 44 px**, even when the thing you see is smaller.
- Radius:
  - buttons 14
  - cards 20
  - swipe card 24
  - app icon tile 24
  - code boxes 16
  - photos 14, thumbnails 12
  - bottom sheet 28
  - chips and pills fully round

## Components

- **Buttons:** 52 px tall, full width.
  - *Primary:* red with white text; there's one per screen, for the main action.
  - *Secondary:* white with a hairline border and dark text.
  - *Disabled:* grey.
  - *Text links:* muted, centered, used for minor actions ("Back to home", "End round now").
  - Pressing shrinks a button slightly.
- **Chips** (filters): white with a border; selected is soft red with a red border and red text.
- **Restaurant card:** a photo on top with an "Open now / Closed now" pill, then name, meta line ("Cuisine · $$ · 0.8 mi away") and ★ rating. Anything the restaurant source doesn't know (price, rating, hours) is left out, never shown blank or as "—".
- **Photo placeholder:** the red logo mark on the soft tint. It shows while a photo loads, when it fails, and when there's no photo (most OpenStreetMap places).
- **Banner:** dark pill that slides in at the top of the screen for short messages ("Mia nudged you", "Waking up the server…", "Reconnecting…"). One at a time.
- **Dialog:** for "are you sure?" questions only (Leave group, End round).
- **Avatars:** first letter on a soft red circle, 44 px (32 px small).

## Motion

| Token | Value | Use |
| --- | --- | --- |
| `--duration-press` | 160 ms | Button press, stamp fades |
| `--duration-pop` | 320 ms | Things appearing (banner, Match card) |
| `--duration-fly` | 280 ms | A swiped card leaving |
| `--duration-snap` | 420 ms + slight overshoot | A card springing back when you let go early |
| `--duration-sheet` | 320 ms, iOS-style curve | Details sheet |

- Default curve `--ease-out`. Motion always confirms something the person did; nothing moves on its own except confetti and loading pulses.
- With "Reduce motion" on, cards fade instead of flying and the rest just appears.

## Voice

Short, friendly, plain words, no exclamation spam: "Waiting on 2 friends to finish…", "Nobody agreed on every spot." Errors say what happened and what to do: "Can't reach the server. Check your connection and try again."
