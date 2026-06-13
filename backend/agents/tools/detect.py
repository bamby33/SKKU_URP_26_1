"""
Tool 4: 사용자 반응 Detect Tool  (Tool 3보다 먼저 정의 - Tool 3이 이를 참조)
- 음성 데시벨, GPS 이동 여부로 사용자 상태 감지
- 감지 결과에 따라 피드백 단계 결정 → 단계별 피드백 Tool 호출 신호 반환
"""
from models.database import SessionLocal, User, BehaviorLog, FeedbackStage
from datetime import datetime
from typing import Any


TOOL_DEFINITION = {
    "type": "function",
    "function": {
        "name": "detect_user_response",
        "description": (
            "사용자의 음성 데시벨 또는 GPS 이동 여부를 분석하여 현재 상태를 감지한다. "
            "스케줄 공지 후 또는 AI 대화 중 주기적으로 호출된다."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "decibel": {
                    "type": "number",
                    "description": "측정된 음성 데시벨 (휴대폰 마이크, dB 단위)"
                },
                "gps_moved": {
                    "type": "boolean",
                    "description": "GPS 기준 이동 여부 (스케줄 장소로 이동했는지)"
                },
                "user_text": {
                    "type": "string",
                    "description": "사용자가 텍스트로 입력한 내용 (선택)"
                }
            },
            "required": []
        }
    }
}

# 데시벨 임계값 — 이 이상이면 '높은 데시벨'(흥분) → stage_2 (프론트 DB_HIGH 와 동일)
DB_HIGH = 90


def detect_user_response(
    user_id: int,
    decibel: float = None,
    gps_moved: bool = None,
    user_text: str = None
) -> dict[str, Any]:
    """사용자 반응 감지 및 피드백 단계 결정"""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return {"success": False, "error": f"user_id={user_id} 를 찾을 수 없습니다."}

        state = "calm"
        feedback_stage = None
        trigger = []

        refuse_keywords = [
            "싫어", "싫다", "안해", "안 해", "하기 싫어", "하기 싫다", "하기 싫다고", "못해",
            "모르겠어", "몰라", "귀찮아", "안 할래", "그만해", "시끄러워", "하지 말라고", "짜증나", "저리 가",
        ]
        has_refuse = bool(user_text and any(kw in user_text for kw in refuse_keywords))
        high_db = decibel is not None and decibel >= DB_HIGH

        # 감지 기준
        #  stage_1 = 부정언어만 (소리 안 큼)
        #  stage_2 = 데시벨 높음 (말 유무 무관) or 부정언어 + 높은 데시벨
        if high_db:
            state = "agitated"
            feedback_stage = FeedbackStage.STAGE_2
            if has_refuse:
                trigger.append("text_refusal")
            trigger.append(f"voice:{decibel}dB")
        elif has_refuse:
            state = "alert"
            feedback_stage = FeedbackStage.STAGE_1
            trigger.append("text_refusal")

        # 3. GPS 미이동 = 스케줄 미달성 신호
        schedule_missed = False
        if gps_moved is False:
            schedule_missed = True
            trigger.append("gps_no_movement")

        # 문제 행동 로그 기록 (단계 감지된 경우)
        if feedback_stage:
            log = BehaviorLog(
                user_id=user_id,
                stage=feedback_stage,
                trigger=",".join(trigger),
                decibel_level=decibel,
                logged_at=datetime.utcnow()
            )
            db.add(log)
            db.commit()
            db.refresh(log)
            log_id = log.id
        else:
            log_id = None

        return {
            "success": True,
            "user_id": user_id,
            "state": state,                          # calm | alert | agitated
            "feedback_stage": feedback_stage,        # None | stage_1 | stage_2
            "schedule_missed": schedule_missed,
            "trigger": trigger,
            "behavior_log_id": log_id,
            "call_feedback_tool": feedback_stage is not None
        }
    finally:
        db.close()
