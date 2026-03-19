"""
Tool 3: 단계별 피드백 방식 Tool
- Detect Tool에 의해 호출
- 사용자 상태(단계)에 맞는 피드백 메시지/행동 반환
- 장애 종류/정도에 따라 다른 피드백 전략 사용
"""
from models.database import SessionLocal, User, BehaviorLog, FeedbackStage, DisabilityType, DisabilityLevel
from datetime import datetime
from typing import Any


TOOL_DEFINITION = {
    "type": "function",
    "function": {
        "name": "provide_feedback",
        "description": (
            "사용자의 현재 상태(단계)에 맞는 피드백을 제공한다. "
            "Detect Tool이 호출한 후 연속으로 호출된다."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "user_id": {
                    "type": "integer",
                    "description": "사용자 ID"
                },
                "stage": {
                    "type": "string",
                    "enum": ["stage_1", "stage_2", "stage_3"],
                    "description": (
                        "피드백 단계. "
                        "stage_1=사전신호(거부), "
                        "stage_2=문제행동 중(소리지르기/과격), "
                        "stage_3=진정 후"
                    )
                },
                "behavior_log_id": {
                    "type": "integer",
                    "description": "연관된 BehaviorLog ID (선택)"
                },
                "schedule_title": {
                    "type": "string",
                    "description": "현재 수행 중인 스케줄 이름 (선택)"
                }
            },
            "required": ["user_id", "stage"]
        }
    }
}


def _get_stage1_feedback(user: User, schedule_title: str = None) -> dict:
    """1단계: 사전 신호 감지 시 피드백"""
    task = schedule_title or "지금 할 일"

    if user.disability_type == DisabilityType.AUTISM:
        # 자폐: 구체적 선택지 + AAC 버튼
        return {
            "message": f"지금 할까요, 3분 뒤에 할까요?",
            "choices": ["지금 할게요", "3분 뒤에 할게요"],
            "aac_buttons": ["쉬고 싶어요", "도와주세요", "싫어요"],
            "task_breakdown": f"{task}의 첫 번째 단계만 해볼까요?",
            "tone": "calm_simple"
        }
    elif user.disability_level == DisabilityLevel.MILD:
        # 경도 지적장애: 음성 + 선택지
        return {
            "message": f"{task}, 지금 할까요? 아니면 잠깐 쉬고 할까요?",
            "choices": ["지금 할게요", "잠깐 쉴게요"],
            "aac_buttons": ["쉬고 싶어요", "도와주세요"],
            "tone": "warm_voice"
        }
    else:
        # 중도: 매우 단순한 메시지
        return {
            "message": f"{task} 할 시간이에요.",
            "choices": ["네", "잠깐만요"],
            "aac_buttons": ["싫어요", "도와주세요"],
            "tone": "simple"
        }


def _get_stage2_feedback(user: User) -> dict:
    """2단계: 문제 행동 중 피드백"""
    return {
        "message": "괜찮아요. 잠깐 쉬어요.",
        "tone": "low_steady",           # 낮고 일정한 톤
        "action": "redirect_behavior",  # 다른 행동으로 전환 유도
        "redirect_suggestion": "좋아하는 것을 잠깐 해볼까요?",
        "notify_guardian": True         # 보호자에게 연락
    }


def _get_stage3_feedback(user: User) -> dict:
    """3단계: 진정 후 피드백"""
    return {
        "message": "다친 곳은 없나요?",
        "followup_delay_minutes": 60,   # 1시간 뒤 대화
        "followup_message": "아까 어떤 기분이었는지 이야기해볼까요?",
        "questions": [
            "오늘 힘든 게 있었나요?",
            "무엇 때문에 힘들었나요?",
            "다음엔 어떻게 하면 좋을까요?"
        ],
        "tone": "gentle",
        "learn_tendency": True          # 사용자 성향 학습 플래그
    }


def provide_feedback(
    user_id: int,
    stage: str,
    behavior_log_id: int = None,
    schedule_title: str = None
) -> dict[str, Any]:
    """단계별 피드백 실행"""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return {"success": False, "error": f"user_id={user_id} 를 찾을 수 없습니다."}

        stage_enum = FeedbackStage(stage)

        if stage_enum == FeedbackStage.STAGE_1:
            feedback = _get_stage1_feedback(user, schedule_title)
        elif stage_enum == FeedbackStage.STAGE_2:
            feedback = _get_stage2_feedback(user)
        else:
            feedback = _get_stage3_feedback(user)

        # BehaviorLog에 AI 응답 기록
        if behavior_log_id:
            log = db.query(BehaviorLog).filter(BehaviorLog.id == behavior_log_id).first()
            if log:
                log.ai_response = feedback.get("message", "")
                if feedback.get("notify_guardian"):
                    log.guardian_notified = True
                db.commit()

        return {
            "success": True,
            "user_id": user_id,
            "stage": stage,
            "feedback_mode": user.feedback_mode,
            **feedback
        }
    finally:
        db.close()
