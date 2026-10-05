"""Content that ships with the app rather than being user data.

Kept in its own module on purpose. `main.py` (dev) and `start_prod.py` (the
deployed ASGI app) each build their own FastAPI instance and neither imports
the other, so seeding written into one is invisible to the other - production
runs start_prod, which made an inline seed in main.py a silent no-op.
"""
from sqlalchemy.orm import Session

import models

# Founding credits for the About page's "Special Contribution" block.
#
# Seeded only while the table is empty, so every admin edit, addition and
# reorder survives later deploys. The one trade-off of seeding here rather
# than hardcoding the names into the page: emptying the list entirely brings
# these two back on the next boot.
FOUNDING_CONTRIBUTORS = [
    "Abin Khanal",
    "Kiran Dangi Chhetri",
]


def seed_contributors(engine) -> int:
    """Add the founding credits when there are none. Returns how many were added."""
    try:
        with Session(engine) as db:
            if db.query(models.Contributor).count():
                return 0
            for i, name in enumerate(FOUNDING_CONTRIBUTORS):
                db.add(models.Contributor(name=name, position=i))
            db.commit()
        print(f"[SEED] Seeded {len(FOUNDING_CONTRIBUTORS)} special contributors.")
        return len(FOUNDING_CONTRIBUTORS)
    except Exception as exc:  # never block boot on content seeding
        print(f"[SEED] Contributor seed skipped: {exc}")
        return 0
