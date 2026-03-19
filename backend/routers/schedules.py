"""스케줄 관리 API"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from models.database import get_db, Schedule, ScheduleLog, ScheduleStatus
from datetime import date, datetime

router = APIRouter(prefix="/schedules", tags=["schedules"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class ScheduleCreate(BaseModel):
    user_id: int
    title: str
    scheduled_time: str          # "09:00"
    days_of_week: str = "0,1,2,3,4,5,6"


class ScheduleResponse(BaseModel):
    id: int
    user_id: int
    title: str
    scheduled_time: str
    days_of_week: str
    is_active: bool

    class Config:
        from_attributes = True


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/", response_model=ScheduleResponse)
def create_schedule(data: ScheduleCreate, db: Session = Depends(get_db)):
    schedule = Schedule(**data.model_dump())
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule


@router.get("/user/{user_id}")
def get_user_schedules(user_id: int, db: Session = Depends(get_db)):
    schedules = db.query(Schedule).filter(
        Schedule.user_id == user_id,
        Schedule.is_active == True
    ).order_by(Schedule.scheduled_time).all()
    return schedules


@router.delete("/{schedule_id}")
def delete_schedule(schedule_id: int, db: Session = Depends(get_db)):
    schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="스케줄을 찾을 수 없습니다.")
    schedule.is_active = False
    db.commit()
    return {"success": True}


@router.get("/user/{user_id}/today-report")
def get_today_report(user_id: int, db: Session = Depends(get_db)):
    """오늘 스케줄 달성 현황"""
    today = date.today()
    schedules = db.query(Schedule).filter(
        Schedule.user_id == user_id,
        Schedule.is_active == True
    ).all()

    schedule_ids = [s.id for s in schedules]
    logs = db.query(ScheduleLog).filter(
        ScheduleLog.schedule_id.in_(schedule_ids),
        ScheduleLog.log_date >= datetime(today.year, today.month, today.day)
    ).all()

    log_map = {l.schedule_id: l for l in logs}
    achieved = sum(1 for l in logs if l.status == ScheduleStatus.ACHIEVED)
    total = len(schedules)
    rate = round(achieved / total * 100) if total > 0 else 0

    items = []
    for s in schedules:
        log = log_map.get(s.id)
        items.append({
            "schedule_id": s.id,
            "title": s.title,
            "time": s.scheduled_time,
            "status": log.status if log else "pending"
        })

    return {
        "date": today.isoformat(),
        "achievement_rate": rate,
        "achieved": achieved,
        "total": total,
        "items": items
    }
