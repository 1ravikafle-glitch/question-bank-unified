"""Rebrand built frontend output for the Loksewa mirror service.

Usage (Render build command on forestryloksewapreparation ONLY):
    pip install -r requirements.txt && python rebrand.py

The script is driven by the SITE_BRAND env var:
    SITE_BRAND=loksewa  -> rewrite visible "PSC" branding to "Loksewa"
    anything else/unset -> no-op (PSC service stays untouched)

Only the prebuilt frontend-*/dist output (what start_prod.py serves) is
modified. Source files, contact email, social handles, localStorage keys,
API titles and sitemaps are intentionally left alone.
"""

import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
DIST_DIRS = [
    os.path.join(BASE, "frontend-mobile", "dist"),
    os.path.join(BASE, "frontend-desktop", "dist"),
]
TEXT_EXTS = {".html", ".js", ".css", ".json", ".xml", ".txt", ".svg", ".webmanifest"}

# Canonical host of the primary site. On mirror services, set SITE_URL to the
# mirror's own origin (e.g. https://forestry-loksewapreparation.onrender.com)
# so sitemap.xml, canonical links, og:url and JSON-LD URLs stay self-consistent.
PRIMARY_HOST = "https://ravikafle.com.np"

# Ordered longest-first so specific phrases are replaced before generic ones.
REPLACEMENTS = [
    ("Forestry PSC Preparation — Loksewa MCQ • Success", "Forestry Loksewa Preparation — MCQ • Success"),
    ("Forestry PSC Preparation", "Forestry Loksewa Preparation"),
    ("Forestry PSC Loksewa", "Forestry Loksewa"),
    ("Loksewa PSC", "Loksewa"),
    ("PSC Preparation", "Loksewa Preparation"),
    ("Forestry PSC", "Forestry Loksewa"),
    ("PSC Mode ON", "Loksewa Mode ON"),
    ("forestry-psc-v", "forestry-loksewa-v"),
]


def main() -> int:
    if os.environ.get("SITE_BRAND", "").strip().lower() != "loksewa":
        print("[REBRAND] SITE_BRAND != loksewa, skipping (PSC branding kept).")
        return 0

    total_files = 0
    total_replacements = 0
    for dist in DIST_DIRS:
        if not os.path.isdir(dist):
            print(f"[REBRAND] WARNING: {dist} not found, skipping.")
            continue
        for root, _, files in os.walk(dist):
            for name in files:
                if os.path.splitext(name)[1].lower() not in TEXT_EXTS:
                    continue
                path = os.path.join(root, name)
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                original = content
                for old, new in REPLACEMENTS:
                    content = content.replace(old, new)
                if content != original:
                    with open(path, "w", encoding="utf-8") as f:
                        f.write(content)
                    total_files += 1
                    total_replacements += sum(
                        original.count(old) for old, _ in REPLACEMENTS
                    )

    site_url = os.environ.get("SITE_URL", "").strip().rstrip("/")
    if site_url and site_url != PRIMARY_HOST:
        host_files = 0
        for dist in DIST_DIRS:
            for root, _, files in os.walk(dist):
                for name in files:
                    if os.path.splitext(name)[1].lower() not in TEXT_EXTS:
                        continue
                    if name.endswith((".js", ".css")):
                        continue  # host URLs only live in html/xml/txt/json
                    path = os.path.join(root, name)
                    with open(path, "r", encoding="utf-8") as f:
                        content = f.read()
                    if PRIMARY_HOST in content:
                        content = content.replace(PRIMARY_HOST, site_url)
                        with open(path, "w", encoding="utf-8") as f:
                            f.write(content)
                        host_files += 1
        print(f"[REBRAND] Rewrote host to {site_url} in {host_files} files.")
    print(
        f"[REBRAND] Applied Loksewa branding: "
        f"{total_replacements} replacements in {total_files} files."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
