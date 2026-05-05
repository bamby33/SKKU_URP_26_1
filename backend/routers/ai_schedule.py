"""AI 시간표 추천 API"""
import json
import os
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from google import genai
from dotenv import load_dotenv
from models.database import get_db, User, Schedule

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


def _to_slot(hhmm: str) -> int:
    h, m = map(int, hhmm.split(":"))
    return (h - START_H) * 2 + round(m / 30)


def _clean_json(text: str) -> str:
    text = text.strip()
    if "```" in text:
        parts = text.split("```")
        for part in parts:
            part = part.strip()
            if part.startswith("json"):
                part = part[4:].strip()
            if part.startswith("["):
                return part
    if text.startswith("["):
        return text
    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end != -1:
        return text[start:end + 1]
    return text


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

    prompt = f"""다음 발달장애인을 위한 일주일 생활 시간표를 추천해주세요.

사용자 정보:
- 이름: {user.name}
- 장애 유형: {disability} ({level})
- 특이사항: {notes}
- 기존 일과 항목: {existing_str}

요구사항:
- 발달장애인에게 적합한 규칙적이고 예측 가능한 시간표
- 반복되는 일상 루틴 강조 (기상, 식사, 취침 등)
- 적당한 여가와 활동 포함
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

    api_key = os.getenv("GOOGLE_API_KEY")
    model_name = os.getenv("GEMMA_MODEL", "gemini-2.5-flash")

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(model=model_name, contents=prompt)
        raw = response.text
    except Exception as e:
        logger.error(f"Gemini API error: {e}")
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

    prompt = f"""다음 발달장애인을 위한 일주일 생활 시간표를 추천해주세요.

사용자 정보:
- 이름: {data.name}
- 나이: {age_str}
- 성별: {gender}
- 장애 유형: {disability}
- 하는 일: {occupation_str}
- 좋아하는 것: {likes_str}
- 싫어하는 것 / 힘든 것: {dislikes_str}

요구사항:
- 발달장애인에게 적합한 규칙적이고 예측 가능한 시간표
- 반복되는 일상 루틴 강조 (기상, 식사, 취침 등)
- 하는 일(직장/시설/학교 등)이 있다면 주중 스케줄에 반영
- 좋아하는 활동을 여가 시간에 반영
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

    api_key = os.getenv("GOOGLE_API_KEY")
    model_name = os.getenv("GEMMA_MODEL", "gemini-2.5-flash")

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(model=model_name, contents=prompt)
        raw = response.text
    except Exception as e:
        logger.error(f"Gemini API error (onboarding): {e}")
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
