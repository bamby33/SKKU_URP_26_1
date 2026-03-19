"""
Tool 2: 스케줄 달성 확인 Tool
- 스케줄 달성 여부를 확인하고 기록
- 달성/미달성 결과를 반환 → 메시지 발신 Tool 또는 피드백 Tool로 연결
"""
from models.database import SessionLocal, Schedule, ScheduleLog, ScheduleStatus
from datetime import datetime, date
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


def check_schedule(schedule_id: int, achieved: bool, note: str = None) -> dict[str, Any]:
    """스케줄 달성 확인 및 기록"""
    db = SessionLocal()
    try:
        schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
        if not schedule:
            return {"success": False, "error": f"schedule_id={schedule_id} 를 찾을 수 없습니다."}

        status = ScheduleStatus.ACHIEVED if achieved else ScheduleStatus.MISSED
        log = ScheduleLog(
            schedule_id=schedule_id,
            status=status,
            log_date=datetime.utcnow(),
            note=note
        )
        db.add(log)
        db.commit()

        # 오늘 달성률 계산
        today = date.today()
        user_schedules = db.query(Schedule).filter(
            Schedule.user_id == schedule.user_id,
            Schedule.is_active == True
        ).all()
        schedule_ids = [s.id for s in user_schedules]

        today_logs = db.query(ScheduleLog).filter(
            ScheduleLog.schedule_id.in_(schedule_ids),
            ScheduleLog.log_date >= datetime(today.year, today.month, today.day)
        ).all()

        achieved_count = sum(1 for l in today_logs if l.status == ScheduleStatus.ACHIEVED)
        total_count = len(today_logs)
        achievement_rate = round(achieved_count / total_count * 100) if total_count > 0 else 0

        return {
            "success": True,
            "schedule_id": schedule_id,
            "schedule_title": schedule.title,
            "user_id": schedule.user_id,
            "achieved": achieved,
            "note": note,
            "today_achievement_rate": achievement_rate,
            "notify_guardian": True   # 메시지 발신 Tool로 연결 신호
        }
    finally:
        db.close()
