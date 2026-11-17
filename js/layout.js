/* MLBB Overlay — responsive canvas helper.
 *
 * The overlay is designed on a fixed canvas (1920 x 1080 for landscape,
 * 1080 x 1920 for YouTube Shorts) and then scaled to fit whatever size the
 * OBS browser source is.
 *
 * Which design is used is decided in this order:
 *   1. A mode pinned in the URL (?mode=portrait, #portrait, /portrait/...)
 *   2. The format picked in the control panel (landscape / portrait / both)
 *   3. The shape of the browser source (taller than wide = portrait)
 *
 * The control panel pushes its choice over the live connection, so the
 * format can be switched while streaming without touching the OBS URL.
 */
(() => {
  "use strict";

  const MODES = {
    landscape: { w: 1920, h: 1080 },
    portrait: { w: 1080, h: 1920 }
  };

  /* Friendly names people actually type. */
  const ALIASES = {
    landscape: "landscape",
    land: "landscape",
    wide: "landscape",
    horizontal: "landscape",
    desktop: "landscape",
    youtube: "landscape",
    "16:9": "landscape",
    "16x9": "landscape",
    portrait: "portrait",
    vertical: "portrait",
    tall: "portrait",
    short: "portrait",
    shorts: "portrait",
    tiktok: "portrait",
    reels: "portrait",
    mobile: "portrait",
    "9:16": "portrait",
    "9x16": "portrait"
  };

  const root = document.documentElement;
  const params = new URLSearchParams(location.search);

  let mode = "landscape";   /* design currently on screen */
  let panelMode = null;     /* format chosen in the control panel */

  function normalize(value) {
    const key = String(value || "").trim().toLowerCase();
    if (!key) return null;
    if (MODES[key]) return key;
    return ALIASES[key] || null;
  }

  /* A mode pinned in the URL always wins for that source. */
  function pinned() {
    const candidates = [];

    for (const name of ["mode", "format", "layout"]) {
      candidates.push(normalize(params.get(name)));
    }

    candidates.push(normalize(location.hash.replace(/^#/, "")));

    const path = /^\/(landscape|land|wide|portrait|vertical|shorts|short|tall)(?:\/|$)/i
      .exec(location.pathname);
    if (path) candidates.push(normalize(path[1]));

    return candidates.find(Boolean) || null;
  }

  /* Fallback: the shape of the browser source. */
  function detect() {
    return window.innerHeight > window.innerWidth ? "portrait" : "landscape";
  }

  function resolve() {
    const locked = pinned();
    if (locked) return locked;
    if (panelMode === "landscape" || panelMode === "portrait") return panelMode;
    return detect();
  }

  function fit() {
    const design = MODES[mode];
    const scale = Math.min(window.innerWidth / design.w, window.innerHeight / design.h);
    root.style.setProperty("--fit", String(Number.isFinite(scale) && scale > 0 ? scale : 1));
  }

  function apply(next) {
    mode = MODES[next] ? next : "landscape";
    const design = MODES[mode];
    root.classList.toggle("is-portrait", mode === "portrait");
    root.classList.toggle("is-landscape", mode === "landscape");
    root.style.setProperty("--design-w", `${design.w}px`);
    root.style.setProperty("--design-h", `${design.h}px`);
    fit();
  }

  function announce() {
    window.dispatchEvent(new CustomEvent("mlbb:layout", { detail: { mode } }));
  }

  /* Re-fit on resize; switch design when the shape flips. */
  function update() {
    const next = resolve();
    const changed = next !== mode;
    if (changed) apply(next);
    else fit();
    if (changed) announce();
    return changed;
  }

  /* Called with the format chosen in the control panel:
   * "landscape", "portrait" or "both" (each source picks its own design). */
  function setPanelMode(value) {
    const next = value === "landscape" || value === "portrait" ? value : null;
    if (next === panelMode) return false;
    panelMode = next;
    return update();
  }

  let timer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = window.setTimeout(update, 120);
  });

  window.MLBB_LAYOUT = {
    MODES,
    apply,
    detect,
    update,
    setPanelMode,
    get mode() { return mode; },
    get panelMode() { return panelMode; },
    get pinnedMode() { return pinned(); },
    get design() { return MODES[mode]; }
  };

  apply(resolve());
})();
