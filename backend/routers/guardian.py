"""보호자 대시보드 API"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from models.database import (
    get_db, Schedule, ScheduleLog, ScheduleStatus,
    BehaviorLog, FeedbackStage, DailyReport
)
from datetime import datetime, date

router = APIRouter(prefix="/guardian", tags=["guardian"])


def _today_str() -> str:
    return date.today().isoformat()


def _today_dow() -> int:
    """오늘 요일 (0=월 ~ 6=일, Python weekday 기준)"""
    return datetime.now().weekday()


def _tomorrow_dow() -> int:
    return (datetime.now().weekday() + 1) % 7


def _now_minutes() -> int:
    now = datetime.now()
    return now.hour * 60 + now.minute


def _time_to_minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _get_today_schedules(user_id: int, db: Session) -> list[Schedule]:
    """오늘 요일에 해당하는 활성 스케줄 (시간순)"""
    dow = str(_today_dow())
    schedules = db.query(Schedule).filter(
        Schedule.user_id == user_id,
        Schedule.is_active == True
    ).order_by(Schedule.scheduled_time).all()
    return [s for s in schedules if dow in s.days_of_week.split(",")]


def _get_tomorrow_schedules(user_id: int, db: Session) -> list[Schedule]:
    """내일 요일에 해당하는 활성 스케줄"""
    dow = str(_tomorrow_dow())
    schedules = db.query(Schedule).filter(
        Schedule.user_id == user_id,
        Schedule.is_active == True
    ).order_by(Schedule.scheduled_time).all()
    return [s for s in schedules if dow in s.days_of_week.split(",")]


def _find_current_schedule(schedules: list[Schedule], now_min: int) -> Schedule | None:
    """현재 시각 기준 수행 중인 스케줄"""
    for i, s in enumerate(schedules):
        start = _time_to_minutes(s.scheduled_time)
        end = _time_to_minutes(schedules[i + 1].scheduled_time) if i + 1 < len(schedules) else 24 * 60
        if start <= now_min < end:
            return s
    return None


@router.get("/user/{user_id}/dashboard")
def get_dashboard(user_id: int, db: Session = Depends(get_db)):
    """보호자 대시보드 전체 데이터"""
    today = _today_str()
    now_min = _now_minutes()

    # ── 오늘 스케줄 ────────────────────────────────────────────────────────────
    today_schedules = _get_today_schedules(user_id, db)

    # ── 현재 수행 중인 일과 ────────────────────────────────────────────────────
    current = _find_current_schedule(today_schedules, now_min)
    current_schedule = None
    if current:
        current_schedule = {
            "id": current.id,
            "title": current.title,
            "time": current.scheduled_time,
        }

    # ── 오늘 일일 리포트 (AI 분석 완료 여부) ──────────────────────────────────
    daily_report = db.query(DailyReport).filter(
        DailyReport.user_id == user_id,
        DailyReport.report_date == today,
        DailyReport.is_complete == True
    ).first()

    day_complete = daily_report is not None
    today_report = None

    if day_complete:
        # ScheduleLog에서 달성 현황 조회
        schedule_ids = [s.id for s in today_schedules]
        today_start = datetime.combine(date.today(), datetime.min.time())
        logs = db.query(ScheduleLog).filter(
            ScheduleLog.schedule_id.in_(schedule_ids),
            ScheduleLog.log_date >= today_start
        ).all()
        log_map = {l.schedule_id: l for l in logs}

        achieved = sum(1 for l in logs if l.status == ScheduleStatus.ACHIEVED)
        total = len(today_schedules)
        rate = round(achieved / total * 100) if total > 0 else 0

        items = []
        for s in today_schedules:
            log = log_map.get(s.id)
            status = log.status if log else ScheduleStatus.PENDING
            items.append({
                "schedule_id": s.id,
                "title": s.title,
                "time": s.scheduled_time,
                "status": status,
            })

        today_report = {
            "date": today,
            "achieved": daily_report.achieved,
            "total": daily_report.total,
            "achievement_rate": rate,
            "items": items,
        }

    # ── 오늘의 확인사항 (BehaviorLog) ─────────────────────────────────────────
    today_start = datetime.combine(date.today(), datetime.min.time())
    behavior_logs = db.query(BehaviorLog).filter(
        BehaviorLog.user_id == user_id,
        BehaviorLog.logged_at >= today_start
    ).order_by(BehaviorLog.logged_at.desc()).all()

    # 스케줄 제목 맵
    schedule_map = {s.id: s.title for s in today_schedules}

    stage_labels = {
        FeedbackStage.STAGE_1: "1단계 (주의)",
        FeedbackStage.STAGE_2: "2단계 (흥분)",
        FeedbackStage.STAGE_3: "3단계 (진정 후)",
    }

    behavior_alerts = []
    has_unread = False
    for bl in behavior_logs:
        if not bl.is_read:
            has_unread = True
        schedule_title = schedule_map.get(bl.schedule_id, None) if bl.schedule_id else None
        behavior_alerts.append({
            "id": bl.id,
            "stage": bl.stage,
            "stage_label": stage_labels.get(bl.stage, bl.stage),
            "schedule_title": schedule_title,
            "trigger": bl.trigger,
            "logged_at": bl.logged_at.isoformat(),
            "is_read": bl.is_read,
        })

    # ── 내일 스케줄 ────────────────────────────────────────────────────────────
    tomorrow_schedules = _get_tomorrow_schedules(user_id, db)
    tomorrow = [
        {"id": s.id, "title": s.title, "time": s.scheduled_time}
        for s in tomorrow_schedules
    ]

    return {
        "current_schedule": current_schedule,
        "day_complete": day_complete,
        "today_report": today_report,
        "behavior_alerts": behavior_alerts,
        "has_unread": has_unread,
        "ai_summary": daily_report.ai_summary if daily_report else None,
        "tomorrow_schedules": tomorrow,
    }


@router.put("/user/{user_id}/mark-alerts-read")
def mark_alerts_read(user_id: int, db: Session = Depends(get_db)):
    """오늘의 확인사항 모두 읽음 처리 (빨간 점 제거)"""
    today_start = datetime.combine(date.today(), datetime.min.time())
    db.query(BehaviorLog).filter(
        BehaviorLog.user_id == user_id,
        BehaviorLog.logged_at >= today_start,
        BehaviorLog.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"success": True}
