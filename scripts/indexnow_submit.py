#!/usr/bin/env python3
"""Submit all sitemap URLs to IndexNow (Bing + Yandex + Seznam).

IndexNow is a free, instant URL submission protocol. One POST notifies
Bing, Yandex, Seznam, Naver, Yep at once. Up to 10,000 URLs per request.

Usage
-----
    python3 scripts/indexnow_submit.py            # submit every URL in sitemap.xml
    python3 scripts/indexnow_submit.py --dry-run  # print payload, don't POST

The site key file `911d10bd6cf8d573b729e0f0639b363d.txt` lives at the repo
root, so it is served at:
    https://eurovisiontoolkit.com/911d10bd6cf8d573b729e0f0639b363d.txt

IndexNow servers fetch that URL to verify ownership before accepting the
submission. If you ever rotate the key, regenerate the txt file with the
new value at the same path.

Docs
----
- https://www.indexnow.org/documentation
- https://www.bing.com/indexnow
- https://yandex.com/support/webmaster/indexnow/
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parent.parent
SITEMAP = ROOT / "sitemap.xml"

HOST = "eurovisiontoolkit.com"
KEY = "911d10bd6cf8d573b729e0f0639b363d"
KEY_LOCATION = f"https://{HOST}/{KEY}.txt"
ENDPOINT = "https://api.indexnow.org/indexnow"
LOC_RE = re.compile(r"<loc>([^<]+)</loc>")


def collect_urls() -> list[str]:
    if not SITEMAP.exists():
        sys.exit(f"sitemap.xml not found at {SITEMAP}")
    text = SITEMAP.read_text(encoding="utf-8")
    urls = LOC_RE.findall(text)
    # IndexNow accepts up to 10,000 URLs per request
    if len(urls) > 10_000:
        sys.exit(f"Too many URLs ({len(urls)}) for one request; chunking required.")
    return urls


def submit(urls: list[str], dry_run: bool = False) -> None:
    payload = {
        "host": HOST,
        "key": KEY,
        "keyLocation": KEY_LOCATION,
        "urlList": urls,
    }
    if not urls:
        print("No URLs found in sitemap; nothing to submit.")
        return
    body = json.dumps(payload).encode("utf-8")
    print(f"Submitting {len(urls)} URLs to {ENDPOINT}")
    print(f"Sample: {urls[0]} … {urls[-1]}")
    if dry_run:
        print("--dry-run set, not POSTing")
        return
    req = Request(
        ENDPOINT,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Host": "api.indexnow.org",
        },
    )
    try:
        with urlopen(req, timeout=30) as resp:
            print(f"HTTP {resp.status} {resp.reason}")
            print(resp.read().decode("utf-8", errors="replace"))
    except HTTPError as e:
        print(f"HTTP {e.code} {e.reason}")
        print(e.read().decode("utf-8", errors="replace"))
        sys.exit(1)
    except URLError as e:
        sys.exit(f"Network error: {e.reason}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true", help="Print but do not POST")
    args = p.parse_args()
    urls = collect_urls()
    submit(urls, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
