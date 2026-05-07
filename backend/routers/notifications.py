"""보호자 → 당사자 알림 API"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from models.database import get_db, GuardianNotification

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationCreate(BaseModel):
    user_id: int
    message: str


@router.post("/")
def create_notification(data: NotificationCreate, db: Session = Depends(get_db)):
    notif = GuardianNotification(user_id=data.user_id, message=data.message)
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return {"id": notif.id}


@router.get("/user/{user_id}/unread")
def get_unread(user_id: int, db: Session = Depends(get_db)):
    items = (
        db.query(GuardianNotification)
        .filter(GuardianNotification.user_id == user_id, GuardianNotification.is_read == False)
        .order_by(GuardianNotification.created_at.desc())
        .all()
    )
    return [{"id": n.id, "message": n.message, "created_at": str(n.created_at)} for n in items]


@router.put("/{notif_id}/read")
def mark_read(notif_id: int, db: Session = Depends(get_db)):
    notif = db.query(GuardianNotification).filter(GuardianNotification.id == notif_id).first()
    if notif:
        notif.is_read = True
        db.commit()
    return {"ok": True}
