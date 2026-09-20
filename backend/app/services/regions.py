"""Group a device by where it is: North / South / East / West / Central / North East India, from its GPS position.

The boundaries are deliberately coarse (a compass split of India, not state borders). A group the admin picked by hand is
never touched; a device left on "Auto" follows its position and moves group when it crosses regions.
"""
from sqlalchemy.orm import Session

from ..models import Device, DeviceGroup


def region_for(lat: float | None, lng: float | None) -> str | None:
    if lat is None or lng is None or not (6 <= lat <= 37.5 and 68 <= lng <= 98):
        return None                                              # outside India: no automatic group
    if lat >= 21.5 and lng >= 89:
        return "North East India"
    if lat >= 19.5 and lng >= 84:
        return "East India"
    if lat < 19 and lng >= 74.7:
        return "South India"
    if lng < 75.5 and lat < 25:
        return "West India"
    if 18.5 <= lat <= 26.3 and 75.5 <= lng < 84 and not (lng >= 80 and lat >= 24.5):
        return "Central India"
    if lat < 19:
        return "South India" if lng >= 74 else "West India"
    return "North India"


def apply_auto_group(db: Session, device: Device) -> None:
    """Put the device in its region's group unless an admin chose its group by hand."""
    if device.group_id is not None and not device.group_auto:
        return
    name = region_for(device.latitude, device.longitude)
    if name is None:
        return
    group = db.query(DeviceGroup).filter(DeviceGroup.name == name).first()
    if group is None:
        group = DeviceGroup(name=name)
        db.add(group)
        db.flush()
    if device.group_id != group.id:
        device.group_id = group.id
        device.group = group
    device.group_auto = True
