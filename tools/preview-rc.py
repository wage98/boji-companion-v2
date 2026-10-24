#!/usr/bin/env python3
"""Serve the generated Boji V2 RC at its production base path, on localhost only."""
from __future__ import annotations

import argparse
import os
import stat
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
def resolve_rc_root(root: Path) -> Path:
    root = root.resolve()
    dist_path = root / "dist"
    rc_path = dist_path / "rc"
    def is_link_or_junction(path: Path) -> bool:
        try:
            metadata = path.lstat()
        except FileNotFoundError:
            return False
        reparse_flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
        return path.is_symlink() or (os.name == "nt" and bool(getattr(metadata, "st_file_attributes", 0) & reparse_flag))

    if is_link_or_junction(dist_path) or is_link_or_junction(rc_path):
        raise SystemExit("Preview build paths cannot be symbolic links or junctions.")
    dist_root = dist_path.resolve()
    rc_root = rc_path.resolve()
    if not dist_root.is_relative_to(root) or not rc_root.is_relative_to(dist_root):
        raise SystemExit("Preview build path escapes the repository build directory.")
    return rc_root


RC_ROOT = resolve_rc_root(ROOT)
BASE_PATH = "/boji-companion-v2/rc/"


class PreviewHandler(SimpleHTTPRequestHandler):
    def translate_path(self, request_path: str) -> str:
        request_path = unquote(urlsplit(request_path).path)
        if request_path == BASE_PATH.rstrip("/"):
            request_path = BASE_PATH
        if not request_path.startswith(BASE_PATH):
            return str(RC_ROOT / "__not_found__")
        relative = request_path[len(BASE_PATH) :]
        target = (RC_ROOT / relative).resolve()
        if not target.is_relative_to(RC_ROOT):
            return str(RC_ROOT / "__not_found__")
        if target.is_dir():
            target = target / "index.html"
        return str(target)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8785)
    args = parser.parse_args()
    if not (RC_ROOT / "index.html").is_file():
        raise SystemExit("RC preview is not built. Run: node tools/build-rc.js")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), PreviewHandler)
    print(f"Boji V2 RC preview: http://127.0.0.1:{args.port}{BASE_PATH}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
