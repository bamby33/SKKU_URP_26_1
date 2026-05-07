"""AI 대화 API (REST + WebSocket)"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from models.database import get_db, ChatMessage, User, BehaviorLog, FeedbackStage
from agents.care_agent import chat as agent_chat
from datetime import datetime, date, timedelta
import json

router = APIRouter(prefix="/chat", tags=["chat"])


def _build_behavior_context(logs: list) -> str:
    """최근 7일 행동 로그를 AI 프롬프트용 텍스트로 요약"""
    if not logs:
        return ""

    today = date.today()
    today_logs = [l for l in logs if l.logged_at.date() == today]

    s1 = sum(1 for l in logs if l.stage == FeedbackStage.STAGE_1)
    s2 = sum(1 for l in logs if l.stage == FeedbackStage.STAGE_2)
    s3 = sum(1 for l in logs if l.stage == FeedbackStage.STAGE_3)
    t1_today = sum(1 for l in today_logs if l.stage == FeedbackStage.STAGE_1)
    t2_today = sum(1 for l in today_logs if l.stage == FeedbackStage.STAGE_2)

    # 자주 나타나는 트리거 top-2
    from collections import Counter
    triggers = [l.trigger for l in logs if l.trigger]
    top_triggers = [t for t, _ in Counter(triggers).most_common(2)]

    recent_lines = "\n".join(
        f"  - {l.logged_at.strftime('%m/%d %H:%M')} {l.stage.value} (원인: {l.trigger or '미상'})"
        for l in logs[:5]
    )

    return f"""
[행동 패턴 기록 (최근 7일)]
오늘 발생: 1단계 {t1_today}건 / 2단계 {t2_today}건
7일 누계: 1단계 {s1}건 / 2단계 {s2}건 / 진정(3단계) {s3}건
주요 원인: {', '.join(top_triggers) if top_triggers else '없음'}
최근 기록:
{recent_lines}
이 정보를 바탕으로 오늘 사용자의 상태를 파악하고 선제적으로 공감하며 대화하세요.
"""


# ── Schemas ────────────────────────────────────────────────────────────────────

class BehaviorLogRequest(BaseModel):
    stage: str                    # "stage_1" | "stage_2" | "stage_3"
    trigger: Optional[str] = None # "voice_decibel" | "text_refusal" | "manual" 등
    decibel: Optional[float] = None

class ChatRequest(BaseModel):
    user_id: int
    message: str
    context: dict | None = None   # {"decibel": 80, "gps_moved": False}


class ChatResponse(BaseModel):
    reply: str
    tool_calls: list
    stage: str | None
    feedback: dict | None = None


# ── REST endpoint ──────────────────────────────────────────────────────────────

@router.post("/", response_model=ChatResponse)
def send_message(data: ChatRequest, db: Session = Depends(get_db)):
    """AI와 대화 (단일 메시지)"""
    user = db.query(User).filter(User.id == data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    # 최근 대화 기록 로드 (최대 10개)
    history_rows = db.query(ChatMessage).filter(
        ChatMessage.user_id == data.user_id
    ).order_by(ChatMessage.created_at.desc()).limit(10).all()

    history = [
        {"role": row.role, "content": row.content}
        for row in reversed(history_rows)
    ]

    # 사용자 프로필 구성
    user_profile = {
        "name": user.name,
        "disability_type": user.disability_type.value if user.disability_type else None,
        "disability_level": user.disability_level.value if user.disability_level else None,
        "special_notes": user.special_notes or "",
        "feedback_mode": user.feedback_mode or "voice",
    }

    # 최근 7일 행동 로그 → 패턴 요약
    seven_days_ago = datetime.now() - timedelta(days=7)
    behavior_logs = db.query(BehaviorLog).filter(
        BehaviorLog.user_id == data.user_id,
        BehaviorLog.logged_at >= seven_days_ago,
    ).order_by(BehaviorLog.logged_at.desc()).limit(20).all()
    behavior_context = _build_behavior_context(behavior_logs)

    # AI 에이전트 호출
    try:
        result = agent_chat(
            user_id=data.user_id,
            message=data.message,
            history=history,
            context=data.context,
            user_profile=user_profile,
            behavior_context=behavior_context,
        )
    except Exception as e:
        err = str(e)
        if "429" in err or "RESOURCE_EXHAUSTED" in err:
            result = {"reply": "잠깐만요, AI가 잠시 바빠요. 조금 뒤에 다시 말해주세요 😊", "tool_calls": [], "stage": None, "feedback": None}
        elif "503" in err or "UNAVAILABLE" in err:
            result = {"reply": "AI 서버가 잠시 불안정해요. 곧 다시 연결할게요 😊", "tool_calls": [], "stage": None, "feedback": None}
        else:
            raise

    # 대화 기록 저장
    db.add(ChatMessage(user_id=data.user_id, role="user", content=data.message))
    if result["reply"]:
        db.add(ChatMessage(user_id=data.user_id, role="assistant", content=result["reply"]))
    db.commit()

    return result


@router.post("/log-behavior/{user_id}")
def log_behavior(user_id: int, data: BehaviorLogRequest, db: Session = Depends(get_db)):
    """행동 로그 직접 저장 — AI tool 우회, 신뢰성 보장"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    stage_map = {
        "stage_1": FeedbackStage.STAGE_1,
        "stage_2": FeedbackStage.STAGE_2,
        "stage_3": FeedbackStage.STAGE_3,
    }
    stage_enum = stage_map.get(data.stage)
    if not stage_enum:
        raise HTTPException(status_code=400, detail="stage는 stage_1~3 중 하나여야 합니다.")

    log = BehaviorLog(
        user_id=user_id,
        stage=stage_enum,
        trigger=data.trigger or "direct",
        decibel_level=data.decibel,
        logged_at=datetime.utcnow(),
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    # stage_2: 보호자에게 자동 긴급 알림
    if data.stage == "stage_2":
        from agents.tools.messaging import send_message
        send_message(
            user_id=user_id,
            message_type="emergency",
            extra_info=f"음성 데시벨 감지{f': {data.decibel:.0f}dB' if data.decibel else ''}",
        )

    return {"success": True, "log_id": log.id, "stage": data.stage}


@router.post("/schedule-followup/{user_id}")
def schedule_followup(user_id: int, db: Session = Depends(get_db)):
    """stage_3 진정 후 60분 뒤 followup 메시지 예약"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    from scheduler.jobs import schedule_stage3_followup
    schedule_stage3_followup(user_id, delay_minutes=60)
    return {"success": True, "message": "60분 후 followup 예약 완료"}


class BehaviorNoteRequest(BaseModel):
    note: str


@router.post("/save-behavior-note/{user_id}")
def save_behavior_note(user_id: int, data: BehaviorNoteRequest, db: Session = Depends(get_db)):
    """행동 팔로업 대화에서 파악한 원인을 가장 최근 BehaviorLog에 저장"""
    log = db.query(BehaviorLog).filter(
        BehaviorLog.user_id == user_id
    ).order_by(BehaviorLog.logged_at.desc()).first()
    if log:
        log.note = data.note
        db.commit()
    return {"success": True}


@router.get("/history/{user_id}")
def get_history(user_id: int, limit: int = 20, db: Session = Depends(get_db)):
    """대화 기록 조회"""
    messages = db.query(ChatMessage).filter(
        ChatMessage.user_id == user_id
    ).order_by(ChatMessage.created_at.desc()).limit(limit).all()
    return list(reversed(messages))


# ── WebSocket endpoint ─────────────────────────────────────────────────────────

@router.websocket("/ws/{user_id}")
async def websocket_chat(websocket: WebSocket, user_id: int):
    """실시간 대화 WebSocket"""
    await websocket.accept()
    db = next(get_db())
    history = []

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            message = data.get("message", "")
            context = data.get("context")

            result = agent_chat(
                user_id=user_id,
                message=message,
                history=history,
                context=context
            )

            # 대화 기록 업데이트
            history.append({"role": "user", "content": message})
            if result["reply"]:
                history.append({"role": "assistant", "content": result["reply"]})

            # DB 저장
            db.add(ChatMessage(user_id=user_id, role="user", content=message))
            if result["reply"]:
                db.add(ChatMessage(user_id=user_id, role="assistant", content=result["reply"]))
            db.commit()

            await websocket.send_json(result)

    except WebSocketDisconnect:
        pass
    finally:
        db.close()
