# Scripts

## `indexnow_submit.py`

One-shot script to push all `sitemap.xml` URLs to **IndexNow**, the open
URL-submission protocol used by Bing, Yandex, Seznam, Naver, Yep.

### How it works

1. The site hosts a verification key file at
   `https://eurovisiontoolkit.com/911d10bd6cf8d573b729e0f0639b363d.txt`
   (committed to the repo root).
2. The script reads every `<loc>` from `sitemap.xml`, builds a JSON payload,
   and POSTs it to `https://api.indexnow.org/indexnow`.
3. IndexNow servers fetch the key file to confirm the request is genuine,
   then ping all participating search engines.

### Run

```bash
# Dry run — just print what would be submitted
python3 scripts/indexnow_submit.py --dry-run

# Real submission
python3 scripts/indexnow_submit.py
```

A success looks like `HTTP 200 OK` with empty body or `HTTP 202 Accepted`.

### When to re-run

- After every batch of new pages (or every meaningful sitemap change).
- After a sitemap `lastmod` bump.
- IndexNow has no rate limit beyond 10,000 URLs / request and reasonable
  daily volume — you can safely re-submit weekly.

### Rotating the key

If you ever leak the key, regenerate any 8–128-char hex string and:

1. Rename `<old>.txt` to `<new>.txt` at the repo root with the new value inside.
2. Update `KEY` and `KEY_LOCATION` in `indexnow_submit.py`.
3. Commit, deploy, re-run.
