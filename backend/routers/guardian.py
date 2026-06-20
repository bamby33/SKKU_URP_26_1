"""보호자 대시보드 API"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from models.database import (
    get_db, User, Guardian, Schedule, ScheduleLog, ScheduleStatus,
    BehaviorLog, FeedbackStage, DailyReport
)
from datetime import datetime, date
from timeutil import kst_now, kst_today_start
from services.achievement import today_achievement

router = APIRouter(prefix="/guardian", tags=["guardian"])


def _today_str() -> str:
    return kst_now().date().isoformat()


def _today_dow() -> int:
    """오늘 요일 (0=월 ~ 6=일, KST 기준)"""
    return kst_now().weekday()


def _tomorrow_dow() -> int:
    return (kst_now().weekday() + 1) % 7


def _now_minutes() -> int:
    now = kst_now()
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


SLEEP_KW = ["취침", "수면", "자기", "잠자기", "잠"]


def _get_yesterday_schedules(user_id: int, db: Session) -> list[Schedule]:
    """어제 요일에 해당하는 활성 스케줄 (시간순)"""
    dow = str((kst_now().weekday() + 6) % 7)
    schedules = db.query(Schedule).filter(
        Schedule.user_id == user_id, Schedule.is_active == True
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
    if current is None:
        # 새벽(오늘 첫 일과 시작 전)에만: 어제 마지막 일과가 취침이면 그걸 현재로 간주
        first_start = _time_to_minutes(today_schedules[0].scheduled_time) if today_schedules else 24 * 60
        if now_min < first_start:
            y = _get_yesterday_schedules(user_id, db)
            if y and any(k in y[-1].title for k in SLEEP_KW):
                current = y[-1]
    # 현재 일과의 당사자 상태(진행중/완료/미달성/할 일)를 그대로 보여줌
    current_schedule = None
    if current:
        from services.achievement import latest_log_map
        _cur_log = latest_log_map([s.id for s in today_schedules], db).get(current.id)
        if _cur_log and _cur_log.early_stop:
            status = "gaveup"   # 중도포기 (시작했다 그만둠) — ACHIEVED 여부보다 우선
        elif _cur_log and _cur_log.status == ScheduleStatus.ACHIEVED:
            status = "done"
        elif _cur_log and _cur_log.status == ScheduleStatus.MISSED and (_cur_log.refusal_count or 0) > 0:
            status = "refused"  # 실시간 거절
        elif _cur_log and _cur_log.status == ScheduleStatus.MISSED:
            status = "missed"   # 단순 미달성
        elif _cur_log and (_cur_log.started_at is not None or _cur_log.response_type == "started"):
            status = "in_progress"
        elif any(k in current.title for k in SLEEP_KW) and "낮잠" not in current.title:
            status = "sleeping"  # 취침은 시작/완료 개념이 없음 — 시간이 되면 '취침 중'
        else:
            status = "todo"
        current_schedule = {
            "id": current.id,
            "title": current.title,
            "time": current.scheduled_time,
            "status": status,
            "started": status == "in_progress",
        }

    # ── 오늘 일일 리포트 (AI 분석 완료 여부) ──────────────────────────────────
    daily_report = db.query(DailyReport).filter(
        DailyReport.user_id == user_id,
        DailyReport.report_date == today,
        DailyReport.is_complete == True
    ).first()

    day_complete = daily_report is not None

    # 일과 진행 중/완료 모두 달성률 실시간 계산 (단일 달성 로직)
    ach = today_achievement(user_id, db)
    log_map = ach["log_map"]
    live_achieved = ach["achieved"]
    live_total = ach["total"]
    live_rate = ach["rate"]

    today_report = None
    if day_complete:
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
            "achievement_rate": live_rate,
            "items": items,
        }

    # ── 오늘의 확인사항 (BehaviorLog) ─────────────────────────────────────────
    behavior_logs = db.query(BehaviorLog).filter(
        BehaviorLog.user_id == user_id,
        BehaviorLog.logged_at >= kst_today_start()
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

    # ── 실제 디텍트된 문제행동만 (보호자 호출/진정단계 제외) + 요약 ──────────────
    import re as _re
    def _clean_title(t: str | None) -> str:
        if not t:
            return ""
        return _re.sub(r"[^\w\s가-힣]", "", t).strip()

    def _behavior_summary(bl, title: str | None) -> str:
        """불릿용 — 줄바꿈으로 구분된 1~2개 문장. context(시작/수행 중) 반영."""
        trig = bl.trigger or ""
        t = _clean_title(title)
        if bl.context == "transition":
            where = (f"{t} 일과를 시작하려 할 때 " if t else "일과를 시작하려 할 때 ")
        elif t:
            where = f"{t} 일과 도중 "
        else:
            where = ""
        if "decibel" in trig or "voice" in trig:
            first = where + "큰 소리를 내며 흥분한 반응을 보였어요."
        elif "text" in trig or "refus" in trig:
            first = where + "하기 싫다는 거부 표현을 했어요."
        else:
            first = where + "문제 행동이 감지됐어요."
        lines = [first]
        if bl.note:
            lines.append(f'이유는 "{bl.note}" 라고 했어요.')
        return "\n".join(lines)

    real_logs = [bl for bl in behavior_logs
                 if (bl.trigger or "") != "emergency" and bl.stage != FeedbackStage.STAGE_3]
    behavior_count = len(real_logs)
    behavior_events = [{
        "id": bl.id,
        "logged_at": bl.logged_at.isoformat(),
        "stage_label": stage_labels.get(bl.stage, bl.stage),
        "summary": _behavior_summary(bl, schedule_map.get(bl.schedule_id) if bl.schedule_id else None),
    } for bl in real_logs]

    # ── 내일 스케줄 ────────────────────────────────────────────────────────────
    tomorrow_schedules = _get_tomorrow_schedules(user_id, db)
    tomorrow = [
        {"id": s.id, "title": s.title, "time": s.scheduled_time, "end": s.end_time}
        for s in tomorrow_schedules
    ]

    _user = db.query(User).filter(User.id == user_id).first()
    user_name = _user.name if _user else ""

    # ── 오늘 일과 목록 (항상, 달성/미달성 상세용) ─────────────────────────────
    today_items = []
    for s in today_schedules:
        log = log_map.get(s.id)
        today_items.append({
            "schedule_id": s.id, "title": s.title, "time": s.scheduled_time, "end": s.end_time,
            "status": (log.status if log else "pending"),
            "early_stop": (bool(log.early_stop) if log else False),
            "refusal_count": ((log.refusal_count or 0) if log else 0),  # >0 = 실시간 거절, 0 = 단순 미달성
            "duration": (log.actual_duration_min if log else None),
            "note": (log.note if log else None),
            "ai_summary": (log.ai_summary if log else None),
        })

    # ── 일과별 적합도 (🟢🟡🔴, 최근 7일) + 주간 달성률 꺾은선 ──────────────────
    from services.achievement import schedule_suitability, weekly_rates
    suitability = schedule_suitability(user_id, db, days=7)
    week_rates = weekly_rates(user_id, db, days=7)

    # ── 오늘 당사자 자기평가 ───────────────────────────────────────────────────
    today_rep_any = db.query(DailyReport).filter(
        DailyReport.user_id == user_id, DailyReport.report_date == today
    ).first()
    self_assessment = today_rep_any.self_assessment if today_rep_any else None

    return {
        "current_schedule": current_schedule,
        "day_complete": day_complete,
        "today_report": today_report,
        "live_achieved": live_achieved,
        "live_total": live_total,
        "live_rate": live_rate,
        "behavior_alerts": behavior_alerts,
        "behavior_count": behavior_count,
        "behavior_events": behavior_events,
        "has_unread": has_unread,
        "ai_summary": daily_report.ai_summary if daily_report else None,
        "tomorrow_schedules": tomorrow,
        "suitability": suitability,
        "self_assessment": self_assessment,
        "today_items": today_items,
        "weekly_rates": week_rates,
        "user_name": user_name,
    }


class PushTokenRequest(BaseModel):
    token: str


@router.post("/user/{user_id}/push-token")
def save_push_token(user_id: int, body: PushTokenRequest, db: Session = Depends(get_db)):
    """보호자 기기의 Expo 푸시 토큰 저장 (보호자 로그인 시 호출)"""
    guardian = db.query(Guardian).filter(Guardian.user_id == user_id).first()
    if not guardian:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="보호자를 찾을 수 없습니다.")
    guardian.push_token = body.token
    db.commit()
    return {"ok": True}


@router.post("/user/{user_id}/emergency")
def send_emergency(user_id: int, db: Session = Depends(get_db)):
    """당사자가 보호자에게 긴급 알림 발송 (대시보드 기록 + 푸시 + SMS)"""
    from agents.tools.messaging import send_message as sms_send
    from services.push import send_push

    user = db.query(User).filter(User.id == user_id).first()
    name = user.name if user else "당사자"

    # 1. 대시보드 '오늘의 확인사항'에 표시되도록 BehaviorLog 기록
    db.add(BehaviorLog(
        user_id=user_id, stage=FeedbackStage.STAGE_2,
        trigger="emergency", logged_at=datetime.utcnow(),
    ))
    db.commit()

    # 2. 보호자 푸시 (탭하면 대시보드로)
    guardian = db.query(Guardian).filter(Guardian.user_id == user_id).first()
    if guardian and guardian.push_token:
        send_push(
            guardian.push_token,
            "긴급 호출",
            f"{name}님이 보호자를 호출했어요.",
            {"type": "guardian", "screen": "GuardianReport"},
        )

    # 3. SMS (Twilio 설정 시)
    result = sms_send(user_id=user_id, message_type="emergency",
                      extra_info="당사자가 직접 보호자 호출을 요청했습니다.")
    return {"success": True, "recipient": result.get("recipient")}


class NotifyDoneRequest(BaseModel):
    schedule_id: int


@router.post("/user/{user_id}/notify-done")
def notify_done(user_id: int, body: NotifyDoneRequest, db: Session = Depends(get_db)):
    """productive 일과 완료 시 보호자에게 알림 (푸시 + 인앱 알림 기록)."""
    from services.push import send_push
    from models.database import Schedule, GuardianNotification
    sched = db.query(Schedule).filter(Schedule.id == body.schedule_id).first()
    user = db.query(User).filter(User.id == user_id).first()
    name = user.name if user else "당사자"
    title = sched.title if sched else "일과"
    import re as _re
    clean = _re.sub(r"[^\w\s가-힣]", "", title).strip()
    msg = f"{name}님이 '{clean}' 일과를 완료했어요! 👏"
    # 인앱 알림 기록 (GuardianNotification 있으면)
    try:
        db.add(GuardianNotification(user_id=user_id, message=msg))
        db.commit()
    except Exception:
        db.rollback()
    guardian = db.query(Guardian).filter(Guardian.user_id == user_id).first()
    if guardian and guardian.push_token:
        send_push(guardian.push_token, "일과 완료", msg, {"type": "guardian", "screen": "GuardianReport"})
    return {"ok": True}


@router.post("/user/{user_id}/test-sms")
def test_sms(user_id: int, db: Session = Depends(get_db)):
    """SMS 발송 테스트 (개발용)"""
    from agents.tools.messaging import send_message as sms_send
    result = sms_send(
        user_id=user_id,
        message_type="emergency",
        extra_info="SMS 연동 테스트 메시지입니다."
    )
    return result


class MissedScheduleRequest(BaseModel):
    schedule_title: str
    reason: str = ""


@router.post("/user/{user_id}/missed-schedule")
def notify_missed_schedule(user_id: int, body: MissedScheduleRequest, db: Session = Depends(get_db)):
    """당사자가 일과를 미수행했을 때 보호자에게 SMS 알림"""
    from agents.tools.messaging import send_message as sms_send
    msg = f"'{body.schedule_title}' 일과를 수행하지 못했습니다."
    if body.reason:
        msg += f" 이유: {body.reason}"
    result = sms_send(user_id=user_id, message_type="schedule_miss", extra_info=msg)
    return {"success": result.get("success", False)}


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
