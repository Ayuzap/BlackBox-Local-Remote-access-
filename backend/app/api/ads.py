"""Ad management: the default run time and adding an ad to a zone's playlist."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Content, User, Zone
from ..realtime import announce_changes
from ..security import current_user, require_admin
from ..services.ads import assign_ad, default_duration
from ..services.settings import set_setting

router = APIRouter(tags=["ads"])


class DefaultDurationIn(BaseModel):
    seconds: int = Field(ge=1, le=3600)


class AdAssignIn(BaseModel):
    content_id: int
    zone_id: int | None = None                       # None = everywhere
    duration: int | None = Field(None, ge=1, le=3600)  # None = the ad's own run time


@router.get("/settings/ads")
def get_ad_settings(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return {"default_duration": default_duration(db)}


@router.put("/settings/ads")
def set_ad_settings(body: DefaultDurationIn, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    set_setting(db, "default_ad_duration", str(body.seconds))
    return {"default_duration": body.seconds}


@router.post("/ads/assign", status_code=201)
def assign(body: AdAssignIn, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if not db.get(Content, body.content_id):
        raise HTTPException(400, "Unknown ad")
    if body.zone_id is not None and not db.get(Zone, body.zone_id):
        raise HTTPException(400, "Unknown zone")
    a = assign_ad(db, body.content_id, body.zone_id, body.duration)
    if a is None:
        raise HTTPException(409, "That ad is already in this playlist")
    db.commit()
    announce_changes()
    return {"id": a.id, "priority": a.priority}
