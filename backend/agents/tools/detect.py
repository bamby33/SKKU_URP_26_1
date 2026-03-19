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
                "user_id": {
                    "type": "integer",
                    "description": "사용자 ID"
                },
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
            "required": ["user_id"]
        }
    }
}

# 데시벨 임계값
DB_CALM = 50       # 평온
DB_ALERT = 70      # 주의 (1단계 피드백)
DB_AGITATED = 85   # 흥분 (2단계 피드백)


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

        # 1. 음성 데시벨 분석
        if decibel is not None:
            if decibel >= DB_AGITATED:
                state = "agitated"
                feedback_stage = FeedbackStage.STAGE_2
                trigger.append(f"voice:{decibel}dB")
            elif decibel >= DB_ALERT:
                state = "alert"
                feedback_stage = FeedbackStage.STAGE_1
                trigger.append(f"voice:{decibel}dB")

        # 2. 텍스트 거부 표현 감지 (간단 키워드)
        refusal_keywords = ["싫어", "싫다", "안해", "안 해", "하기 싫어", "못해"]
        if user_text and any(kw in user_text for kw in refusal_keywords):
            if feedback_stage is None:
                feedback_stage = FeedbackStage.STAGE_1
                state = "alert"
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
