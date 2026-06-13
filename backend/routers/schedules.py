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
    from services.category import normalize_category
    payload = data.model_dump()
    payload["category"] = normalize_category(payload.get("category"), payload.get("title", ""))
    # 완전 중복(같은 user·제목·시각·요일이 이미 활성) 방지 — 기존 것 재사용
    dup = db.query(Schedule).filter(
        Schedule.user_id == payload.get("user_id"),
        Schedule.title == payload.get("title"),
        Schedule.scheduled_time == payload.get("scheduled_time"),
        Schedule.days_of_week == payload.get("days_of_week"),
        Schedule.is_active == True,
    ).first()
    if dup:
        return dup
    schedule = Schedule(**payload)
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


class ReplaceItem(BaseModel):
    title: str
    scheduled_time: str
    end_time: str | None = None
    color: str | None = None
    days_of_week: str = "0,1,2,3,4,5,6"
    is_fixed: bool = False
    category: str | None = None


class ReplaceSchedulesRequest(BaseModel):
    schedules: list[ReplaceItem]


@router.post("/user/{user_id}/replace")
def replace_schedules(user_id: int, data: ReplaceSchedulesRequest, db: Session = Depends(get_db)):
    """일과 일괄 교체 — (제목, 시작시각) 기준으로 기존 일과를 재사용해 ID·로그를 보존.
    추가/수정/삭제를 ID 보존하며 반영 (홈 진행상태·7일 히트맵 유지, 전체 삭제+재생성 금지)."""
    from services.category import normalize_category
    existing = db.query(Schedule).filter(
        Schedule.user_id == user_id, Schedule.is_active == True
    ).all()
    by_key = {(e.title, e.scheduled_time): e for e in existing}
    kept: set[int] = set()
    result_ids: list[int] = []
    for inc in data.schedules:
        cat = normalize_category(inc.category, inc.title)
        ex = by_key.get((inc.title, inc.scheduled_time))
        if ex and ex.id not in kept:
            # 기존 일과 재사용 → ID·로그 보존
            ex.end_time = inc.end_time
            ex.color = inc.color
            ex.days_of_week = inc.days_of_week
            ex.is_fixed = inc.is_fixed
            ex.category = cat
            ex.is_active = True
            kept.add(ex.id)
            result_ids.append(ex.id)
        else:
            s = Schedule(user_id=user_id, title=inc.title, scheduled_time=inc.scheduled_time,
                         end_time=inc.end_time, color=inc.color, days_of_week=inc.days_of_week,
                         is_fixed=inc.is_fixed, category=cat, is_active=True)
            db.add(s)
            db.flush()
            result_ids.append(s.id)
    # 들어오지 않은 기존 일과는 비활성화 (소프트 삭제, 과거 로그 보존)
    for e in existing:
        if e.id not in kept:
            e.is_active = False
    db.commit()
    return {"ok": True, "ids": result_ids}


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
    transition_delay_min: int | None = None   # 완료 시각 − 다음 일과 시각(분). 완료 때만 전송
    next_schedule_id: int | None = None        # 전환 구간 식별용 (다음 일과 id)


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
                      duration_min=data.duration_min, note=data.note,
                      transition_delay_min=data.transition_delay_min,
                      next_schedule_id=data.next_schedule_id)
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
    # 자기평가 완료 → 보호자에게 '하루 돌아보기' 푸시 (탭하면 Recap, 앱 사용 중이면 자동 전환)
    try:
        from services.push import send_push
        from models.database import Guardian, User
        g = db.query(Guardian).filter(Guardian.user_id == user_id).first()
        if g and g.push_token:
            u = db.query(User).filter(User.id == user_id).first()
            name = u.name if u else "당사자"
            send_push(g.push_token, "하루 돌아보기",
                      f"{name}님이 오늘 하루 평가를 마쳤어요. 함께 돌아볼까요? 🌙",
                      {"type": "guardian_recap", "screen": "GuardianRecap"})
    except Exception:
        pass
    return {"ok": True, "self_assessment": data.value}


class RefusalReasonRequest(BaseModel):
    user_id: int
    kind: str            # refused(거절) | gaveup(중도포기)
    reason_text: str     # 당사자가 말한 사유 원문


def _summarize_reason(title: str, kind: str, reason_text: str) -> str:
    """당사자가 말한 거절/중도포기 사유를 보호자용으로 AI 요약 (뉴스 요약 톤)."""
    from agents.care_agent import client, LLM_MODEL
    kind_ko = "도중에 그만두려는" if kind == "gaveup" else "하기 싫어 거절한"
    prompt = (
        f"발달장애가 있는 분이 '{title}' 일과를 {kind_ko} 이유를 이렇게 말했어요:\n"
        f"\"{reason_text}\"\n\n"
        "이걸 보호자가 한눈에 이해하도록 한국어로 따뜻하게 정리해줘.\n"
        "- 2~3개의 짧은 항목으로 나눠서, 각 항목을 한 줄에 한 문장씩 줄바꿈으로 작성\n"
        "- 각 줄은 완결된 한 문장 (불릿 기호 ·, -, * 는 쓰지 말 것)\n"
        "- 당사자가 한 말을 중심으로, 과한 추측은 하지 말 것\n"
        "- 외국어·특수기호·토큰·마크다운 없이 순수 한국어 문장만"
    )
    try:
        res = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300,
            stop=["<end_of_turn>", "<start_of_turn>"],
        )
        return (res.choices[0].message.content or "").strip()
    except Exception:
        return ""


@router.post("/{schedule_id}/refusal-reason")
def save_refusal_reason(schedule_id: int, data: RefusalReasonRequest, db: Session = Depends(get_db)):
    """거절/중도포기 사유를 받아 AI 요약 후 오늘 ScheduleLog 에 저장 (보호자 노출용)."""
    from services.achievement import _today_log
    s = _get_schedule(schedule_id, db)
    log = _today_log(s, db)
    log.user_id = s.user_id
    log.note = data.reason_text
    log.log_date = datetime.utcnow()
    if data.kind == "refused":
        log.status = ScheduleStatus.MISSED
        if not log.response_type:
            log.response_type = "later"
    else:  # gaveup (중도포기) — record_stop 이 이미 early_stop 설정했을 수 있음
        log.early_stop = True
    summary = _summarize_reason(s.title, data.kind, data.reason_text)
    log.ai_summary = summary or data.reason_text
    db.commit()
    return {"ok": True, "summary": log.ai_summary}


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
