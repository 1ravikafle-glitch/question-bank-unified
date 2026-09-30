"""Local verification server: serves frontend-desktop/dist and proxies API
calls to the backend on 8001, mirroring how start_prod.py runs in production."""
import http.server
import os
import urllib.request
import urllib.error

DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend-desktop", "dist")
API = "http://127.0.0.1:8001"
PORT = 8003

# Extensions that are real static assets; everything else goes to the API.
STATIC_EXT = (".js", ".css", ".png", ".svg", ".jpg", ".jpeg", ".webp", ".ico", ".json", ".woff", ".woff2", ".ttf")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=DIST, **kw)

    def log_message(self, *a):
        pass

    def _is_static(self):
        return self.path.split("?")[0].endswith(STATIC_EXT)

    def _serve_index(self):
        """SPA fallback: serve dist/index.html for frontend routes."""
        try:
            with open(os.path.join(DIST, "index.html"), "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return True
        except OSError:
            return False

    def _proxy(self, method):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        req = urllib.request.Request(API + self.path, data=body, method=method)
        for k in ("Content-Type", "Authorization"):
            if self.headers.get(k):
                req.add_header(k, self.headers[k])
        try:
            with urllib.request.urlopen(req) as r:
                data = r.read()
                self.send_response(r.status)
                ct = r.headers.get("Content-Type", "application/json")
                self.send_header("Content-Type", ct)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            # SPA fallback: unknown GET routes are frontend routes, not API 404s
            if method == "GET" and e.code == 404 and self._serve_index():
                return
            data = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", e.headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    def do_GET(self):
        if self._is_static():
            if os.path.exists(os.path.join(DIST, self.path.split("?")[0].lstrip("/"))):
                super().do_GET()
            else:
                self._serve_index()
        else:
            self._proxy("GET")

    def do_POST(self):
        self._proxy("POST")

    def do_DELETE(self):
        self._proxy("DELETE")

    def do_PUT(self):
        self._proxy("PUT")


if __name__ == "__main__":
    print(f"serving {DIST} on http://127.0.0.1:{PORT} (api -> {API})", flush=True)
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
