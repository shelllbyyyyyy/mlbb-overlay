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

  /* ── Stream formats ───────────────────────────────────────────── */
  const FORMATS = {
    landscape: {
      label: "Landscape",
      size: "1920 × 1080",
      note: "Everything on stream switches to the wide design — including browser sources you already added in OBS. No URL changes needed.",
      steps: [
        "Add a <b>Browser</b> source at <b>1920 × 1080</b> and paste the overlay URL.",
        "Keep your game capture and webcam <b>below</b> the overlay source.",
        "Place the webcam at <b>X 44 · Y 752</b>, size <b>448 × 252</b>.",
        "Use the screen links below in your Starting / BRB / Ending scenes.",
        "Want to switch to Shorts mid-stream? Change <b>Stream format</b> here — the overlay updates live."
      ]
    },
    portrait: {
      label: "Shorts",
      size: "1080 × 1920",
      note: "Everything on stream switches to the vertical design. Size the browser source to 1080 × 1920 so it renders full size.",
      steps: [
        "Add a <b>Browser</b> source at <b>1080 × 1920</b> and paste the overlay URL.",
        "Keep your game capture and webcam <b>below</b> the overlay source.",
        "Place the webcam at <b>X 36 · Y 1523</b>, size <b>520 × 293</b>.",
        "Use the screen links below in your Shorts scenes.",
        "Switching back to Landscape here flips every source back — no URL changes needed."
      ]
    },
    both: {
      label: "Both",
      size: "1920 × 1080 + 1080 × 1920",
      note: "Each source picks the design that fits it: the 1920 × 1080 one stays wide, the 1080 × 1920 one goes vertical. One panel drives both.",
      steps: [
        "Add <b>two Browser</b> sources: <b>1920 × 1080</b> for YouTube and <b>1080 × 1920</b> for Shorts.",
        "Paste the same overlay URL in both — each source picks the layout that fits it.",
        "Landscape webcam at <b>X 44 · Y 752</b> (<b>448 × 252</b>); Shorts webcam at <b>X 36 · Y 1523</b> (<b>520 × 293</b>).",
        "Add the screen links to both sets of scenes.",
        "Picking Landscape or Shorts here forces that design on every source."
      ]
    }
  };

  const FORMAT_KEYS = Object.keys(FORMATS);

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
    state.layout = state.layout || { mode: "landscape" };

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

    applyFormat();
  }

  /* ── URLs ────────────────────────────────────────────────────── */
  function overlayUrl(mode) {
    const suffix = mode === "portrait" ? "?mode=portrait" : "";
    return `${location.origin}/overlay.html${suffix}`;
  }

  function screenUrl(key) {
    return `${location.origin}/screens.html?screen=${key}`;
  }

  function buildUrls() {
    const mode = currentFormat();

    $("overlayUrl").value = overlayUrl("landscape");
    $("overlayUrlPortrait").value = overlayUrl("portrait");
    $("overlayUrlNote").textContent = mode === "portrait" ? "1080 × 1920" : "1920 × 1080";

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
  const PREVIEWS = [
    { wrap: "previewWrap", frame: "preview", w: 1920, h: 1080 },
    { wrap: "previewWrapPortrait", frame: "previewPortrait", w: 1080, h: 1920 }
  ];

  function fitFrame(wrap, frame, dw, dh) {
    if (!wrap || !frame) return;
    const boxW = wrap.clientWidth;
    const boxH = wrap.clientHeight;
    if (!boxW || !boxH) return;
    const scale = Math.min(boxW / dw, boxH / dh);
    frame.style.width = `${dw}px`;
    frame.style.height = `${dh}px`;
    frame.style.transform = `scale(${scale})`;
    frame.style.left = `${Math.max(0, (boxW - dw * scale) / 2)}px`;
    frame.style.top = `${Math.max(0, (boxH - dh * scale) / 2)}px`;
  }

  function fitPreviews() {
    for (const preview of PREVIEWS) {
      fitFrame($(preview.wrap), $(preview.frame), preview.w, preview.h);
    }
  }

  function setupPreview() {
    for (const preview of PREVIEWS) {
      const wrap = $(preview.wrap);
      if (!wrap) continue;
      if (window.ResizeObserver) new ResizeObserver(() => fitFrame(wrap, $(preview.frame), preview.w, preview.h)).observe(wrap);
    }
    window.addEventListener("resize", fitPreviews);
    fitPreviews();
  }

  /* ── format switch ───────────────────────────────────────────── */
  function currentFormat() {
    const mode = state && state.layout ? state.layout.mode : "landscape";
    return FORMAT_KEYS.includes(mode) ? mode : "landscape";
  }

  function applyFormat() {
    const mode = currentFormat();
    const format = FORMATS[mode];

    $("previewGrid").dataset.mode = mode;
    $("formatNote").textContent = format.note;
    $("previewHint").textContent = format.size;
    $("obsHint").textContent = format.size;

    const steps = $("obsSteps");
    steps.innerHTML = "";
    for (const html of format.steps) {
      const li = document.createElement("li");
      li.innerHTML = html;
      steps.appendChild(li);
    }

    const open = $("openOverlay");
    open.href = "/overlay.html?preview=1";

    document.querySelectorAll(".format-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });

    buildUrls();
    fitPreviews();
  }

  function bindFormats() {
    document.querySelectorAll(".format-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!state) return;
        const mode = btn.dataset.mode;
        if (!FORMAT_KEYS.includes(mode)) return;
        state.layout = state.layout || {};
        state.layout.mode = mode;
        applyFormat();
        save();
        $("footerState").textContent = `Format · ${FORMATS[mode].label}`;
      });
    });
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

    // Keyboard shortcuts: W = win, L = loss, M = MVP.
    // Ignored while typing in a field so they never eat normal input.
    document.addEventListener("keydown", (event) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const el = event.target;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const id = { w: "btnWin", l: "btnLoss", m: "btnMvp" }[event.key.toLowerCase()];
      if (!id) return;
      event.preventDefault();
      $(id).click();
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

    document.querySelectorAll("[data-copy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const input = $(btn.dataset.copy);
        if (!input) return;
        input.select();
        copyText(input.value, btn);
      });
    });

    document.querySelectorAll(".copy-row input").forEach((input) => {
      input.addEventListener("click", () => input.select());
      input.addEventListener("focus", () => input.select());
    });

    bindFormats();
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
