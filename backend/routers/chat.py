"""AI 대화 API (REST + WebSocket)"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from models.database import get_db, ChatMessage, User
from agents.care_agent import chat as agent_chat
from datetime import datetime
import json

router = APIRouter(prefix="/chat", tags=["chat"])


# ── Schemas ────────────────────────────────────────────────────────────────────

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

    # AI 에이전트 호출
    try:
        result = agent_chat(
            user_id=data.user_id,
            message=data.message,
            history=history,
            context=data.context,
            user_profile=user_profile,
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


@router.post("/schedule-followup/{user_id}")
def schedule_followup(user_id: int, db: Session = Depends(get_db)):
    """stage_3 진정 후 60분 뒤 followup 메시지 예약"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    from scheduler.jobs import schedule_stage3_followup
    schedule_stage3_followup(user_id, delay_minutes=60)
    return {"success": True, "message": "60분 후 followup 예약 완료"}


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
