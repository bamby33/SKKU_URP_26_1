"""
Tool 2: 스케줄 달성 확인 Tool
- 스케줄 달성 여부를 확인하고 기록
- 달성/미달성 결과를 반환 → 메시지 발신 Tool 또는 피드백 Tool로 연결
"""
from models.database import SessionLocal, Schedule, ScheduleLog, ScheduleStatus
from services.achievement import upsert_log, today_achievement
from typing import Any


TOOL_DEFINITION = {
    "type": "function",
    "function": {
        "name": "check_schedule",
        "description": (
            "특정 스케줄의 달성 여부를 확인하고 DB에 기록한다. "
            "스케줄 공지 후 사용자 응답을 바탕으로 호출된다."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "schedule_id": {
                    "type": "integer",
                    "description": "확인할 스케줄 ID"
                },
                "achieved": {
                    "type": "boolean",
                    "description": "스케줄 달성 여부 (true=달성, false=미달성)"
                },
                "note": {
                    "type": "string",
                    "description": "미달성 시 이유 또는 메모 (선택)"
                }
            },
            "required": ["schedule_id", "achieved"]
        }
    }
}


def check_schedule(schedule_id: int, achieved: bool, note: str = None, is_refusal: bool = False) -> dict[str, Any]:
    """스케줄 달성 확인 및 기록"""
    db = SessionLocal()
    try:
        schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
        if not schedule:
            return {"success": False, "error": f"schedule_id={schedule_id} 를 찾을 수 없습니다."}

        # 중복 방지: 오늘 그 일과 로그를 upsert (안했어요면 거부 횟수 +1)
        log = upsert_log(schedule, achieved, note, db, count_refusal=is_refusal)
        db.commit()
        refusal_count = log.refusal_count or 0

        # 오늘 달성률 (단일 정의: 오늘 일과 중 최신 로그 achieved / 오늘 일과 수)
        ach = today_achievement(schedule.user_id, db)

        return {
            "success": True,
            "schedule_id": schedule_id,
            "schedule_title": schedule.title,
            "user_id": schedule.user_id,
            "achieved": achieved,
            "note": note,
            "refusal_count": refusal_count,
            "today_achievement_rate": ach["rate"],
            "notify_guardian": True   # 메시지 발신 Tool로 연결 신호
        }
    finally:
        db.close()
