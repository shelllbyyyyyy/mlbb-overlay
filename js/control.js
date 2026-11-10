/* MLBB Overlay — control panel logic */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const API = "/api/state";
  const PULSE = "/api/pulse";

  const SOCIAL_TYPES = [
    ["youtube", "YouTube"],
    ["tiktok", "TikTok"],
    ["facebook", "Facebook"],
    ["instagram", "Instagram"],
    ["discord", "Discord"],
    ["twitch", "Twitch"],
    ["x", "X / Twitter"],
    ["kick", "Kick"],
    ["other", "Other"]
  ];

  const PRESETS = [
    { name: "Ranked Gold", accent: "#f7c948", accent2: "#35e0ff", bg: "#060a12" },
    { name: "Cyber", accent: "#ff3df2", accent2: "#35e0ff", bg: "#080614" },
    { name: "Emerald", accent: "#37f5a8", accent2: "#7cf7ff", bg: "#04100c" },
    { name: "Crimson", accent: "#ff5566", accent2: "#ffb347", bg: "#120608" },
    { name: "Violet", accent: "#a78bfa", accent2: "#67e8f9", bg: "#0a0714" }
  ];

  const SCREENS = [
    { key: "starting", label: "Starting soon" },
    { key: "brb", label: "Be right back" },
    { key: "ending", label: "Ending" }
  ];

  let state = null;
  let saveTimer = 0;
  let connected = false;

  /* ── path helpers ────────────────────────────────────────────── */
  const getPath = (obj, path) =>
    path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);

  function setPath(obj, path, value) {
    const keys = path.split(".");
    let target = obj;
    for (const key of keys.slice(0, -1)) {
      if (!target[key] || typeof target[key] !== "object") target[key] = {};
      target = target[key];
    }
    target[keys[keys.length - 1]] = value;
  }

  const clampInt = (value, min, max) => {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  };

  const hexToRgb = (hex) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ""));
    return m ? `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}` : null;
  };

  /* ── status ──────────────────────────────────────────────────── */
  function setStatus(ok) {
    connected = ok;
    const el = $("status");
    el.classList.toggle("ok", ok);
    el.classList.toggle("bad", !ok);
    $("statusText").textContent = ok ? "Live sync connected" : "Server offline — retrying";
  }

  /* ── theme ───────────────────────────────────────────────────── */
  function renderThemeButtons() {
    const wrap = $("themes");
    wrap.innerHTML = "";
    for (const preset of PRESETS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "theme-btn";
      btn.dataset.accent = preset.accent;
      btn.dataset.accent2 = preset.accent2;
      btn.dataset.bg = preset.bg;
      btn.title = preset.name;

      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = `linear-gradient(135deg, ${preset.accent}, ${preset.accent2})`;

      const label = document.createElement("span");
      label.textContent = preset.name;

      btn.append(swatch, label);
      btn.addEventListener("click", () => {
        if (!state) return;
        state.theme.accent = preset.accent;
        state.theme.accent2 = preset.accent2;
        state.theme.bg = preset.bg;
        $("themeAccent").value = preset.accent;
        $("themeAccent2").value = preset.accent2;
        applyPanelTheme(state.theme);
        scheduleSave();
      });
      wrap.appendChild(btn);
    }
  }

  function applyPanelTheme(theme = {}) {
    const accent = theme.accent || "#f7c948";
    const accent2 = theme.accent2 || "#35e0ff";
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-2", accent2);
    const a = hexToRgb(accent);
    const b = hexToRgb(accent2);
    if (a) root.style.setProperty("--accent-rgb", a);
    if (b) root.style.setProperty("--accent2-rgb", b);

    $("themeAccent").value = accent;
    $("themeAccent2").value = accent2;
    document.querySelectorAll(".theme-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.accent === accent && btn.dataset.accent2 === accent2);
    });
  }

  /* ── socials ─────────────────────────────────────────────────── */
  function readSocials() {
    return [...$("socialList").querySelectorAll(".social-row")]
      .map((row) => ({
        type: row.querySelector("select").value,
        label: row.querySelector("input").value.trim()
      }))
      .filter((social) => social.label);
  }

  function renderSocialRows(socials) {
    const wrap = $("socialList");
    wrap.innerHTML = "";

    for (const social of socials || []) {
      const row = document.createElement("div");
      row.className = "social-row";

      const select = document.createElement("select");
      for (const [value, label] of SOCIAL_TYPES) select.add(new Option(label, value));
      select.value = SOCIAL_TYPES.some(([value]) => value === social.type) ? social.type : "other";

      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 48;
      input.placeholder = "handle or invite link";
      input.value = social.label || "";
      input.autocomplete = "off";

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-btn";
      remove.title = "Remove social";
      remove.textContent = "×";

      const sync = () => {
        if (!state) return;
        state.socials = readSocials();
        scheduleSave();
      };

      select.addEventListener("change", sync);
      input.addEventListener("input", sync);
      remove.addEventListener("click", () => {
        row.remove();
        if (!state) return;
        state.socials = readSocials();
        scheduleSave();
      });

      row.append(select, input, remove);
      wrap.appendChild(row);
    }
  }

  /* ── saving ──────────────────────────────────────────────────── */
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(save, 240);
  }

  async function save() {
    if (!state) return;
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus(true);
      $("footerState").textContent = `Saved ${new Date().toLocaleTimeString()}`;
    } catch {
      setStatus(false);
    }
  }

  async function pulse(type, text, kicker = "") {
    try {
      const res = await fetch(PULSE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, text, kicker })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus(true);
    } catch {
      setStatus(false);
    }
  }

  /* ── form binding ────────────────────────────────────────────── */
  function bindText(id, path) {
    const el = $(id);
    el.addEventListener("input", () => {
      if (!state) return;
      setPath(state, path, el.value);
      scheduleSave();
    });
  }

  function bindNumber(id, path, min, max) {
    const el = $(id);
    el.addEventListener("input", () => {
      if (!state) return;
      setPath(state, path, el.value === "" ? min : clampInt(el.value, min, max));
      scheduleSave();
    });
    el.addEventListener("blur", () => {
      if (!state) return;
      el.value = getPath(state, path);
    });
  }

  function bindCheck(id, path) {
    const el = $(id);
    el.addEventListener("change", () => {
      if (!state) return;
      setPath(state, path, el.checked);
      scheduleSave();
    });
  }

  function bindThemeColor(id, key) {
    const el = $(id);
    el.addEventListener("input", () => {
      if (!state) return;
      state.theme[key] = el.value;
      applyPanelTheme(state.theme);
      scheduleSave();
    });
  }

  function syncStatInputs() {
    $("statWins").value = state.session.wins;
    $("statLosses").value = state.session.losses;
    $("statMvp").value = state.session.mvp;
  }

  /* ── fill form from state ────────────────────────────────────── */
  function fillForm() {
    $("streamerName").value = state.streamer.name || "";
    $("streamerTag").value = state.streamer.tagline || "";
    $("streamerInitials").value = state.streamer.initials || "";
    $("streamerAvatar").value = state.streamer.avatar || "";

    $("statWins").value = state.session.wins;
    $("statLosses").value = state.session.losses;
    $("statMvp").value = state.session.mvp;
    $("goalTarget").value = state.session.goalTarget;
    $("goalLabel").value = state.session.goalLabel || "";

    $("matchMode").value = state.match.mode || "";
    $("matchRank").value = state.match.rank || "";
    $("matchQueue").value = state.match.queue || "";

    $("heroEnabled").checked = !!state.hero.enabled;
    $("heroName").value = state.hero.name || "";
    $("heroRole").value = state.hero.role || "";
    $("heroNote").value = state.hero.note || "";
    $("heroImage").value = state.hero.image || "";

    $("tickerEnabled").checked = !!state.ticker.enabled;
    $("tickerText").value = state.ticker.text || "";
    $("tickerSpeed").value = state.ticker.speed;
    $("tickerSpeedOut").value = state.ticker.speed;

    renderSocialRows(state.socials);
    renderThemeButtons();
    applyPanelTheme(state.theme);

    $("startingTitle").value = state.screens.starting.title || "";
    $("startingSubtitle").value = state.screens.starting.subtitle || "";
    $("startingMinutes").value = state.screens.starting.minutes;
    $("brbTitle").value = state.screens.brb.title || "";
    $("brbSubtitle").value = state.screens.brb.subtitle || "";
    $("brbMinutes").value = state.screens.brb.minutes;
    $("endingTitle").value = state.screens.ending.title || "";
    $("endingSubtitle").value = state.screens.ending.subtitle || "";
  }

  /* ── URLs ────────────────────────────────────────────────────── */
  function overlayUrl() {
    return `${location.origin}/overlay.html`;
  }

  function screenUrl(key) {
    return `${location.origin}/screens.html?screen=${key}`;
  }

  function buildUrls() {
    $("overlayUrl").value = overlayUrl();

    const wrap = $("screenLinks");
    wrap.innerHTML = "";
    for (const screen of SCREENS) {
      const url = screenUrl(screen.key);

      const box = document.createElement("div");
      box.className = "screen-link";

      const head = document.createElement("div");
      head.className = "screen-link-head";

      const title = document.createElement("b");
      title.textContent = screen.label;

      const actions = document.createElement("div");
      actions.className = "screen-link-actions";

      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "btn ghost small";
      copy.textContent = "Copy";
      copy.addEventListener("click", () => copyText(url, copy));

      const open = document.createElement("a");
      open.className = "btn ghost small";
      open.href = url;
      open.target = "_blank";
      open.rel = "noopener";
      open.textContent = "Open";

      actions.append(copy, open);
      head.append(title, actions);

      const code = document.createElement("code");
      code.textContent = url;

      box.append(head, code);
      wrap.appendChild(box);
    }
  }

  async function copyText(text, button) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      helper.remove();
    }
    if (button) {
      const original = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => { button.textContent = original; }, 1200);
    }
  }

  /* ── preview scaling ─────────────────────────────────────────── */
  function setupPreview() {
    const wrap = $("previewWrap");
    const frame = $("preview");
    const resize = () => {
      const scale = wrap.clientWidth / 1920;
      frame.style.transform = `scale(${scale})`;
    };
    if (window.ResizeObserver) new ResizeObserver(resize).observe(wrap);
    window.addEventListener("resize", resize);
    resize();
  }

  /* ── actions ─────────────────────────────────────────────────── */
  function updateStats(mutator, type, text, kicker) {
    if (!state) return;
    mutator(state.session);
    syncStatInputs();
    save();
    pulse(type, typeof text === "function" ? text() : text, kicker);
  }

  function bindActions() {
    $("btnWin").addEventListener("click", () => {
      updateStats(
        (session) => { session.wins = clampInt(session.wins, 0, 9999) + 1; },
        "win",
        () => `Victory · ${clampInt(state.session.wins, 0, 9999)} wins today`
      );
    });

    $("btnLoss").addEventListener("click", () => {
      updateStats(
        (session) => { session.losses = clampInt(session.losses, 0, 9999) + 1; },
        "loss",
        "Defeat · run it back"
      );
    });

    $("btnMvp").addEventListener("click", () => {
      updateStats(
        (session) => { session.mvp = clampInt(session.mvp, 0, 9999) + 1; },
        "mvp",
        "MVP · unmatched"
      );
    });

    $("btnReset").addEventListener("click", () => {
      updateStats(
        (session) => { session.wins = 0; session.losses = 0; session.mvp = 0; },
        "info",
        "Session reset · clean slate"
      );
    });

    $("btnRestartTimers").addEventListener("click", async () => {
      await pulse("reset", "");
      $("footerState").textContent = "Countdowns restarted";
    });

    $("btnResetAll").addEventListener("click", async () => {
      if (!confirm("Reset everything back to the demo content?")) return;
      try {
        const res = await fetch("/default-state.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        state = await res.json();
        fillForm();
        await save();
        await pulse("info", "Overlay reset");
        $("footerState").textContent = "Everything reset to defaults";
      } catch {
        setStatus(false);
      }
    });

    $("addSocial").addEventListener("click", () => {
      if (!state) return;
      state.socials = readSocials();
      state.socials.push({ type: "youtube", label: "" });
      renderSocialRows(state.socials);
      scheduleSave();
    });
  }

  /* ── boot ────────────────────────────────────────────────────── */
  function bindForm() {
    bindText("streamerName", "streamer.name");
    bindText("streamerTag", "streamer.tagline");
    bindText("streamerInitials", "streamer.initials");
    bindText("streamerAvatar", "streamer.avatar");

    bindNumber("statWins", "session.wins", 0, 9999);
    bindNumber("statLosses", "session.losses", 0, 9999);
    bindNumber("statMvp", "session.mvp", 0, 9999);
    bindNumber("goalTarget", "session.goalTarget", 1, 9999);
    bindText("goalLabel", "session.goalLabel");

    bindText("matchMode", "match.mode");
    bindText("matchRank", "match.rank");
    bindText("matchQueue", "match.queue");

    bindCheck("heroEnabled", "hero.enabled");
    bindText("heroName", "hero.name");
    bindText("heroRole", "hero.role");
    bindText("heroNote", "hero.note");
    bindText("heroImage", "hero.image");

    bindCheck("tickerEnabled", "ticker.enabled");
    bindText("tickerText", "ticker.text");

    const speed = $("tickerSpeed");
    speed.addEventListener("input", () => {
      if (!state) return;
      state.ticker.speed = clampInt(speed.value, 10, 90);
      $("tickerSpeedOut").value = state.ticker.speed;
      scheduleSave();
    });

    bindThemeColor("themeAccent", "accent");
    bindThemeColor("themeAccent2", "accent2");

    bindText("startingTitle", "screens.starting.title");
    bindText("startingSubtitle", "screens.starting.subtitle");
    bindNumber("startingMinutes", "screens.starting.minutes", 0, 999);
    bindText("brbTitle", "screens.brb.title");
    bindText("brbSubtitle", "screens.brb.subtitle");
    bindNumber("brbMinutes", "screens.brb.minutes", 0, 999);
    bindText("endingTitle", "screens.ending.title");
    bindText("endingSubtitle", "screens.ending.subtitle");

    $("overlayUrl").addEventListener("click", (event) => event.target.select());

    bindActions();
  }

  async function boot() {
    try {
      const res = await fetch(API, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state = await res.json();
      fillForm();
      buildUrls();
      setStatus(true);
      setupPreview();
    } catch {
      setStatus(false);
      setTimeout(boot, 3000);
    }
  }

  bindForm();
  boot();

  /* Re-check the server every 15s so the status dot is honest. */
  setInterval(async () => {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      setStatus(res.ok);
    } catch {
      setStatus(false);
    }
  }, 15000);
})();
