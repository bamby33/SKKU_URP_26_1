"""AI 시간표 추천 API"""
import json
import os
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from groq import Groq
from dotenv import load_dotenv
from models.database import get_db, User, Schedule, ScheduleLog, ScheduleStatus, BehaviorLog, FeedbackStage
from datetime import datetime, timedelta

load_dotenv()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])

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
  {{"day": 0, "start": "07:00", "end": "07:30", "name": "기상·세면", "emoji": "🌅", "color": "#FFB74D"}},
  ...
]

규칙:
- day: 0=월 1=화 2=수 3=목 4=금 5=토 6=일
- start/end: "HH:MM" 형식, 06:00~22:00 범위
- emoji: 일과를 가장 잘 표현하는 이모지 하나
- color: 반드시 이 중 하나 선택 "#FFB74D" "#4CAF7D" "#AB77E8" "#6B9BF2" "#5BB7C0" "#E57373" "#26C6DA" "#AED581" "#FF8A65"
"""

    try:
        groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        response = groq_client.chat.completions.create(
            model=os.getenv("GROQ_SCHEDULE_MODEL", "llama-3.1-8b-instant"),
            messages=[{"role": "user", "content": prompt}],
            max_tokens=4096,
        )
        raw = response.choices[0].message.content or ""
    except Exception as e:
        logger.error(f"Groq API error: {e}")
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
            blocks.append({
                "day": int(item["day"]),
                "startSlot": ss,
                "endSlot": min(es, TOTAL_SLOTS),
                "name": item["name"],
                "emoji": item.get("emoji", "📋"),
                "color": color,
            })
        except (KeyError, ValueError):
            continue

    if not blocks:
        raise HTTPException(status_code=500, detail="AI가 유효한 시간표를 생성하지 못했어요. 다시 시도해주세요.")

    return {"blocks": blocks}


# ── 회원가입 중 사용 (user_id 없음) ───────────────────────────────────────────

class OnboardingRequest(BaseModel):
    name: str
    age: str = ""
    gender: str = ""
    disability_type: str
    occupation: str = ""
    likes: list[str] = []
    dislikes: list[str] = []
    daily_life: str = ""
    wake_time: str = ""
    sleep_time: str = ""
    breakfast_time: str = ""
    lunch_time: str = ""
    dinner_time: str = ""
    medication_times: list[str] = []


@router.post("/suggest-schedule-onboarding")
def suggest_schedule_onboarding(data: OnboardingRequest):
    """회원가입 시 인적사항 기반 AI 시간표 추천 (user_id 불필요)"""
    disability_map = {"intellectual": "지적장애", "autism": "자폐스펙트럼장애"}
    gender_map = {"male": "남성", "female": "여성"}

    disability = disability_map.get(data.disability_type, data.disability_type)
    gender = gender_map.get(data.gender, data.gender)
    likes_str = ", ".join(data.likes) if data.likes else "없음"
    dislikes_str = ", ".join(data.dislikes) if data.dislikes else "없음"
    occupation_str = data.occupation if data.occupation else "없음"
    age_str = f"{data.age}세" if data.age else "나이 미입력"
    daily_life_str = data.daily_life if data.daily_life else "없음"

    schedule_lines = []
    if data.wake_time:
        schedule_lines.append(f"  - 기상 시간: {data.wake_time}")
    if data.breakfast_time:
        schedule_lines.append(f"  - 아침 식사: {data.breakfast_time}")
    if data.lunch_time:
        schedule_lines.append(f"  - 점심 식사: {data.lunch_time}")
    if data.dinner_time:
        schedule_lines.append(f"  - 저녁 식사: {data.dinner_time}")
    if data.medication_times:
        schedule_lines.append(f"  - 약 복용: {', '.join(data.medication_times)}")
    if data.sleep_time:
        schedule_lines.append(f"  - 취침 시간: {data.sleep_time} (취침 준비는 이 시간 1시간 전부터 시작, 이 시간이 취침 블록의 종료 시간)")
    schedule_str = "\n".join(schedule_lines) if schedule_lines else "  - 별도 지정 없음"

    prompt = f"""다음 발달장애인을 위한 일주일 생활 시간표를 추천해주세요.

사용자 정보:
- 이름: {data.name}
- 나이: {age_str}
- 성별: {gender}
- 장애 유형: {disability}
- 하는 일: {occupation_str}
- 좋아하는 것: {likes_str}
- 싫어하는 것 / 힘든 것: {dislikes_str}
- 취미 및 일상: {daily_life_str}

기본 시간 정보 (반드시 이 시간을 기준으로 시간표를 구성하세요):
{schedule_str}

요구사항:
- 발달장애인에게 적합한 규칙적이고 예측 가능한 시간표
- 반복되는 일상 루틴 강조 (기상, 식사, 취침 등)
- 위의 기본 시간 정보를 정확하게 반영하세요 (기상·취침·식사 시간 준수)
- 약 복용 시간이 있다면 반드시 포함하세요
- 하는 일(직장/시설/학교 등)이 있다면 주중 스케줄에 반영
- 좋아하는 활동과 취미를 여가 시간에 반영
- 싫어하는 것은 피하거나 최소화
- 주중(월~금)과 주말(토~일) 패턴 구분
- 하루 8~10개 항목

아래 JSON 배열 형식으로만 응답하세요. 다른 설명은 절대 포함하지 마세요:
[
  {{"day": 0, "start": "07:00", "end": "07:30", "name": "기상·세면", "emoji": "🌅", "color": "#FFB74D"}},
  ...
]

규칙:
- day: 0=월 1=화 2=수 3=목 4=금 5=토 6=일
- start/end: "HH:MM" 형식, 06:00~22:00 범위
- emoji: 일과를 가장 잘 표현하는 이모지 하나
- color: 반드시 이 중 하나 선택 "#FFB74D" "#4CAF7D" "#AB77E8" "#6B9BF2" "#5BB7C0" "#E57373" "#26C6DA" "#AED581" "#FF8A65"
"""

    try:
        groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        response = groq_client.chat.completions.create(
            model=os.getenv("GROQ_SCHEDULE_MODEL", "llama-3.1-8b-instant"),
            messages=[{"role": "user", "content": prompt}],
            max_tokens=4096,
        )
        raw = response.choices[0].message.content or ""
    except Exception as e:
        logger.error(f"Groq API error (onboarding): {e}")
        raise HTTPException(status_code=503, detail=f"AI 서비스 오류: {str(e)}")

    try:
        cleaned = _clean_json(raw)
        items = json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error (onboarding): {e}\nRaw: {raw[:500]}")
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
            blocks.append({
                "day": int(item["day"]),
                "startSlot": ss,
                "endSlot": min(es, TOTAL_SLOTS),
                "name": item["name"],
                "emoji": item.get("emoji", "📋"),
                "color": color,
            })
        except (KeyError, ValueError):
            continue

    if not blocks:
        raise HTTPException(status_code=500, detail="AI가 유효한 시간표를 생성하지 못했어요. 다시 시도해주세요.")

    return {"blocks": blocks}
