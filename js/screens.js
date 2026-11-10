/* MLBB Stream Screens — starting soon / BRB / ending */
(() => {
  "use strict";

  const DEFAULTS = window.MLBB_DEFAULTS || {};
  const ICONS = window.MLBB_ICONS || {};
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const params = new URLSearchParams(location.search);

  const screenKey = ["starting", "brb", "ending"].includes(params.get("screen"))
    ? params.get("screen")
    : "starting";

  const KICKERS = {
    starting: "Mobile Legends: Bang Bang",
    brb: "Quick break",
    ending: "Stream complete"
  };

  const FOOT_NOTES = {
    starting: "Follow to get notified",
    brb: "Back in a moment",
    ending: "See you next stream"
  };

  const CD_CAPTIONS = {
    starting: "Stream starts in",
    brb: "Back in"
  };

  const screenEl = $("screen");
  screenEl.dataset.screen = screenKey;
  screenEl.classList.toggle("is-ending", screenKey === "ending");

  let state = null;
  let lastPulse = 0;
  let cdMinutes = null;
  let countdownTimer = 0;
  let connected = false;
  let accent = "#f7c948";

  /* ── helpers ─────────────────────────────────────────────────── */
  const hexToRgb = (hex) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ""));
    return m ? `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}` : null;
  };

  const initialsOf = (name) =>
    String(name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] || "")
      .join("")
      .toUpperCase() || "??";

  const clampInt = (value, min, max) => {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  };

  function merge(base, extra) {
    const out = Array.isArray(base) ? base.slice() : { ...(base || {}) };
    if (!extra || typeof extra !== "object") return out;
    for (const [key, value] of Object.entries(extra)) {
      if (
        value && typeof value === "object" && !Array.isArray(value) &&
        out[key] && typeof out[key] === "object" && !Array.isArray(out[key])
      ) {
        out[key] = merge(out[key], value);
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  function setText(el, value) {
    if (!el) return;
    const next = value == null ? "" : String(value);
    if (el.textContent !== next) el.textContent = next;
  }

  function setNum(el, value) {
    if (!el) return;
    const next = String(value);
    if (el.textContent === next) return;
    el.textContent = next;
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }

  function applyTheme(theme = {}) {
    accent = theme.accent || "#f7c948";
    const accent2 = theme.accent2 || "#35e0ff";
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-2", accent2);
    const a = hexToRgb(accent);
    const b = hexToRgb(accent2);
    if (a) root.style.setProperty("--accent-rgb", a);
    if (b) root.style.setProperty("--accent2-rgb", b);
    if (theme.bg) root.style.setProperty("--bg", theme.bg);
  }

  /* ── socials ─────────────────────────────────────────────────── */
  let socialsSig = "";

  function renderSocials(socials) {
    const list = Array.isArray(socials) ? socials.filter((s) => s && s.label) : [];
    const sig = JSON.stringify(list);
    if (sig === socialsSig) return;
    socialsSig = sig;

    const wrap = $("socials");
    wrap.innerHTML = "";
    for (const social of list) {
      const chip = document.createElement("span");
      chip.className = "social";
      chip.innerHTML = ICONS[social.type] || ICONS.other;
      const label = document.createElement("span");
      label.textContent = social.label;
      chip.appendChild(label);
      wrap.appendChild(chip);
    }
  }

  /* ── countdown ───────────────────────────────────────────────── */
  function storageKey() {
    return `mlbb-countdown:${screenKey}`;
  }

  function readDeadline(minutes) {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey()) || "null");
      if (raw && raw.minutes === minutes && typeof raw.end === "number") return raw.end;
    } catch { /* localStorage may be unavailable */ }
    return null;
  }

  function writeDeadline(minutes, end) {
    try {
      localStorage.setItem(storageKey(), JSON.stringify({ minutes, end }));
    } catch { /* ignore */ }
  }

  function paintCountdown(end) {
    const remaining = Math.max(0, end - Date.now());
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor(remaining / 1000) % 60;
    setNum($("cdMin"), String(minutes).padStart(2, "0"));
    setNum($("cdSec"), String(seconds).padStart(2, "0"));

    const caption = $("cdCaption");
    if (remaining <= 0) {
      caption.textContent = screenKey === "starting" ? "Starting now" : "Back now";
      caption.classList.add("is-live");
    } else {
      caption.textContent = CD_CAPTIONS[screenKey] || "Starting in";
      caption.classList.remove("is-live");
    }
  }

  function setupCountdown(config) {
    const hide = screenKey === "ending";
    const minutes = clampInt(config.minutes, 0, 999);

    $("countdown").classList.toggle("is-hidden", hide || minutes <= 0);
    $("cdCaption").classList.toggle("is-hidden", hide || minutes <= 0);

    if (hide || minutes <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = 0;
      return;
    }

    if (cdMinutes === minutes && countdownTimer) return;
    cdMinutes = minutes;

    let end = readDeadline(minutes);
    if (end == null) {
      end = Date.now() + minutes * 60000;
      writeDeadline(minutes, end);
    }

    clearInterval(countdownTimer);
    paintCountdown(end);
    countdownTimer = window.setInterval(() => paintCountdown(end), 250);
  }

  /* ── render ──────────────────────────────────────────────────── */
  function render(next) {
    state = next;
    applyTheme(next.theme);

    const streamer = next.streamer || {};
    const mark = $("brandMark");
    const avatar = String(streamer.avatar || "").trim();
    mark.classList.toggle("has-img", !!avatar);
    if (avatar) $("brandAvatar").src = avatar;
    else $("brandAvatar").removeAttribute("src");

    setText($("brandInitials"), streamer.initials || initialsOf(streamer.name));
    setText($("streamerName"), streamer.name || "STREAMER");
    setText($("streamerTag"), streamer.tagline || "MOBILE LEGENDS · BANG BANG");
    renderSocials(next.socials);

    const match = next.match || {};
    $("rankPill").classList.toggle("is-hidden", !String(match.rank || "").trim());
    setText($("rankText"), match.rank || "");

    const config = (next.screens && next.screens[screenKey]) || {};
    const title = String(config.title || "").trim() || "MOBILE LEGENDS";
    setText($("title"), title);
    $("title").dataset.text = title;
    $("title").style.fontSize = title.length > 16
      ? `${Math.max(62, Math.round(132 * 16 / title.length))}px`
      : "";
    setText($("subtitle"), config.subtitle || "");
    setText($("kicker"), KICKERS[screenKey]);
    setText($("footNote"), FOOT_NOTES[screenKey]);

    const session = next.session || {};
    const wins = clampInt(session.wins, 0, 9999);
    const losses = clampInt(session.losses, 0, 9999);
    const mvp = clampInt(session.mvp, 0, 9999);
    const rate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;
    setNum($("sumWins"), wins);
    setNum($("sumLosses"), losses);
    setNum($("sumRate"), `${rate}%`);
    setNum($("sumMvp"), mvp);

    setupCountdown(config);
    handlePulse(next.pulse);
  }

  /* ── pulse (used by the control panel's "restart timers" button) ── */
  function handlePulse(pulse) {
    if (!pulse || !pulse.id || pulse.id <= lastPulse) return;
    lastPulse = pulse.id;
    if (pulse.type !== "reset") return;

    try {
      localStorage.removeItem("mlbb-countdown:starting");
      localStorage.removeItem("mlbb-countdown:brb");
    } catch { /* ignore */ }
    cdMinutes = null;
    if (state) render(state);
  }

  /* ── particles ───────────────────────────────────────────────── */
  function startParticles() {
    const canvas = $("particles");
    const ctx = canvas.getContext("2d");
    const W = 1920;
    const H = 1080;
    const hexes = Array.from({ length: 28 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 6 + Math.random() * 26,
      vx: (Math.random() - 0.5) * 0.09,
      vy: 0.07 + Math.random() * 0.2,
      alpha: 0.03 + Math.random() * 0.07,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.0016,
      phase: Math.random() * Math.PI * 2
    }));

    function hexPath(x, y, r, rot) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = rot + (i * Math.PI) / 3;
        const px = x + Math.cos(angle) * r;
        const py = y + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    }

    function frame(time) {
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.2;

      for (const hex of hexes) {
        hex.x += hex.vx;
        hex.y -= hex.vy;
        hex.rot += hex.spin;
        if (hex.y < -50) {
          hex.y = H + 50;
          hex.x = Math.random() * W;
        }
        if (hex.x < -50) hex.x = W + 50;
        if (hex.x > W + 50) hex.x = -50;

        ctx.globalAlpha = hex.alpha * (0.65 + 0.35 * Math.sin(time * 0.001 + hex.phase));
        hexPath(hex.x, hex.y, hex.r, hex.rot);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  /* ── transport ───────────────────────────────────────────────── */
  function subscribe() {
    if (connected) return;
    connected = true;
    const events = new EventSource("/events");
    events.onmessage = (event) => {
      try {
        render(merge(DEFAULTS, JSON.parse(event.data)));
      } catch (err) {
        console.warn("Bad screen state", err);
      }
    };
  }

  async function boot() {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const incoming = await res.json();
      lastPulse = (incoming.pulse && incoming.pulse.id) || 0;
      render(merge(DEFAULTS, incoming));
      subscribe();
    } catch {
      render(merge(DEFAULTS, {}));
      setTimeout(boot, 4000);
    }
  }

  startParticles();
  boot();
})();
