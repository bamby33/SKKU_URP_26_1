"""AI 시간표 추천 API"""
import json
import os
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from concurrent.futures import ThreadPoolExecutor, as_completed
from sqlalchemy.orm import Session
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv
from models.database import get_db, User, Schedule, ScheduleLog, ScheduleStatus, BehaviorLog, FeedbackStage
from datetime import datetime, timedelta

load_dotenv()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])


# ── 다음날 최적화 제안 (보호자 승인 방식) ──────────────────────────────────────

@router.get("/next-day-suggestions/{user_id}")
def get_next_day_suggestions(user_id: int, db: Session = Depends(get_db)):
    """내일 일과 조정 제안 — LLM 판단(행동·사유 기반) + 규칙 기반 병합. AI 우선·중복 제거."""
    from services.optimize import next_day_suggestions
    ai = ai_next_day_suggestions(user_id, db)
    rules = next_day_suggestions(user_id, db)
    seen = {(a["type"], tuple(a.get("schedule_ids", []))) for a in ai}
    merged = ai + [r for r in rules if (r["type"], tuple(r.get("schedule_ids", []))) not in seen]
    return {"suggestions": merged}


class ApplyShortenRequest(BaseModel):
    schedule_ids: list[int]
    new_end_time: str


@router.post("/apply-shorten")
def apply_shorten_suggestion(data: ApplyShortenRequest, db: Session = Depends(get_db)):
    """시간 단축 제안 적용 — 해당 일과 end_time 변경."""
    from services.optimize import apply_shorten
    n = apply_shorten(data.schedule_ids, data.new_end_time, db)
    return {"ok": True, "updated": n}


class ApplyRestRequest(BaseModel):
    user_id: int
    rest_start: str
    rest_end: str
    days_of_week: str


@router.post("/apply-rest")
def apply_rest_suggestion(data: ApplyRestRequest, db: Session = Depends(get_db)):
    """휴식 자동 삽입 제안 적용 — rest 일과 생성."""
    from services.optimize import apply_rest
    n = apply_rest(data.user_id, data.rest_start, data.rest_end, data.days_of_week, db)
    return {"ok": True, "created": n}


START_H = 6
TOTAL_SLOTS = 32  # 06:00 ~ 22:00

DISABILITY_KO = {
    "intellectual": "지적장애",
    "autism": "자폐스펙트럼장애",
}
LEVEL_KO = {
    "mild": "경도",
    "moderate": "중도",
    "severe": "고도",
}


def _get_behavior_notes(user_id: int, db: Session, days: int = 30) -> str:
    """최근 N일 행동 원인 메모 요약"""
    since = datetime.now() - timedelta(days=days)
    logs = db.query(BehaviorLog).filter(
        BehaviorLog.user_id == user_id,
        BehaviorLog.note != None,
        BehaviorLog.logged_at >= since,
    ).order_by(BehaviorLog.logged_at.desc()).limit(5).all()
    if not logs:
        return ""
    lines = [
        f"- {l.logged_at.strftime('%m/%d')} 문제행동 원인: {l.note}"
        for l in logs
    ]
    return "\n[최근 문제행동 원인 (스케줄 조정에 반드시 반영하세요)]\n" + "\n".join(lines) + "\n"


def _get_missed_reasons(user_id: int, db: Session, days: int = 30) -> str:
    """최근 N일 미수행 이유 요약"""
    since = datetime.now() - timedelta(days=days)
    logs = (
        db.query(ScheduleLog, Schedule)
        .join(Schedule, ScheduleLog.schedule_id == Schedule.id)
        .filter(
            Schedule.user_id == user_id,
            ScheduleLog.status == ScheduleStatus.MISSED,
            ScheduleLog.note != None,
            ScheduleLog.log_date >= since,
        )
        .order_by(ScheduleLog.log_date.desc())
        .limit(10)
        .all()
    )
    if not logs:
        return ""
    lines = [
        f"- '{s.title}' 미수행 이유: {l.note} ({l.log_date.strftime('%m/%d')})"
        for l, s in logs
    ]
    return "\n[최근 미수행 이유 (스케줄 조정에 반드시 반영하세요)]\n" + "\n".join(lines) + "\n"


def _to_slot(hhmm: str) -> int:
    h, m = map(int, hhmm.split(":"))
    return (h - START_H) * 2 + round(m / 30)


def _clean_json(text: str) -> str:
    text = text.strip()
    # 코드블록 제거
    if "```" in text:
        parts = text.split("```")
        for part in parts:
            part = part.strip()
            if part.startswith("json"):
                part = part[4:].strip()
            if part.startswith("["):
                text = part
                break
    # 첫 번째 완전한 배열만 추출 (Extra data 방지)
    start = text.find("[")
    if start == -1:
        return text
    depth = 0
    for i in range(start, len(text)):
        if text[i] == '[':
            depth += 1
        elif text[i] == ']':
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
    return text[start:]


_OPT_ACTIONS = ("time_adjust", "insert_rest", "reduce")


def _ko_only(s: str) -> str:
    """LLM reason 정제 — 한자 제거, 率→율, 영어 등급어→한글."""
    import re as _re
    s = (s or "").replace("率", "율")
    for a, b in (("yellow", "주의"), ("red", "힘듦"), ("green", "좋음")):
        s = _re.sub(a, b, s, flags=_re.IGNORECASE)
    s = _re.sub(r"[一-鿿]", "", s)          # 남은 한자 제거
    return _re.sub(r"\s{2,}", " ", s).strip()


def ai_next_day_suggestions(user_id: int, db: Session) -> list[dict]:
    """LLM이 문제행동·거절 사유·힘들어한 일과를 직접 보고 내일 일과 조정을 '판단'.
    허용 행위: time_adjust(시간조정) / insert_rest(휴식삽입) / reduce(일과수줄이기).
    실패 시 빈 리스트 → 호출부에서 규칙 기반으로 폴백."""
    import json as _json
    from timeutil import kst_now
    from services.achievement import schedule_suitability
    from services.optimize import _mins, _hhmm

    tomorrow_dow = str((kst_now().weekday() + 1) % 7)
    scheds = db.query(Schedule).filter(
        Schedule.user_id == user_id, Schedule.is_active == True
    ).order_by(Schedule.scheduled_time).all()
    tomorrow = [s for s in scheds if tomorrow_dow in s.days_of_week.split(",")]
    if not tomorrow:
        return []
    by_id = {s.id: s for s in tomorrow}

    # 내일 일과 목록(LLM 입력)
    lines = []
    for s in tomorrow:
        lines.append(f"- id={s.id} | {s.title} | {s.scheduled_time}~{s.end_time or '?'} | 카테고리={s.category or 'routine'}")
    sched_block = "\n".join(lines)

    # 최근 힘들어한 일과(적합도) 요약
    suit = schedule_suitability(user_id, db, days=7)
    hard = [su for su in suit if su["grade"] in ("yellow", "red") or su.get("crisis", 0) > 0 or su.get("early_stop", 0) > 0 or su.get("missed", 0) > 0]
    hard_lines = [
        f"- {su['title']}: 상태={ {'green':'좋음','yellow':'주의','red':'힘듦','unknown':'기록부족'}.get(su['grade'], su['grade']) }, 완료 {su.get('completed_full',0)}회, 중도포기 {su.get('early_stop',0)}회, 미수행 {su.get('missed',0)}회, 도전행동 {su.get('crisis',0)}회, 전환지연 평균 {su.get('delay_avg',0)}분"
        for su in hard
    ]
    hard_block = "\n".join(hard_lines) or "(특이사항 없음)"

    behavior = _get_behavior_notes(user_id, db, days=14)
    missed = _get_missed_reasons(user_id, db, days=14)

    prompt = f"""너는 발달장애 당사자의 '내일 일과'를 최적화하는 전문 보조자다.
아래 데이터(힘들어한 일과·문제행동 원인·거절 사유)를 근거로, 내일 일과를 더 잘 해낼 수 있게 조정 제안을 한다.

[내일 일과]
{sched_block}

[최근 7일 힘들어한 일과]
{hard_block}
{behavior}{missed}
가능한 행위(반드시 이 셋 중에서만):
- time_adjust: 너무 길거나 부담스러운 일과의 종료시각을 당겨 시간을 줄임 (productive/routine만)
- insert_rest: 특정 일과 직전에 짧은 휴식을 넣어 전환 부담을 낮춤 (sleep 앞은 금지)
- reduce: 부담이 큰 활동(productive) 일과 하나를 내일은 빼서 여유를 줌

규칙:
- fixed(기관·병원 등 고정일정)와 sleep(수면)은 시간조정·삭제 금지. 휴식은 sleep 앞만 금지.
- 근거가 분명한 일과만 제안한다. 억지로 만들지 말고, 조정할 게 없으면 빈 배열을 반환한다.
- reason은 **이유를 담아 부드럽게 권유하는 한 문장**이다 (사유·문제행동·완료율 등 근거 + "~ 어떨까요?" 권유형).
  예: "독서·여가를 자주 힘들어해서, 내일은 시간을 조금 줄여보는 건 어떨까요?"
- reason은 **순수 한글 문장만** 쓴다. 한자(完了率·率 등)·영어 단어(yellow·red 등)·특수기호를 절대 쓰지 마라. 등급은 '좋음/주의/힘듦'으로, 비율은 '완료율'처럼 한글로 쓴다.

JSON 배열로만 답하라. 각 원소:
{{"type":"time_adjust|insert_rest|reduce", "schedule_id":정수, "reason":"근거", "new_end_time":"HH:MM(시간조정일 때)", "rest_minutes":정수(휴식일 때, 기본10)}}"""

    try:
        groq_client = OpenAI(base_url="https://api.groq.com/openai/v1", api_key=os.getenv("GROQ_API_KEY"))
        resp = groq_client.chat.completions.create(
            model=os.getenv("GROQ_SCHEDULE_MODEL", "llama-3.3-70b-versatile"),
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3, max_tokens=900,
        )
        raw = _clean_json(resp.choices[0].message.content or "[]")
        items = _json.loads(raw)
        if not isinstance(items, list):
            return []
    except Exception:
        return []

    out: list[dict] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        typ = it.get("type")
        sid = it.get("schedule_id")
        s = by_id.get(sid) if isinstance(sid, int) else None
        reason = _ko_only((it.get("reason") or "").strip())
        if typ not in _OPT_ACTIONS or not s or not reason:
            continue
        cat = s.category or "routine"
        if typ == "time_adjust":
            if cat in ("fixed", "sleep"):
                continue
            ne = it.get("new_end_time")
            if not (isinstance(ne, str) and ":" in ne) or not s.end_time:
                continue
            nem = _mins(ne)
            # 시작보다 늦고, 하루 안이며, 기존 종료와 달라야 의미 있음 (단축·연장 모두 허용 = '조정')
            if nem <= _mins(s.scheduled_time) or nem > 23 * 60 + 59 or nem == _mins(s.end_time):
                continue
            out.append({
                "type": "shorten", "title": s.title, "schedule_ids": [s.id],
                "message": reason, "planned_min": _mins(s.end_time) - _mins(s.scheduled_time),
                "new_min": nem - _mins(s.scheduled_time),
                "applicable": True, "action": {"new_end_time": ne}, "ai": True,
            })
        elif typ == "insert_rest":
            if cat == "sleep":
                continue
            rlen = it.get("rest_minutes") if isinstance(it.get("rest_minutes"), int) else 10
            rlen = max(5, min(20, rlen))
            r_end = s.scheduled_time
            r_start = _hhmm(_mins(r_end) - rlen)
            out.append({
                "type": "rest", "title": s.title, "schedule_ids": [s.id],
                "message": reason, "applicable": True,
                "action": {"user_id": user_id, "to_schedule_id": s.id,
                           "rest_start": r_start, "rest_end": r_end, "days_of_week": s.days_of_week},
                "ai": True,
            })
        elif typ == "reduce":
            if cat != "productive":
                continue
            out.append({
                "type": "reduce", "title": s.title, "schedule_ids": [s.id],
                "message": reason, "applicable": False, "action": {}, "ai": True,
            })
    return out


@router.post("/suggest-schedule/{user_id}")
def suggest_schedule(user_id: int, db: Session = Depends(get_db)):
    """사용자 프로필 기반 AI 일주일 시간표 추천"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    existing = db.query(Schedule).filter(
        Schedule.user_id == user_id, Schedule.is_active == True
    ).all()
    existing_titles = list({s.title for s in existing})

    disability = DISABILITY_KO.get(str(user.disability_type), user.disability_type)
    level = LEVEL_KO.get(str(user.disability_level), user.disability_level)
    notes = user.special_notes or "없음"
    existing_str = ", ".join(existing_titles) if existing_titles else "없음"
    missed_reasons = _get_missed_reasons(user_id, db)
    behavior_notes = _get_behavior_notes(user_id, db)

    prompt = f"""다음 발달장애인을 위한 일주일 생활 시간표를 추천해주세요.

사용자 정보:
- 이름: {user.name}
- 장애 유형: {disability} ({level})
- 특이사항: {notes}
- 기존 일과 항목: {existing_str}
{missed_reasons}{behavior_notes}
요구사항:
- 발달장애인에게 적합한 규칙적이고 예측 가능한 시간표
- 반복되는 일상 루틴 강조 (기상, 식사, 취침 등)
- 적당한 여가와 활동 포함
- 주중(월~금)과 주말(토~일) 패턴 구분
- 하루 8~10개 항목
- 미수행 이유가 있는 일과는 시간대·장소·내용을 조정하거나 대안을 제안하세요

아래 JSON 배열 형식으로만 응답하세요. 다른 설명은 절대 포함하지 마세요:
[
  {{"day": 0, "start": "07:00", "end": "07:30", "name": "기상·세면", "emoji": "🌅", "color": "#FFB74D", "category": "routine"}},
  ...
]

규칙:
- 모든 name(일과 이름)은 반드시 한국어로만 작성하세요. 영어·러시아어 등 외국어 절대 금지.
- day: 0=월 1=화 2=수 3=목 4=금 5=토 6=일
- start/end: "HH:MM" 형식, 06:00~22:00 범위
- emoji: 일과를 가장 잘 표현하는 이모지 하나
- color: 반드시 이 중 하나 선택 "#FFB74D" "#4CAF7D" "#AB77E8" "#6B9BF2" "#5BB7C0" "#E57373" "#26C6DA" "#AED581" "#FF8A65"
- category: 반드시 아래 5개 중 하나
  · productive : 성취·발달 활동 (숙제, 자습, 독서, 그림, 운동, 요리, 청소)
  · routine    : 매일 하는 건강·위생 (기상·세면, 식사, 목욕, 약 복용, 산책)
  · fixed      : 외부 기관 방문 (복지관, 학교, 병원, 치료)
  · sleep      : 취침
  · rest       : 휴식·자유시간 (놀이, 여가)
"""

    try:
        groq_client = OpenAI(base_url="https://api.groq.com/openai/v1", api_key=os.getenv("GROQ_API_KEY"))
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=4096,
        )
        raw = response.choices[0].message.content or ""
    except Exception as e:
        logger.error(f"LLM API error: {e}")
        raise HTTPException(status_code=503, detail=f"AI 서비스 오류: {str(e)}")

    try:
        cleaned = _clean_json(raw)
        items = json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error: {e}\nRaw: {raw[:500]}")
        raise HTTPException(status_code=500, detail="AI 응답을 파싱하지 못했어요. 다시 시도해주세요.")

    valid_colors = {
        "#FFB74D", "#4CAF7D", "#AB77E8", "#6B9BF2",
        "#5BB7C0", "#E57373", "#26C6DA", "#AED581", "#FF8A65",
    }

    blocks = []
    for item in items:
        try:
            ss = _to_slot(item["start"])
            es = _to_slot(item["end"])
            if ss < 0 or ss >= TOTAL_SLOTS or es <= ss:
                continue
            color = item.get("color", "#4CAF7D")
            if color not in valid_colors:
                color = "#4CAF7D"
            from services.category import normalize_category
            blocks.append({
                "day": int(item["day"]),
                "startSlot": ss,
                "endSlot": min(es, TOTAL_SLOTS),
                "name": item["name"],
                "emoji": item.get("emoji", "📋"),
                "color": color,
                "category": normalize_category(item.get("category"), item["name"]),
            })
        except (KeyError, ValueError):
            continue

    if not blocks:
        raise HTTPException(status_code=500, detail="AI가 유효한 시간표를 생성하지 못했어요. 다시 시도해주세요.")

    return {"blocks": blocks}


# ── 내일 특이사항 기반 스케줄 업데이트 ───────────────────────────────────────

class TomorrowNoteRequest(BaseModel):
    user_id: int
    note: str


@router.post("/update-tomorrow")
def update_tomorrow_schedule(data: TomorrowNoteRequest, db: Session = Depends(get_db)):
    """보호자가 입력한 내일 특이사항을 바탕으로 AI가 내일 일과를 업데이트"""
    user = db.query(User).filter(User.id == data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    # 내일 요일 인덱스 (0=월 ~ 6=일)
    tomorrow_idx = (datetime.today().weekday() + 1) % 7
    day_labels = ['월', '화', '수', '목', '금', '토', '일']
    tomorrow_label = day_labels[tomorrow_idx]

    # 내일 기존 스케줄 조회
    all_schedules = db.query(Schedule).filter(
        Schedule.user_id == data.user_id,
        Schedule.is_active == True,
    ).all()
    tomorrow_schedules = [
        s for s in all_schedules
        if str(tomorrow_idx) in [d.strip() for d in s.days_of_week.split(',')]
    ]
    existing_str = "\n".join(
        f"- {s.scheduled_time} {s.title}"
        for s in sorted(tomorrow_schedules, key=lambda x: x.scheduled_time)
    ) or "등록된 일과 없음"

    disability = DISABILITY_KO.get(str(user.disability_type), user.disability_type)
    level = LEVEL_KO.get(str(user.disability_level), user.disability_level)

    prompt = f"""발달장애인의 내일({tomorrow_label}요일) 일과를 특이사항에 맞게 수정해주세요.

사용자 정보:
- 이름: {user.name}
- 장애 유형: {disability} ({level})

내일의 기존 일과:
{existing_str}

보호자가 입력한 내일 특이사항:
{data.note}

지시사항:
- 특이사항을 최대한 반영하여 내일 하루 일과를 새로 작성하세요
- 기상·식사·취침 등 기본 루틴은 특이사항으로 변경이 명시된 경우에만 수정하세요
- 특이사항으로 인한 외출, 병원, 행사 등은 적절한 시간에 추가하세요
- 발달장애인에게 적합한 규칙적이고 예측 가능한 구성을 유지하세요

아래 JSON 배열 형식으로만 응답하세요. 다른 설명은 절대 포함하지 마세요:
[
  {{"start": "07:00", "end": "07:30", "name": "기상·세면", "emoji": "🌅", "color": "#FFB74D"}},
  ...
]

규칙:
- 모든 name(일과 이름)은 반드시 한국어로만 작성하세요. 영어·러시아어 등 외국어 절대 금지.
- start/end: "HH:MM" 형식, 06:00~22:00 범위
- emoji: 일과를 가장 잘 표현하는 이모지 하나
- color: 반드시 이 중 하나 선택 "#FFB74D" "#4CAF7D" "#AB77E8" "#6B9BF2" "#5BB7C0" "#E57373" "#26C6DA" "#AED581" "#FF8A65"
"""

    try:
        groq_client = OpenAI(base_url="https://api.groq.com/openai/v1", api_key=os.getenv("GROQ_API_KEY"))
        response = groq_client.chat.completions.create(
            model=os.getenv("GROQ_SCHEDULE_MODEL", "llama-3.3-70b-versatile"),
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2048,
        )
        raw = response.choices[0].message.content or ""
    except Exception as e:
        logger.error(f"Groq API error (update-tomorrow): {e}")
        raise HTTPException(status_code=503, detail=f"AI 서비스 오류: {str(e)}")

    try:
        cleaned = _clean_json(raw)
        items = json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error (update-tomorrow): {e}\nRaw: {raw[:500]}")
        raise HTTPException(status_code=500, detail="AI 응답을 파싱하지 못했어요.")

    # 기존 내일 스케줄 삭제 또는 요일에서 제거
    for s in tomorrow_schedules:
        days = [d.strip() for d in s.days_of_week.split(',') if d.strip() != str(tomorrow_idx)]
        if not days:
            db.delete(s)
        else:
            s.days_of_week = ','.join(days)

    valid_colors = {
        "#FFB74D", "#4CAF7D", "#AB77E8", "#6B9BF2",
        "#5BB7C0", "#E57373", "#26C6DA", "#AED581", "#FF8A65",
    }

    created = 0
    for item in items:
        try:
            color = item.get("color", "#4CAF7D")
            if color not in valid_colors:
                color = "#4CAF7D"
            db.add(Schedule(
                user_id=data.user_id,
                title=f"{item.get('emoji', '📋')} {item['name']}",
                scheduled_time=item["start"],
                end_time=item.get("end"),
                color=color,
                days_of_week=str(tomorrow_idx),
                is_active=True,
            ))
            created += 1
        except (KeyError, ValueError):
            continue

    db.commit()
    return {"ok": True, "created": created, "tomorrow_day": tomorrow_idx}


# ── 회원가입 중 사용 (user_id 없음) ───────────────────────────────────────────

class FixedScheduleItem(BaseModel):
    name: str
    time: str        # "HH:MM"
    days: list[int]  # 0=월~6=일, 빈 리스트=매일


class OnboardingRequest(BaseModel):
    name: str
    age: str = ""
    gender: str = ""
    disability_type: str
    disability_level: str = ""
    occupation: str = ""
    likes: list[str] = []
    dislikes: list[str] = []
    daily_life: str = ""
    problem_notes: str = ""
    wake_time: str = ""
    sleep_time: str = ""
    breakfast_time: str = ""
    lunch_time: str = ""
    dinner_time: str = ""
    wash_times: list[str] = []
    medication_times: list[str] = []
    fixed_schedules: list[FixedScheduleItem] = []


@router.post("/suggest-schedule-onboarding")
def suggest_schedule_onboarding(data: OnboardingRequest):
    """회원가입 시 인적사항 기반 AI 시간표 추천 (user_id 불필요)"""
    disability_map = {"intellectual": "지적장애", "autism": "자폐스펙트럼장애"}
    level_map = {"mild": "경도 (혼자 할 수 있음)", "moderate": "중도 (도움 필요)", "severe": "고도 (많은 도움 필요)"}
    gender_map = {"male": "남성", "female": "여성"}

    disability = disability_map.get(data.disability_type, data.disability_type)
    level = level_map.get(data.disability_level, data.disability_level) if data.disability_level else "미입력"
    gender = gender_map.get(data.gender, data.gender)
    likes_str = ", ".join(data.likes) if data.likes else "없음"
    dislikes_str = ", ".join(data.dislikes) if data.dislikes else "없음"
    occupation_str = data.occupation if data.occupation else "없음"
    age_str = f"{data.age}세" if data.age else "나이 미입력"
    daily_life_str = data.daily_life if data.daily_life else "없음"
    problem_notes_str = data.problem_notes if data.problem_notes else "없음"

    schedule_lines = []
    if data.wake_time:
        schedule_lines.append(f"  - 기상 시간: {data.wake_time}")
    if data.breakfast_time:
        schedule_lines.append(f"  - 아침 식사: {data.breakfast_time}")
    if data.lunch_time:
        schedule_lines.append(f"  - 점심 식사: {data.lunch_time}")
    if data.dinner_time:
        schedule_lines.append(f"  - 저녁 식사: {data.dinner_time}")
    if data.wash_times:
        schedule_lines.append(f"  - 씻기·세면: {', '.join(data.wash_times)}")
    if data.medication_times:
        schedule_lines.append(f"  - 약 복용: {', '.join(data.medication_times)}")
    if data.sleep_time:
        schedule_lines.append(f"  - 취침 시간: {data.sleep_time} (취침 준비는 이 시간 1시간 전부터 시작, 이 시간이 취침 블록의 종료 시간)")
    schedule_str = "\n".join(schedule_lines) if schedule_lines else "  - 별도 지정 없음"

    # 고정 일과 텍스트 생성
    DAY_KO = ["월", "화", "수", "목", "금", "토", "일"]
    fixed_lines = []
    for fs in data.fixed_schedules:
        day_str = "매일" if not fs.days else "/".join(DAY_KO[d] for d in sorted(fs.days))
        fixed_lines.append(f"  - {fs.name}: {fs.time} ({day_str})")
    fixed_str = "\n".join(fixed_lines) if fixed_lines else "  - 없음"

    # 장애 유형×정도별 스케줄 설계 원칙
    if data.disability_type == "intellectual" and data.disability_level == "mild":
        design_rule = "블록당 30~60분, 하루 8~10개, 자유시간 2개 이상 포함"
    elif data.disability_type == "intellectual" and data.disability_level == "moderate":
        design_rule = "블록당 20~40분, 하루 6~8개, 활동 사이 10분 휴식 블록 필수, 단순하고 익숙한 루틴 중심"
    elif data.disability_type == "autism" and data.disability_level == "mild":
        design_rule = "블록당 30~60분, 예측 가능한 순서 유지, 갑작스러운 전환 최소화, 같은 패턴 반복"
    elif data.disability_type == "autism":
        design_rule = "블록당 20~30분, 하루 5~7개, 동일 시간 동일 활동 반복, 감각 자극 강한 활동 금지"
    else:
        design_rule = "블록당 30~60분, 하루 8개 내외, 규칙적이고 예측 가능한 루틴"

    # 직업 유형별 주중 고정 시간 규칙
    work_rule = ""
    if occupation_str and occupation_str != "없음":
        work_rule = f"\n- 직업({occupation_str})이 있으므로 주중에는 출근/업무 시간을 반드시 포함하세요."

    base_info = f"""[당사자 정보]
이름: {data.name} / 나이: {age_str} / 성별: {gender}
장애: {disability} {level}
직업/활동: {occupation_str}
좋아하는 것: {likes_str}
힘든 것·싫어하는 것: {dislikes_str}
취미/일상: {daily_life_str}
특이사항: {problem_notes_str}

[매일 동일하게 지켜야 할 기본 시간]
{schedule_str}

[고정 일과 - 절대 변경·삭제 금지]
{fixed_str}

[설계 원칙]
- {design_rule}{work_rule}
- 기상·식사·취침 시간은 주중/주말 모두 동일하게 유지할 것
- "자유 시간", "자율 활동" 같은 모호한 이름 금지 → 좋아하는 것({likes_str})을 반영한 구체적 활동명 사용
- 같은 활동(식사, 기상 등)은 매일 정확히 같은 시간에 배치할 것"""

    DAY_NAMES = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"]
    valid_colors = {
        "#FFB74D", "#4CAF7D", "#AB77E8", "#6B9BF2",
        "#5BB7C0", "#E57373", "#26C6DA", "#AED581", "#FF8A65",
    }

    groq_client = OpenAI(
        base_url="https://api.groq.com/openai/v1",
        api_key=os.getenv("GROQ_API_KEY"),
    )
    all_blocks = []

    def generate_day(day_idx: int) -> list:
        day_name = DAY_NAMES[day_idx]
        day_type = "주말" if day_idx >= 5 else "주중"
        prompt = f"""{base_info}

위 정보를 바탕으로 {day_name}({day_type}) 하루 시간표를 JSON으로 만들어주세요.
JSON 배열만 출력하세요. 다른 설명 없이:
[
  {{"day": {day_idx}, "start": "07:00", "end": "07:30", "name": "기상·세면", "emoji": "🌅", "color": "#FFB74D"}},
  ...
]
규칙:
- 모든 name(일과 이름)은 반드시 한국어로만 작성하세요. 영어·러시아어 등 외국어 절대 금지.
- start/end: HH:MM 형식, 06:00~22:00 범위
- color: "#FFB74D" "#4CAF7D" "#AB77E8" "#6B9BF2" "#5BB7C0" "#E57373" "#26C6DA" "#AED581" "#FF8A65" 중 하나
- 같은 종류의 활동(예: 아침 식사)은 다른 요일과 동일한 색 사용"""
        try:
            response = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=2000,
            )
            raw = response.choices[0].message.content or ""
            items = json.loads(_clean_json(raw))
            blocks = []
            for item in items:
                try:
                    ss = _to_slot(item["start"])
                    es = _to_slot(item["end"])
                    if ss < 0 or ss >= TOTAL_SLOTS or es <= ss:
                        continue
                    color = item.get("color", "#4CAF7D")
                    if color not in valid_colors:
                        color = "#4CAF7D"
                    blocks.append({
                        "day": day_idx,
                        "startSlot": ss,
                        "endSlot": min(es, TOTAL_SLOTS),
                        "name": item["name"],
                        "emoji": item.get("emoji", "📋"),
                        "color": color,
                    })
                except (KeyError, ValueError):
                    continue
            return blocks
        except Exception as e:
            logger.error(f"LLM error day {day_idx}: {e}")
            return []

    # 일관성 보장: 주중 1개·주말 1개 템플릿만 생성 후 각 요일에 복제
    # (요일별 독립 생성 시 같은 활동이 요일마다 제각각 나오는 문제 방지)
    with ThreadPoolExecutor(max_workers=2) as executor:
        wd_future = executor.submit(generate_day, 0)  # 주중 대표 (월)
        we_future = executor.submit(generate_day, 5)  # 주말 대표 (토)
        wd_blocks = wd_future.result()
        we_blocks = we_future.result()

    for d in range(5):        # 월~금: 주중 템플릿 복제
        all_blocks.extend({**b, "day": d} for b in wd_blocks)
    for d in range(5, 7):     # 토~일: 주말 템플릿 복제
        all_blocks.extend({**b, "day": d} for b in we_blocks)

    if not all_blocks:
        raise HTTPException(status_code=500, detail="AI가 유효한 시간표를 생성하지 못했어요. 다시 시도해주세요.")

    # ── 후처리 ──────────────────────────────────────────────────────────────────
    import re
    from collections import Counter

    def _norm(name: str) -> str:
        return re.sub(r"\s+", "", name)

    # 1. 규칙적 루틴(기상·식사·씻기)을 모든 요일에 동일한 시각으로 강제 고정
    #    각 그룹은 여러 시각 가능(예: 씻기 아침·저녁) → 기존 매칭 블록 제거 후 지정 시각에 재생성
    routine_groups = []  # (slots, name, emoji, color, keywords)
    if data.wake_time:
        routine_groups.append(([_to_slot(data.wake_time)], "기상·세면", "🌅", "#FFB74D", ("기상", "일어", "세면")))
    if data.breakfast_time:
        routine_groups.append(([_to_slot(data.breakfast_time)], "아침 식사", "🍚", "#4CAF7D", ("아침",)))
    if data.lunch_time:
        routine_groups.append(([_to_slot(data.lunch_time)], "점심 식사", "🍱", "#26C6DA", ("점심",)))
    if data.dinner_time:
        routine_groups.append(([_to_slot(data.dinner_time)], "저녁 식사", "🍽️", "#FF8A65", ("저녁",)))
    if data.wash_times:
        routine_groups.append(([_to_slot(w) for w in data.wash_times], "씻기·세면", "🛁", "#5BB7C0", ("씻", "세면", "목욕", "샤워")))

    for day_idx in range(7):
        for slots, rname, remoji, rcolor, kws in routine_groups:
            # 이 요일에서 해당 루틴 키워드를 포함한 기존 블록 모두 제거
            all_blocks = [
                b for b in all_blocks
                if not (b["day"] == day_idx and any(k in b["name"] for k in kws))
            ]
            # 지정된 각 시각에 표준 블록 생성
            for slot in slots:
                if 0 <= slot < TOTAL_SLOTS:
                    all_blocks.append({
                        "day": day_idx, "startSlot": slot, "endSlot": min(slot + 1, TOTAL_SLOTS),
                        "name": rname, "emoji": remoji, "color": rcolor,
                    })

    # 2. 같은 활동명(공백 무시) → 같은 색·이모지로 통일
    norm_color: dict = {}
    norm_emoji: dict = {}
    for block in all_blocks:
        key = _norm(block["name"])
        norm_color.setdefault(key, Counter())[block["color"]] += 1
        norm_emoji.setdefault(key, Counter())[block["emoji"]] += 1
    best_color = {k: cnt.most_common(1)[0][0] for k, cnt in norm_color.items()}
    best_emoji = {k: cnt.most_common(1)[0][0] for k, cnt in norm_emoji.items()}
    for block in all_blocks:
        key = _norm(block["name"])
        block["color"] = best_color[key]
        block["emoji"] = best_emoji[key]

    # 3. 취침 블록 자동 추가 (기상 전, 취침 후)
    if data.wake_time or data.sleep_time:
        for day_idx in range(7):
            if data.wake_time:
                wake_slot = _to_slot(data.wake_time)
                if wake_slot > 0:
                    all_blocks.append({
                        "day": day_idx, "startSlot": 0, "endSlot": wake_slot,
                        "name": "취침", "emoji": "😴", "color": "#AED581",
                    })
            if data.sleep_time:
                sleep_slot = _to_slot(data.sleep_time)
                if sleep_slot < TOTAL_SLOTS:
                    all_blocks.append({
                        "day": day_idx, "startSlot": sleep_slot, "endSlot": TOTAL_SLOTS,
                        "name": "취침", "emoji": "😴", "color": "#AED581",
                    })

    return {"blocks": all_blocks}
