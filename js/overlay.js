/* MLBB Stream Overlay — renderer + live state sync */
(() => {
  "use strict";

  const DEFAULTS = window.MLBB_DEFAULTS || {};
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const params = new URLSearchParams(location.search);

  if (params.get("preview") === "1") root.classList.add("preview");

  const ICONS = window.MLBB_ICONS || {};

  const KICKERS = {
    win: "Session update",
    loss: "Session update",
    mvp: "MVP unlocked",
    info: "Update"
  };

  let state = null;
  let lastPulse = 0;
  let toastTimer = 0;
  let tickerSig = "";
  let socialsSig = "";
  let connected = false;

  /* ── helpers ─────────────────────────────────────────────────── */
  const hexToRgb = (hex) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ""));
    return m ? `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}` : null;
  };

  const initialsOf = (name, max = 2) =>
    String(name || "")
      .trim()
      .split(/\s+/)
      .slice(0, max)
      .map((w) => w[0] || "")
      .join("")
      .toUpperCase() || "??";

  const clampInt = (v, min, max) => {
    const n = parseInt(v, 10);
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

  /* ── theme ───────────────────────────────────────────────────── */
  function applyTheme(theme = {}) {
    const accent = theme.accent || "#f7c948";
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

  /* ── ticker ──────────────────────────────────────────────────── */
  function buildTicker(text) {
    const track = $("tickerTrack");
    track.innerHTML = "";
    for (let i = 0; i < 2; i++) {
      const copy = document.createElement("span");
      copy.className = "ticker-copy";
      copy.textContent = text;
      const sep = document.createElement("span");
      sep.className = "sep";
      sep.textContent = "◆";
      copy.appendChild(sep);
      track.appendChild(copy);
    }
    requestAnimationFrame(() => updateTickerDuration(state?.ticker?.speed));
  }

  function updateTickerDuration(speed) {
    const track = $("tickerTrack");
    if (!track || !state || !state.ticker.enabled) return;
    const half = track.scrollWidth / 2;
    if (!half) return;
    const pxPerSec = Math.min(200, Math.max(8, Number(speed) || 38));
    track.style.setProperty("--ticker-duration", `${(half / pxPerSec).toFixed(2)}s`);
  }

  function renderTicker(ticker = {}) {
    const el = $("ticker");
    const enabled = !!ticker.enabled && !!String(ticker.text || "").trim();
    el.classList.toggle("is-hidden", !enabled);
    if (!enabled) return;

    const text = String(ticker.text);
    if (text !== tickerSig) {
      tickerSig = text;
      buildTicker(text);
    }
    updateTickerDuration(ticker.speed);
  }

  /* ── main render ─────────────────────────────────────────────── */
  function render(next) {
    state = next;
    applyTheme(next.theme);

    /* brand */
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

    /* match pill */
    const match = next.match || {};
    const matchBits = [match.mode, match.rank, match.queue].filter((v) => String(v || "").trim());
    $("matchPill").classList.toggle("is-hidden", matchBits.length === 0);
    setText($("matchMode"), match.mode || "");
    setText($("matchRank"), match.rank || "");
    setText($("matchQueue"), match.queue || "");

    /* session */
    const session = next.session || {};
    const wins = clampInt(session.wins, 0, 9999);
    const losses = clampInt(session.losses, 0, 9999);
    const mvp = clampInt(session.mvp, 0, 9999);
    const goalTarget = Math.max(1, clampInt(session.goalTarget, 1, 9999));
    const games = wins + losses;
    const winRate = games > 0 ? Math.round((wins / games) * 100) : 0;

    setNum($("statWins"), wins);
    setNum($("statLosses"), losses);
    setNum($("statMvp"), mvp);
    setNum($("winRate"), winRate);
    $("winRing").style.strokeDashoffset = String(188.5 * (1 - winRate / 100));

    setText($("goalLabel"), session.goalLabel || "Ranked wins today");
    setNum($("goalNow"), wins);
    setText($("goalTarget"), goalTarget);
    $("goalFill").style.width = `${Math.min(100, (wins / goalTarget) * 100)}%`;

    /* camera nameplate */
    setText($("camName"), streamer.name || "STREAMER");
    setText($("camRank"), match.rank || "RANKED");

    /* hero */
    const hero = next.hero || {};
    const heroEnabled = !!hero.enabled && !!String(hero.name || "").trim();
    $("heroCard").classList.toggle("is-hidden", !heroEnabled);
    if (heroEnabled) {
      setText($("heroName"), hero.name);
      setText($("heroRole"), hero.role || "Hero");
      setText($("heroNote"), hero.note || "");
      setText($("heroInitials"), String(hero.name).slice(0, 2).toUpperCase());
      const img = String(hero.image || "").trim();
      $("heroAvatar").classList.toggle("has-img", !!img);
      if (img) $("heroImg").src = img;
      else $("heroImg").removeAttribute("src");
    }

    /* ticker */
    renderTicker(next.ticker);

    /* toast pulse */
    handlePulse(next.pulse);
  }

  /* ── toast ───────────────────────────────────────────────────── */
  function handlePulse(pulse) {
    if (!pulse || !pulse.id || pulse.id <= lastPulse) return;
    lastPulse = pulse.id;
    if (!pulse.text) return;

    const toast = $("toast");
    toast.dataset.type = pulse.type || "info";
    setText($("toastKicker"), pulse.kicker || KICKERS[pulse.type] || KICKERS.info);
    setText($("toastText"), pulse.text);

    toast.classList.remove("show");
    void toast.offsetWidth;
    toast.classList.add("show");

    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3400);
  }

  /* ── state transport ─────────────────────────────────────────── */
  function subscribe() {
    if (connected) return;
    connected = true;
    const events = new EventSource("/events");
    events.onmessage = (event) => {
      try {
        const incoming = JSON.parse(event.data);
        render(merge(DEFAULTS, incoming));
      } catch (err) {
        console.warn("Bad overlay state", err);
      }
    };
    events.onerror = () => {
      /* EventSource reconnects on its own; keep the last state on screen. */
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
      /* Opened as a plain file, or the server is not running yet. */
      render(merge(DEFAULTS, {}));
      setTimeout(boot, 4000);
    }
  }

  document.fonts?.ready.then(() => updateTickerDuration(state?.ticker?.speed));
  boot();
})();
