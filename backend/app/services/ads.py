"""Ad scheduling helpers: the default run time and "put this ad in that zone's playlist"."""
from sqlalchemy.orm import Session

from ..models import Assignment
from .settings import get_setting

DEFAULT_AD_SECONDS = 10      # 8-15 s is the usual range for a still ad on a screen people pass; 10 s reads well and loops fast
ZONE_AD_PRIORITY = 10        # what the seeded zone ads use; equal priority means "play together as a playlist"


def default_duration(db: Session) -> int:
    try:
        return max(1, min(3600, int(get_setting(db, "default_ad_duration", str(DEFAULT_AD_SECONDS)))))
    except ValueError:
        return DEFAULT_AD_SECONDS


def assign_ad(db: Session, content_id: int, zone_id: int | None, duration: int | None = None) -> Assignment | None:
    """Add an ad to a zone's playlist (zone_id None = everywhere). Returns None if it is already there.

    It joins the priority of the zone's existing always-on ads so they rotate together instead of one outranking the rest.
    """
    plain = db.query(Assignment).filter(Assignment.zone_id == zone_id, Assignment.group_id.is_(None), Assignment.start_time.is_(None),
                                        Assignment.is_emergency.is_(False))
    existing = plain.all()
    if any(a.content_id == content_id for a in existing):
        return None
    priority = max((a.priority for a in existing), default=ZONE_AD_PRIORITY if zone_id is not None else 0)
    a = Assignment(content_id=content_id, zone_id=zone_id, priority=priority, duration=duration)
    db.add(a)
    db.flush()
    return a
