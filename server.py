#!/usr/bin/env python3
"""
MLBB overlay control server.

Zero dependencies. Serves the overlay files, keeps the live overlay state in
state.json, and pushes updates to OBS (and any browser) over Server-Sent Events.

    python3 server.py                 # http://localhost:8765
    python3 server.py --port 9000
    python3 server.py --host 0.0.0.0  # allow control from a phone on your LAN
"""

from __future__ import annotations

import argparse
import json
import os
import queue
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(ROOT, "state.json")
DEFAULTS_FILE = os.path.join(ROOT, "default-state.json")

_lock = threading.Lock()
_subscribers: set[queue.Queue[str]] = set()


# ── state helpers ──────────────────────────────────────────────────────────
def read_json(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return data


def load_state() -> dict:
    try:
        state = read_json(STATE_FILE)
    except FileNotFoundError:
        state = read_json(DEFAULTS_FILE)
    except (OSError, ValueError) as err:
        print(f"! Could not read state.json ({err}); using defaults.")
        state = read_json(DEFAULTS_FILE)
    state.setdefault("pulse", {"id": 0, "type": "info", "text": ""})
    return state


STATE: dict = load_state()


def snapshot_locked() -> dict:
    return json.loads(json.dumps(STATE))


def public_state() -> dict:
    with _lock:
        return snapshot_locked()


def persist(state: dict) -> None:
    """Write state atomically, without the transient pulse field."""
    data = {key: value for key, value in state.items() if key != "pulse"}
    temp = f"{STATE_FILE}.tmp"
    with open(temp, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    os.replace(temp, STATE_FILE)


def deep_merge(base: dict, patch: dict) -> dict:
    result = dict(base)
    for key, value in patch.items():
        if (
            isinstance(value, dict)
            and isinstance(result.get(key), dict)
        ):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def broadcast(state: dict) -> None:
    payload = json.dumps(state, ensure_ascii=False)
    for subscriber in list(_subscribers):
        try:
            subscriber.put_nowait(payload)
        except queue.Full:
            try:
                subscriber.get_nowait()
                subscriber.put_nowait(payload)
            except queue.Empty:
                pass


# ── HTTP handler ───────────────────────────────────────────────────────────
class OverlayHandler(SimpleHTTPRequestHandler):
    server_version = "MLBBOverlay/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # Keep the terminal readable: no log line for every SSE ping.
    def log_message(self, fmt: str, *args) -> None:
        if "/events" in (self.path or ""):
            return
        super().log_message(fmt, *args)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    # ── helpers ────────────────────────────────────────────────────────────
    def send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def stream_events(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-store")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        channel: queue.Queue[str] = queue.Queue(maxsize=16)
        with _lock:
            _subscribers.add(channel)
            initial = snapshot_locked()

        try:
            self.wfile.write(f"data: {json.dumps(initial, ensure_ascii=False)}\n\n".encode("utf-8"))
            self.wfile.flush()
            while True:
                try:
                    payload = channel.get(timeout=20)
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
                    continue
                self.wfile.write(f"data: {payload}\n\n".encode("utf-8"))
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            with _lock:
                _subscribers.discard(channel)

    # ── routes ─────────────────────────────────────────────────────────────
    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path

        if path == "/":
            self.send_response(302)
            self.send_header("Location", "/control.html")
            self.end_headers()
            return

        if path == "/api/state":
            self.send_json(public_state())
            return

        if path == "/api/health":
            self.send_json({"ok": True, "clients": len(_subscribers)})
            return

        if path == "/events":
            self.stream_events()
            return

        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path

        try:
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b"{}"
            payload = json.loads(raw or b"{}")
        except (ValueError, OSError):
            self.send_json({"ok": False, "error": "invalid JSON body"}, 400)
            return

        if not isinstance(payload, dict):
            self.send_json({"ok": False, "error": "body must be a JSON object"}, 400)
            return

        if path == "/api/state":
            with _lock:
                merged = deep_merge(STATE, payload)
                pulse = STATE.get("pulse")
                merged["pulse"] = pulse
                STATE.clear()
                STATE.update(merged)
                state = snapshot_locked()

            persist(state)
            broadcast(state)
            self.send_json({"ok": True})
            return

        if path == "/api/pulse":
            pulse = {
                "id": int(time.time() * 1000),
                "type": str(payload.get("type") or "info"),
                "text": str(payload.get("text") or ""),
                "kicker": str(payload.get("kicker") or ""),
            }
            with _lock:
                STATE["pulse"] = pulse
                state = snapshot_locked()

            broadcast(state)
            self.send_json({"ok": True, "pulse": pulse})
            return

        self.send_json({"ok": False, "error": "not found"}, 404)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()


# ── entry point ────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="MLBB overlay control server")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8765")))
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    args = parser.parse_args()

    try:
        httpd = ThreadingHTTPServer((args.host, args.port), OverlayHandler)
    except OSError as err:
        print(f"\n! Could not start on {args.host}:{args.port} — {err}")
        print("  Another copy may already be running. Try: open "
              f"http://localhost:{args.port}/control.html\n")
        sys.exit(1)

    httpd.daemon_threads = True

    if not os.path.exists(STATE_FILE):
        persist(public_state())

    base = f"http://localhost:{args.port}"
    print("\n  ╔══════════════════════════════════════════════════╗")
    print("  ║           MLBB OBS OVERLAY  ·  RUNNING            ║")
    print("  ╚══════════════════════════════════════════════════╝")
    print(f"  Control panel : {base}/control.html")
    print(f"  OBS overlay   : {base}/overlay.html")
    print(f"  Screens       : {base}/screens.html?screen=starting")
    print(f"                  {base}/screens.html?screen=brb")
    print(f"                  {base}/screens.html?screen=ending")
    if args.host == "0.0.0.0":
        print("\n  LAN mode: open the control panel from your phone using your")
        print("  Mac's IP address instead of localhost (same Wi-Fi).")
    print("\n  Keep this window open. Press Ctrl+C to stop.\n")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Overlay server stopped. See you next stream!\n")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
