#!/usr/bin/env python3
"""Pre-render the country grid + ItemList JSON-LD into countries.html (EN/DE/ES).

Why: Googlebot's render budget is conservative and the previous JS-only
render path (`fetch()` → `innerHTML = ...`) made `/countries.html` look
nearly empty on first paint, which Search Console reported as a soft 404.
Embedding the cards into the HTML at build time makes the page
content-rich on first byte and keeps filtering interactive.

Re-run after any change to assets/data/esc2026-participants.json:

    python3 scripts/build_countries_index.py

Idempotent: replaces grid + JSON-LD + inline JS blocks atomically.
"""
from __future__ import annotations

import html
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "assets/data/esc2026-participants.json"

# ---------------------------------------------------------------- locale strings

LOCALES: dict[str, dict[str, Any]] = {
    "en": {
        "file": ROOT / "countries.html",
        "data_path_from_html": "./assets/data/esc2026-participants.json",
        "country_url": lambda slug: f"./countries/{slug}.html",
        "absolute_country_url": lambda slug: f"https://eurovisiontoolkit.com/countries/{slug}.html",
        "card_label": lambda c: f"{c['country']} at Eurovision 2026",
        "stage_label": lambda stage, host: (
            "Semi-final 1" if stage == "SF1"
            else "Semi-final 2" if stage == "SF2"
            else "Host · direct to Final" if host
            else "Big Five · direct to Final"
        ),
        "ro_prefix": " · R/O ",
        "itemlist_name": "Eurovision Song Contest 2026 participants",
        "language_code": "en",
        "fallback_msg": "Country data could not be loaded.",
    },
    "de": {
        "file": ROOT / "de/countries.html",
        "data_path_from_html": "../assets/data/esc2026-participants.json",
        "country_url": lambda slug: f"./countries/{slug}.html",
        "absolute_country_url": lambda slug: f"https://eurovisiontoolkit.com/de/countries/{slug}.html",
        "card_label": lambda c: f"{c['country']} beim Eurovision 2026",
        "stage_label": lambda stage, host: (
            "Halbfinale 1" if stage == "SF1"
            else "Halbfinale 2" if stage == "SF2"
            else "Gastgeber · Direkt zum Finale" if host
            else "Big Five · Direkt zum Finale"
        ),
        "ro_prefix": " · Startplatz ",
        "itemlist_name": "Die 35 Länder beim Eurovision 2026",
        "language_code": "de",
        "fallback_msg": "Länderdaten konnten nicht geladen werden.",
    },
    "es": {
        "file": ROOT / "es/countries.html",
        "data_path_from_html": "../assets/data/esc2026-participants.json",
        "country_url": lambda slug: f"./countries/{slug}.html",
        "absolute_country_url": lambda slug: f"https://eurovisiontoolkit.com/es/countries/{slug}.html",
        "card_label": lambda c: f"{c['country']} en Eurovisión 2026",
        "stage_label": lambda stage, host: (
            "Semifinal 1" if stage == "SF1"
            else "Semifinal 2" if stage == "SF2"
            else "Anfitrión · Pase directo al Final" if host
            else "Big Five · Pase directo al Final"
        ),
        "ro_prefix": " · Orden ",
        "itemlist_name": "Los 35 países de Eurovisión 2026",
        "language_code": "es",
        "fallback_msg": "No se pudieron cargar los datos.",
    },
}


# ---------------------------------------------------------------- card rendering

def render_card(c: dict[str, Any], loc: dict[str, Any]) -> str:
    stage_class = c["stage"].lower()
    stage_label = loc["stage_label"](c["stage"], c.get("host", False))
    ro_str = f"{loc['ro_prefix']}{c['ro']}" if c.get("ro") else ""
    return (
        f'        <a class="country-card country-card--{stage_class}"\n'
        f'           role="listitem"\n'
        f'           data-stage="{c["stage"]}"\n'
        f'           href="{loc["country_url"](c["slug"])}"\n'
        f'           aria-label="{html.escape(loc["card_label"](c), quote=True)}">\n'
        f'          <span class="country-card__flag" aria-hidden="true">{c["flag"]}</span>\n'
        f'          <h2 class="country-card__name">{html.escape(c["country"])}</h2>\n'
        f'          <span class="country-card__song">"{html.escape(c["song"])}"</span>\n'
        f'          <span class="country-card__artist">{html.escape(c["artist"])}</span>\n'
        f'          <span class="country-card__meta">{html.escape(stage_label)}{html.escape(ro_str)}</span>\n'
        f'        </a>'
    )


def render_grid(countries: list[dict[str, Any]], loc: dict[str, Any]) -> str:
    """Return the grid <div>…</div>. Leading indentation is intentionally
    omitted so substituting in place is idempotent (the existing leading
    whitespace in the source file is preserved by the regex)."""
    cards = "\n".join(render_card(c, loc) for c in countries)
    return (
        '<div id="countries-grid" class="countries-grid" role="list" aria-live="polite">\n'
        f'{cards}\n'
        '      </div>'
    )


def render_jsonld(countries: list[dict[str, Any]], loc: dict[str, Any]) -> str:
    payload = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": loc["itemlist_name"],
        "numberOfItems": len(countries),
        "inLanguage": loc["language_code"],
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": i + 1,
                "name": f'{c["country"]} — {c["artist"]} · "{c["song"]}"',
                "url": loc["absolute_country_url"](c["slug"]),
            }
            for i, c in enumerate(countries)
        ],
    }
    body = json.dumps(payload, indent=2, ensure_ascii=False)
    # No leading whitespace — preserved by the source file's existing indent.
    return (
        '<script id="countries-jsonld" type="application/ld+json">\n'
        f"{body}\n"
        '  </script>'
    )


# ---------------------------------------------------------------- new inline JS

NEW_INLINE_JS = """<script>
/* Countries index — cards are pre-rendered server-side; this script
   only handles the stage filter tabs. The JSON-LD ItemList is also
   pre-rendered into <head>, so Googlebot sees full content on the
   first byte (no soft-404 risk). */
(function () {
  const tabs = document.querySelectorAll('.stage-tab');
  if (!tabs.length) return;
  let activeFilter = 'all';

  function applyFilter() {
    document.querySelectorAll('.country-card').forEach(card => {
      const show = activeFilter === 'all' || card.dataset.stage === activeFilter;
      card.dataset.hidden = (!show).toString();
    });
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.setAttribute('aria-pressed', 'false'));
      tab.setAttribute('aria-pressed', 'true');
      activeFilter = tab.dataset.filter;
      applyFilter();
    });
  });
})();
</script>"""


# ---------------------------------------------------------------- regexes

# Match the grid <div>. EN has id-first, DE/ES have class-first; allow either.
# We anchor on the presence of id="countries-grid" anywhere in the opening tag.
GRID_RE = re.compile(
    r'<div\b[^>]*\bid="countries-grid"[^>]*>.*?</div>',
    re.DOTALL,
)

# Match any <script id="countries-jsonld" ...>...</script>
JSONLD_RE = re.compile(
    r'<script\s+(?:id="countries-jsonld"\s+type="application/ld\+json"|type="application/ld\+json"\s+id="countries-jsonld")\s*>.*?</script>',
    re.DOTALL,
)

# Match the inline IIFE that handles the stage filter. Must match BOTH the
# original fetch+render IIFE (first run) AND the post-build filter-only IIFE
# (subsequent runs) so the script stays idempotent. We anchor on
# `.stage-tab` because both versions reference that selector and it is
# unique to this page; the external <script src="..."> tag doesn't match
# because it has no body.
INLINE_JS_RE = re.compile(
    r'<script>\s*'
    r'(?:/\*.*?\*/\s*)?'                      # optional opening block comment
    r'\(function\s*\(\)\s*\{'
    r'(?:(?!</script>).)*?'                   # body, stopping before </script>
    r"\.stage-tab"                            # anchor present in old + new IIFE
    r'(?:(?!</script>).)*?'
    r'\}\)\(\);\s*'
    r'</script>',
    re.DOTALL,
)


# ---------------------------------------------------------------- patcher

def patch(loc_key: str, countries: list[dict[str, Any]]) -> None:
    loc = LOCALES[loc_key]
    path: Path = loc["file"]
    text = path.read_text(encoding="utf-8")
    original = text

    sorted_list = sorted(countries, key=lambda c: c["country"])

    # 1. Replace the (empty or stale) grid <div> with a pre-rendered one.
    new_grid = render_grid(sorted_list, loc)
    if not GRID_RE.search(text):
        raise RuntimeError(f"{path}: countries-grid div not found")
    text = GRID_RE.sub(new_grid, text, count=1)

    # 2. Replace any existing <script id="countries-jsonld"> with
    #    the pre-rendered ItemList JSON-LD.
    new_jsonld = render_jsonld(sorted_list, loc)
    if not JSONLD_RE.search(text):
        raise RuntimeError(f"{path}: countries-jsonld <script> not found")
    text = JSONLD_RE.sub(new_jsonld, text, count=1)

    # 3. Replace the fetch+render inline IIFE with the filter-only version.
    if not INLINE_JS_RE.search(text):
        raise RuntimeError(f"{path}: inline IIFE with fetch() not found")
    text = INLINE_JS_RE.sub(NEW_INLINE_JS, text, count=1)

    if text == original:
        print(f"  {path.relative_to(ROOT)}: no-op")
        return
    path.write_text(text, encoding="utf-8")
    print(f"  {path.relative_to(ROOT)}: updated ({len(sorted_list)} cards baked in)")


def main() -> None:
    data = json.loads(DATA.read_text(encoding="utf-8"))
    countries = data["countries"]
    print(f"Loaded {len(countries)} countries from {DATA.relative_to(ROOT)}")
    for key in LOCALES:
        patch(key, countries)


if __name__ == "__main__":
    main()
