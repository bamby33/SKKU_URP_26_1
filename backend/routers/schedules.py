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
    end_time: str | None = None  # "09:30"
    color: str | None = None     # "#RRGGBB"
    days_of_week: str = "0,1,2,3,4,5,6"
    is_fixed: bool = False
    category: str | None = None  # productive | routine | other


class ScheduleResponse(BaseModel):
    id: int
    user_id: int
    title: str
    scheduled_time: str
    end_time: str | None
    color: str | None
    days_of_week: str
    is_active: bool
    is_fixed: bool
    category: str | None

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


class ScheduleCheckRequest(BaseModel):
    schedule_id: int
    achieved: bool
    note: str | None = None
    is_refusal: bool = False   # '안했어요'(거부)면 True → 거부 횟수 +1


@router.post("/check")
def check_schedule_direct(data: ScheduleCheckRequest, db: Session = Depends(get_db)):
    """스케줄 달성 여부 직접 기록 (AI 툴 우회 REST 엔드포인트)"""
    from agents.tools.schedule_check import check_schedule
    result = check_schedule(data.schedule_id, data.achieved, data.note, is_refusal=data.is_refusal)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error", "스케줄을 찾을 수 없습니다."))
    return result


# ── 동행 파이프라인 (시작 / 진행 / 종료 / 전환 / 자기평가) ────────────────────────

class StartRequest(BaseModel):
    response_type: str   # started | later | no_response


class StopRequest(BaseModel):
    achieved: bool = True
    early_stop: bool = False
    duration_min: int | None = None
    note: str | None = None


class TransitionRequest(BaseModel):
    user_id: int
    to_schedule_id: int
    from_schedule_id: int | None = None
    result: str          # accepted | refused | no_response


class SelfAssessmentRequest(BaseModel):
    value: str           # good | soso | bad


def _get_schedule(schedule_id: int, db: Session) -> Schedule:
    s = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="스케줄을 찾을 수 없습니다.")
    return s


@router.post("/{schedule_id}/start")
def start_schedule(schedule_id: int, data: StartRequest, db: Session = Depends(get_db)):
    """시작 알림 반응 기록 (시작할게요 / 조금있다가요 / 무반응)"""
    from services.achievement import record_start
    s = _get_schedule(schedule_id, db)
    log = record_start(s, data.response_type, db)
    db.commit()
    return {"ok": True, "schedule_id": schedule_id, "response_type": log.response_type}


@router.post("/{schedule_id}/stop")
def stop_schedule(schedule_id: int, data: StopRequest, db: Session = Depends(get_db)):
    """일과 종료 기록 (그만할래요 / 완료) — 진행시간·조기종료 저장"""
    from services.achievement import record_stop
    s = _get_schedule(schedule_id, db)
    log = record_stop(s, db, achieved=data.achieved, early_stop=data.early_stop,
                      duration_min=data.duration_min, note=data.note)
    db.commit()
    return {
        "ok": True, "schedule_id": schedule_id,
        "actual_duration_min": log.actual_duration_min,
        "early_stop": log.early_stop, "status": log.status,
    }


@router.post("/transition")
def record_schedule_transition(data: TransitionRequest, db: Session = Depends(get_db)):
    """일과 간 전환 결과 기록"""
    from services.achievement import record_transition
    record_transition(data.user_id, data.from_schedule_id, data.to_schedule_id, data.result, db)
    db.commit()
    return {"ok": True}


@router.post("/user/{user_id}/self-assessment")
def set_self_assessment(user_id: int, data: SelfAssessmentRequest, db: Session = Depends(get_db)):
    """당사자 하루 자기평가 (good/soso/bad) — 오늘 DailyReport 에 저장"""
    from models.database import DailyReport
    from timeutil import kst_today_start
    today = kst_today_start().date().isoformat()
    rep = db.query(DailyReport).filter(
        DailyReport.user_id == user_id, DailyReport.report_date == today
    ).first()
    if not rep:
        rep = DailyReport(user_id=user_id, report_date=today)
        db.add(rep)
    rep.self_assessment = data.value
    db.commit()
    return {"ok": True, "self_assessment": data.value}


@router.get("/user/{user_id}/today-report")
def get_today_report(user_id: int, db: Session = Depends(get_db)):
    """오늘 스케줄 달성 현황 (단일 달성 계산 로직 사용)"""
    from services.achievement import today_achievement
    from timeutil import kst_today_start

    ach = today_achievement(user_id, db)
    lm = ach["log_map"]

    items = []
    for s in ach["schedules"]:
        log = lm.get(s.id)
        items.append({
            "schedule_id": s.id,
            "title": s.title,
            "time": s.scheduled_time,
            "status": log.status if log else "pending",
            "refusal_count": (log.refusal_count or 0) if log else 0,  # 거부 n회 (구)
            "reason": (log.note if log else None),                    # 사유/메모
            "response_type": (log.response_type if log else None),    # started | later | no_response
            "actual_duration_min": (log.actual_duration_min if log else None),
            "early_stop": (bool(log.early_stop) if log else False),
        })

    return {
        "date": kst_today_start().date().isoformat(),
        "achievement_rate": ach["rate"],
        "achieved": ach["achieved"],
        "total": ach["total"],
        "items": items,
    }
