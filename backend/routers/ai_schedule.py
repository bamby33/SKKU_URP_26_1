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
- start/end: "HH:MM" 형식, 06:00~22:00 범위
- emoji: 일과를 가장 잘 표현하는 이모지 하나
- color: 반드시 이 중 하나 선택 "#FFB74D" "#4CAF7D" "#AB77E8" "#6B9BF2" "#5BB7C0" "#E57373" "#26C6DA" "#AED581" "#FF8A65"
"""

    try:
        groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        response = groq_client.chat.completions.create(
            model=os.getenv("GROQ_SCHEDULE_MODEL", "llama-3.1-8b-instant"),
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

    base_info = f"""당사자: {data.name}({age_str}, {gender}), {disability} {level}
하는 일: {occupation_str} / 좋아함: {likes_str} / 힘듦: {dislikes_str}
기본 시간: {schedule_str}
고정 일과: {fixed_str}
설계 원칙: {design_rule}"""

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

위 정보를 바탕으로 {day_name}({day_type}) 하루 시간표만 JSON으로 만들어주세요.
JSON 배열만 출력하세요. 설명 없이:
[
  {{"day": {day_idx}, "start": "07:00", "end": "07:30", "name": "기상·세면", "emoji": "🌅", "color": "#FFB74D"}},
  ...
]
규칙: start/end는 HH:MM(06:00~22:00), color는 "#FFB74D" "#4CAF7D" "#AB77E8" "#6B9BF2" "#5BB7C0" "#E57373" "#26C6DA" "#AED581" "#FF8A65" 중 하나."""
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

    with ThreadPoolExecutor(max_workers=7) as executor:
        futures = {executor.submit(generate_day, i): i for i in range(7)}
        for future in as_completed(futures):
            all_blocks.extend(future.result())

    if not all_blocks:
        raise HTTPException(status_code=500, detail="AI가 유효한 시간표를 생성하지 못했어요. 다시 시도해주세요.")

    return {"blocks": all_blocks}
