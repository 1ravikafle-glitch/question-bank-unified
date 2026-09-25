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
    print(
        f"[REBRAND] Applied Loksewa branding: "
        f"{total_replacements} replacements in {total_files} files."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
