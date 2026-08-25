#!/usr/bin/env python3
"""Local static server with a narrow, read-only Bilibili follow-list proxy."""

from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


BILIBILI_API = "https://api.bilibili.com/x/space/bangumi/follow/list"
MAX_PAGE_SIZE = 30


class UsagiyamaHandler(SimpleHTTPRequestHandler):
    server_version = "UsagiyamaLocal/1.0"

    def __init__(self, *args, directory: str | None = None, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        super().end_headers()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path.rstrip("/") == "/api/bilibili/follows":
            self._serve_bilibili_follows(parsed.query)
            return
        super().do_GET()

    def _serve_bilibili_follows(self, query: str) -> None:
        params = urllib.parse.parse_qs(query)
        uid = self._digits(params.get("uid", [""])[0], 1, 10**20 - 1)
        page = self._digits(params.get("page", ["1"])[0], 1, 10000)
        page_size = self._digits(params.get("page_size", ["24"])[0], 1, MAX_PAGE_SIZE)
        follow_status = self._digits(params.get("follow_status", ["0"])[0], 0, 3)

        if None in (uid, page, page_size, follow_status):
            self._send_json(
                HTTPStatus.BAD_REQUEST,
                {"code": -400, "message": "UID 或分页参数无效。"},
            )
            return

        upstream_query = urllib.parse.urlencode(
            {
                "vmid": uid,
                "type": 1,
                "pn": page,
                "ps": page_size,
                "follow_status": follow_status,
            }
        )
        request = urllib.request.Request(
            f"{BILIBILI_API}?{upstream_query}",
            headers={
                "Accept": "application/json, text/plain, */*",
                "Referer": f"https://space.bilibili.com/{uid}/bangumi",
                "Origin": "https://space.bilibili.com",
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/126.0 Safari/537.36"
                ),
            },
            method="GET",
        )

        try:
            with urllib.request.urlopen(request, timeout=12) as response:
                payload = response.read()
            parsed_payload = json.loads(payload.decode("utf-8"))
            self._send_json(HTTPStatus.OK, parsed_payload)
        except urllib.error.HTTPError as error:
            self._send_json(
                HTTPStatus.BAD_GATEWAY,
                {"code": -502, "message": f"Bilibili 返回 HTTP {error.code}。"},
            )
        except (urllib.error.URLError, TimeoutError):
            self._send_json(
                HTTPStatus.GATEWAY_TIMEOUT,
                {"code": -504, "message": "连接 Bilibili 超时，请稍后重试。"},
            )
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send_json(
                HTTPStatus.BAD_GATEWAY,
                {"code": -502, "message": "Bilibili 返回了无法识别的数据。"},
            )

    @staticmethod
    def _digits(value: str, minimum: int, maximum: int) -> int | None:
        if not value.isdigit():
            return None
        number = int(value)
        return number if minimum <= number <= maximum else None

    def _send_json(self, status: HTTPStatus, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--directory", default=os.getcwd())
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    root = Path(args.directory).resolve()

    def handler(*handler_args, **handler_kwargs):
        return UsagiyamaHandler(
            *handler_args,
            directory=str(root),
            **handler_kwargs,
        )

    server = ThreadingHTTPServer((args.bind, args.port), handler)
    print(f"Serving {root} at http://{args.bind}:{args.port}/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
