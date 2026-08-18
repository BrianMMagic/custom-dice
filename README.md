# Dice Lab — custom dice web app

A mobile-first web app for building your own dice — with **numbers, letters, spots,
words or emoji** on the faces — and rolling them. No build step, no dependencies,
no server: it's plain HTML, CSS and JavaScript, and everything is stored on the
device in `localStorage`.

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000    # then visit http://localhost:8000
```

Serving over http(s) also enables the service worker, so the app works offline and
can be installed to a phone's home screen ("Add to Home Screen").

## What it does

**Three screens, one bottom tab bar**

| Tab | What it's for |
| --- | --- |
| **Roll** | The tray: which dice are in play, how many of each, the big Roll button, and the results |
| **Dice** | Your collection — tap a die to add it to the tray, or edit it |
| **History** | The last 50 rolls with their faces and totals |

**Making a die**

Tap **New die**, then pick what goes on the faces:

- **123 — numbers**: any range (`1–6`, `0–9`, `1–100`), plus one-tap `d4 / d6 / d8 / d10 / d12 / d20 / d100` presets
- **ABC — letters**: `A–F`, `A–M`, `A–Z` or any slice
- **Spots — pips**: real dot patterns for 1–9 spots
- **Words — text**: type your own, or start from a preset (Yes/No, Heads/Tails, Chores, Actions, Directions)
- **Emoji**: tap from the emoji palette

Every face is editable one by one, faces can be added, removed or shuffled, and each
die gets a name and a colour. Face text shrinks automatically so long words still fit,
and face labels flip to dark ink on pale colours so they stay readable.

**Rolling**

- Big thumb-reachable Roll button; the tray dock stays pinned above the tab bar
- Tap any landed die to reroll just that one
- Totals are added up automatically whenever faces are numbers (toggleable)
- A die that lands on its own highest number is outlined
- Optional **shake to roll** (asks for motion permission on iOS) and vibration feedback
- Press <kbd>Space</kbd> to roll on a desktop keyboard

## Layout

```
index.html              markup for the three views and the two sheets
css/styles.css          mobile-first styles, light + dark via prefers-color-scheme
js/model.js             dice data, localStorage, crypto-backed rolling
js/render.js            face/pip rendering and the card, tray, result and history DOM
js/app.js               navigation, tray, editor, settings, shake detection
sw.js                   offline cache (bump CACHE when shell files change)
manifest.webmanifest    installable-app metadata
icons/                  app icons
```

Rolls use `crypto.getRandomValues` with rejection sampling, so every face is equally
likely — no modulo bias.

## Notes

- Data lives only in this browser on this device; there is no account or sync.
- **Settings → Reset app** restores the six starter dice and clears everything else.
