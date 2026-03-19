"""
Tool 1: 사용자 개별화 Tool
- 사용자 정보(장애 종류/정도, 특이사항)를 바탕으로 스케줄표 구성
- AI 모델의 기본 피드백 전달 방식 결정
"""
from models.database import SessionLocal, User, Schedule, DisabilityType, DisabilityLevel
from typing import Any


TOOL_DEFINITION = {
    "type": "function",
    "function": {
        "name": "personalize_user",
        "description": (
            "사용자의 장애 종류, 정도, 특이사항을 기반으로 기본 스케줄표와 피드백 방식을 설정한다. "
            "보호자가 앱 초기 설정 시 호출된다."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "user_id": {
                    "type": "integer",
                    "description": "사용자 ID"
                },
                "feedback_mode": {
                    "type": "string",
                    "enum": ["auto", "text", "voice", "button"],
                    "description": (
                        "피드백 전달 방식. "
                        "auto=AI 판단, text=문자, voice=음성, button=AAC 버튼"
                    )
                }
            },
            "required": ["user_id"]
        }
    }
}


def personalize_user(user_id: int, feedback_mode: str = "auto") -> dict[str, Any]:
    """사용자 개별화 실행 - 스케줄 및 피드백 방식 반환"""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return {"success": False, "error": f"user_id={user_id} 를 찾을 수 없습니다."}

        # 피드백 방식 자동 결정 (auto 모드)
        if feedback_mode == "auto":
            if user.disability_type == DisabilityType.AUTISM:
                feedback_mode = "button"   # 자폐: AAC 버튼 우선
            elif user.disability_level == DisabilityLevel.MILD:
                feedback_mode = "voice"    # 경도 지적장애: 음성
            else:
                feedback_mode = "text"     # 중도: 텍스트

        user.feedback_mode = feedback_mode
        db.commit()

        schedules = db.query(Schedule).filter(
            Schedule.user_id == user_id,
            Schedule.is_active == True
        ).all()

        return {
            "success": True,
            "user_id": user_id,
            "name": user.name,
            "disability_type": user.disability_type,
            "disability_level": user.disability_level,
            "special_notes": user.special_notes,
            "feedback_mode": feedback_mode,
            "schedules": [
                {"id": s.id, "title": s.title, "time": s.scheduled_time}
                for s in schedules
            ]
        }
    finally:
        db.close()
