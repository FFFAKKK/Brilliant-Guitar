"""Serve the existing backup UI with one fresh URL namespace for its assets."""

import argparse
import hashlib
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit


PREFIX = "/__preview/"
DEFAULT_ROOT = Path(__file__).resolve().parent.parent


def content_revision(root):
    paths = list(root.glob("*.html"))
    for name in ("src", "styles", "vendor", "fixtures"):
        paths.extend(path for path in (root / name).rglob("*") if path.is_file())
    digest = hashlib.sha256()
    for path in sorted(paths, key=lambda item: item.relative_to(root).as_posix()):
        digest.update(path.relative_to(root).as_posix().encode("utf-8") + b"\0")
        digest.update(hashlib.sha256(path.read_bytes()).digest())
    return digest.hexdigest()[:20]


class PreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(args[2].preview_root), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Backup-UI-Revision", self.server.revision)
        super().end_headers()

    def prepare_path(self):
        url = urlsplit(self.path)
        path = url.path
        requested_revision = None
        if path.startswith(PREFIX):
            parts = path[len(PREFIX):].split("/", 1)
            if len(parts) != 2:
                self.send_error(404)
                return False
            requested_revision, relative = parts
            path = "/" + relative
        is_page = path == "/" or path.endswith(".html")
        if is_page:
            # A changed dependency also changes the next page's entire graph.
            self.server.revision = content_revision(self.server.preview_root)
        if is_page and requested_revision != self.server.revision:
            location = urlunsplit(("", "", PREFIX + self.server.revision + path,
                                  url.query, ""))
            self.send_response(302)
            self.send_header("Location", location)
            self.end_headers()
            return False
        if requested_revision is not None and requested_revision != self.server.revision:
            self.send_error(410, "Preview revision changed; reload its page")
            return False
        self.path = urlunsplit(("", "", path, url.query, ""))
        return True

    def send_head(self):
        # Existing conditional requests must receive current bytes, not 304.
        for name in ("If-Modified-Since", "If-None-Match"):
            if name in self.headers:
                del self.headers[name]
        return super().send_head()

    def do_GET(self):
        if self.prepare_path():
            super().do_GET()

    def do_HEAD(self):
        if self.prepare_path():
            super().do_HEAD()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=5193)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    args = parser.parse_args()
    root = args.root.resolve(strict=True)
    with ThreadingHTTPServer(("127.0.0.1", args.port), PreviewHandler) as server:
        server.preview_root = root
        server.revision = content_revision(root)
        origin = "http://127.0.0.1:" + str(server.server_port)
        print(json.dumps({"origin": origin, "root": str(root), "revision": server.revision,
                          "runtime": origin + PREFIX + server.revision + "/runtime-preview.html"}), flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
