# MLBB Stream Overlay

A self-hosted OBS overlay pack for **Mobile Legends: Bang Bang** YouTube streams.

It includes a transparent in-game HUD, full-screen Starting Soon / BRB / Ending
scenes, and a control panel that updates OBS live while you stream. No account,
no cloud, no npm install — just Python 3 (already on macOS) and OBS.

> The overlay is 1920 × 1080 with a transparent background. The preview
> backdrop is only visible in the control panel / `?preview=1`.

---

## Quick start

1. **Start the server** — double-click `start.command`.
   If macOS blocks it: right-click → **Open**, or run:
   ```bash
   chmod +x start.command
   ./start.command
   ```
   The control panel opens at <http://localhost:8765/control.html>.

2. **Add the overlay in OBS**
   - Add a **Browser** source, size **1920 × 1080**.
   - URL: `http://localhost:8765/overlay.html`
   - Leave width/height at 1920 × 1080 and don't add custom CSS.

3. **Layer your scene** (bottom → top)
   1. Display / Game Capture
   2. Webcam
   3. The overlay browser source

4. **Align the webcam** with the frame:
   - Position **X 44 · Y 752**
   - Size **448 × 252**

5. **Add the full-screen scenes** (optional, recommended)
   Create OBS scenes named *Starting Soon*, *BRB* and *Ending*, each with one
   Browser source at 1920 × 1080:

   | Scene | URL |
   |---|---|
   | Starting Soon | `http://localhost:8765/screens.html?screen=starting` |
   | BRB | `http://localhost:8765/screens.html?screen=brb` |
   | Ending | `http://localhost:8765/screens.html?screen=ending` |

   The countdown is shared between refreshes, so switching scenes won't reset it.

6. **Go live on YouTube**
   In OBS: **Settings → Stream → YouTube**, paste your stream key, then start
   streaming. The overlay is only a source — it does not touch your stream key.

---

## Control panel

Open <http://localhost:8765/control.html> (the `start.command` launcher does it
for you). Everything saves automatically.

- **Session stats** — `+ Win`, `+ Loss`, `+ MVP` buttons bump the score and play
  a short toast on stream. The win-rate ring and goal bar update live.
- **Hero pick** — toggle the hero card, set name / role / note, and optionally
  paste a square hero portrait URL.
- **Ticker** — scrolling message at the bottom, with speed control.
- **Socials** — YouTube, TikTok, Facebook, Instagram, Discord, Twitch, X, Kick.
- **Theme** — five presets plus custom accent / secondary colors.
- **Screen text** — titles, subtitles and countdown minutes for all three scenes.
- **Restart countdowns** — if a countdown already hit `00:00`, reset it here.
- **Live preview** — a scaled 1920 × 1080 preview of the real overlay.
- **Screen sources** — copy the exact URLs for your OBS scenes.

### Control from your phone

```bash
HOST=0.0.0.0 ./start.command
```

Then open `http://YOUR-MAC-IP:8765/control.html` on your phone (same Wi-Fi).
macOS may ask for firewall permission the first time.

---

## Customising

- **Colors** — use the theme card. The choice applies to the overlay and all
  screen pages immediately.
- **Logo** — initials, or paste a square image URL. Keep it square; it is
  clipped into a hexagon.
- **Hero portrait** — any square image URL works (MLBB hero icon, splash crop,
  or a local image served from this folder, e.g. `/assets/my-hero.png`).
- **Text** — all labels are editable from the control panel. Long hero/title
  names shrink automatically on the screen pages.
- **Layout** — sizes and positions live in `css/overlay.css`. The webcam frame
  is `.cam` (left 44, bottom 76, 448 × 252). If you move it, move your OBS
  webcam source by the same amount.
- **State** — everything is stored in `state.json`. Delete it while the server
  is stopped to start from `default-state.json`, or use **Reset everything**.

---

## Files

```
mlbb-overlay/
├── start.command          ← double-click launcher
├── server.py              ← zero-dependency local server + live sync
├── control.html           ← control panel
├── overlay.html           ← transparent in-game overlay
├── screens.html           ← starting / BRB / ending background
├── default-state.json     ← seed content
├── state.json             ← your live content (created on first run)
├── css/
│   ├── overlay.css
│   ├── screens.css
│   └── control.css
├── js/
│   ├── defaults.js
│   ├── icons.js
│   ├── overlay.js
│   ├── screens.js
│   └── control.js
└── assets/
    └── fonts/             ← bundled fonts (works offline)
```

The control panel and OBS talk over Server-Sent Events on
`http://localhost:8765/events`, so updates appear in OBS instantly.

---

## Troubleshooting

**“Server offline — retrying” in the control panel**
The Terminal window running `start.command` was closed. Run it again. If port
8765 is busy, another copy is already running — the launcher will reuse it.

**The overlay looks black / not transparent**
Make sure it is a **Browser** source (not Media Source), sized 1920 × 1080.
Transparency is the default; don't add a custom CSS background.

**My webcam doesn't sit in the frame**
Place the webcam at exactly **X 44 · Y 752**, **448 × 252**. If you scale the
webcam, scale the overlay source by the same factor (or keep both at 100%).

**The countdown says 00:00**
Press **Restart countdowns** in the control panel. Countdowns also reset when
you change the minutes value.

**I changed the port**
```bash
PORT=9000 ./start.command
```
Then update the URLs in OBS and in the control panel (they are generated from
the address you open the panel with).

**I want a clean slate**
Stop the server, delete `state.json`, start again. Or use **Reset everything**.

**YouTube chat**
Add your YouTube chat pop-out URL as its own Browser source in OBS. The overlay
pack intentionally doesn't include chat so you can position/theme it yourself.

---

## Notes

- Everything runs locally; nothing is uploaded anywhere.
- Fonts (Chakra Petch, Rajdhani, Inter) are bundled in `assets/fonts`, so the
  overlay still looks right with no internet.
- Tested layout: 1920 × 1080 at 100% source scale. If you stream at 2560 × 1440,
  keep the browser source at 1920 × 1080 and scale it up in OBS, or change the
  fixed sizes in the CSS.
