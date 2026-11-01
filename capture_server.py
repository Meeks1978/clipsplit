#!/usr/bin/env python3
"""One-shot local capture for the ClipSplit sandbox credentials.

Serves a form on 127.0.0.1 only. On the first valid POST it updates the two
PAYPAL_SANDBOX_* lines in the target .env (preserving everything else),
replies generically, and exits. Values are never printed or logged.
Usage: capture_server.py <port> <env_path>
"""
import sys, threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs

PORT = int(sys.argv[1]); ENV_PATH = sys.argv[2]

FORM = """<!doctype html><title>ClipSplit credential capture</title>
<h2>ClipSplit sandbox credential capture (local only)</h2>
<form method="POST" action="/save">
<label>Sandbox Client ID<br><input name="client_id" size="90" autocomplete="off"></label><br><br>
<label>Sandbox Secret<br><input name="client_secret" size="90" autocomplete="off"></label><br><br>
<button type="submit">Save to local config</button></form>"""

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        self.send_response(200); self.send_header("Content-Type", "text/html"); self.end_headers()
        self.wfile.write(FORM.encode())
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        fields = parse_qs(self.rfile.read(n).decode())
        cid = (fields.get("client_id") or [""])[0].strip()
        sec = (fields.get("client_secret") or [""])[0].strip()
        if not cid or not sec:
            self.send_response(400); self.end_headers(); self.wfile.write(b"missing fields"); return
        lines, seen = [], set()
        try:
            with open(ENV_PATH) as f: existing = f.read().splitlines()
        except FileNotFoundError:
            existing = []
        for line in existing:
            if line.startswith("PAYPAL_SANDBOX_CLIENT_ID="):
                lines.append(f"PAYPAL_SANDBOX_CLIENT_ID={cid}"); seen.add("id")
            elif line.startswith("PAYPAL_SANDBOX_CLIENT_SECRET="):
                lines.append(f"PAYPAL_SANDBOX_CLIENT_SECRET={sec}"); seen.add("sec")
            else:
                lines.append(line)
        if "id" not in seen: lines.append(f"PAYPAL_SANDBOX_CLIENT_ID={cid}")
        if "sec" not in seen: lines.append(f"PAYPAL_SANDBOX_CLIENT_SECRET={sec}")
        with open(ENV_PATH, "w") as f: f.write("\n".join(lines) + "\n")
        self.send_response(200); self.end_headers()
        self.wfile.write(b"Saved. You can close this tab.")
        threading.Thread(target=self.server.shutdown, daemon=True).start()

HTTPServer(("127.0.0.1", PORT), H).serve_forever()
