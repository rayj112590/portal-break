"""Local dev server for Portal Break.

Same as `python -m http.server`, but tells the browser never to cache files,
so a normal reload always picks up the latest game code and models.

    python serve.py          -> http://127.0.0.1:8137
"""
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8137


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".glb": "model/gltf-binary"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()

    # Dev-only: the game's thumbnail tool POSTs a JPEG here and it is written to
    # assets/thumbs/<name>.jpg. Names are restricted to letters/digits/-/_ so nothing
    # outside that folder can be written. The shipped game never calls this.
    def do_POST(self):
        import os, re
        from urllib.parse import urlparse, parse_qs
        url = urlparse(self.path)
        name = (parse_qs(url.query).get("name") or [""])[0]
        if url.path != "/__dev/thumb" or not re.fullmatch(r"[A-Za-z0-9_-]{1,40}", name):
            self.send_error(404); return
        length = int(self.headers.get("Content-Length", 0))
        if not 0 < length <= 5_000_000:
            self.send_error(413); return
        data = self.rfile.read(length)
        if not data.startswith(b"\xff\xd8"):          # must be a JPEG
            self.send_error(415); return
        folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "thumbs")
        os.makedirs(folder, exist_ok=True)
        with open(os.path.join(folder, name + ".jpg"), "wb") as f:
            f.write(data)
        self.send_response(204); self.end_headers()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    with Server(("127.0.0.1", PORT), NoCacheHandler) as httpd:
        print(f"Portal Break running at http://127.0.0.1:{PORT}  (Ctrl+C to stop)")
        httpd.serve_forever()
