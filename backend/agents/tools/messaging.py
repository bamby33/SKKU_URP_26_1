"""
Tool 5: 메시지 발신 Tool
- 매일 밤 사용자/보호자에게 오늘 스케줄 달성률 전송
- 문제 행동 심각 시 보호자/기관에 즉시 연락
- 현재는 콘솔 출력 + DB 기록 (실제 SMS/Push는 추후 연동)
"""
from models.database import SessionLocal, User, Guardian, Schedule, ScheduleLog, ScheduleStatus
from datetime import datetime, date
from typing import Any
import os
from dotenv import load_dotenv

load_dotenv()

TWILIO_SID   = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_FROM  = os.getenv("TWILIO_FROM_NUMBER")  # +1XXXXXXXXXX 형식


def _send_sms(to: str, body: str) -> bool:
    """Twilio SMS 발신. 실패 시 콘솔 출력으로 폴백."""
    if not all([TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM]):
        print(f"[SMS 미설정 - 콘솔 출력]\nTo: {to}\n{body}")
        return False
    try:
        from twilio.rest import Client
        client = Client(TWILIO_SID, TWILIO_TOKEN)
        client.messages.create(to=to, from_=TWILIO_FROM, body=body)
        return True
    except Exception as e:
        print(f"[SMS 발신 실패: {e}]\nTo: {to}\n{body}")
        return False


TOOL_DEFINITION = {
    "type": "function",
    "function": {
        "name": "send_message",
        "description": (
            "보호자 또는 기관에 메시지를 발신한다. "
            "매일 밤 달성률 전송 또는 위급 상황 알림 시 호출된다."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "message_type": {
                    "type": "string",
                    "enum": ["daily_report", "schedule_achieved", "schedule_missed", "emergency"],
                    "description": (
                        "메시지 종류. "
                        "daily_report=일일 리포트, "
                        "schedule_achieved=스케줄 달성, "
                        "schedule_missed=스케줄 미달성, "
                        "emergency=위급 상황"
                    )
                },
                "extra_info": {
                    "type": "string",
                    "description": "추가 정보 (선택, 예: 스케줄 이름, 메모)"
                }
            },
            "required": ["message_type"]
        }
    }
}


def _build_daily_report(user_id: int, db) -> str:
    """오늘 달성률 리포트 생성"""
    today = date.today()
    user = db.query(User).filter(User.id == user_id).first()

    schedules = db.query(Schedule).filter(
        Schedule.user_id == user_id,
        Schedule.is_active == True
    ).all()
    schedule_ids = [s.id for s in schedules]

    logs = db.query(ScheduleLog).filter(
        ScheduleLog.schedule_id.in_(schedule_ids),
        ScheduleLog.log_date >= datetime(today.year, today.month, today.day)
    ).all()

    achieved = sum(1 for l in logs if l.status == ScheduleStatus.ACHIEVED)
    total = len(logs)
    rate = round(achieved / total * 100) if total > 0 else 0

    lines = [
        f"[{today.strftime('%Y-%m-%d')} 일일 리포트]",
        f"사용자: {user.name}",
        f"스케줄 달성률: {achieved}/{total} ({rate}%)",
        ""
    ]
    for s in schedules:
        log = next((l for l in logs if l.schedule_id == s.id), None)
        status_str = "✅" if (log and log.status == ScheduleStatus.ACHIEVED) else "❌"
        lines.append(f"  {status_str} {s.scheduled_time} {s.title}")

    return "\n".join(lines)


def send_message(
    user_id: int,
    message_type: str,
    extra_info: str = None
) -> dict[str, Any]:
    """메시지 발신 실행"""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return {"success": False, "error": f"user_id={user_id} 를 찾을 수 없습니다."}

        guardian = db.query(Guardian).filter(Guardian.user_id == user_id).first()
        guardian_contact = guardian.phone if guardian else "보호자 미등록"

        if message_type == "daily_report":
            content = _build_daily_report(user_id, db)
        elif message_type == "schedule_achieved":
            content = f"[알림] {user.name}님이 '{extra_info}' 스케줄을 완료했습니다! 👍"
        elif message_type == "schedule_missed":
            content = f"[알림] {user.name}님이 '{extra_info}' 스케줄을 수행하지 않았습니다."
        elif message_type == "emergency":
            content = (
                f"[긴급] {user.name}님에게 즉각적인 도움이 필요합니다.\n"
                f"상황: {extra_info or '문제 행동 감지'}\n"
                f"시각: {datetime.now().strftime('%H:%M')}"
            )
        else:
            content = extra_info or "알림 메시지"

        sent = _send_sms(guardian_contact, content)

        print(f"\n{'='*50}")
        print(f"  [SMS {'발신 완료' if sent else '콘솔 폴백'}] -> {guardian_contact}")
        print(f"  {content}")
        print(f"{'='*50}\n")

        return {
            "success": True,
            "user_id": user_id,
            "message_type": message_type,
            "recipient": guardian_contact,
            "content": content,
            "sms_sent": sent,
            "sent_at": datetime.utcnow().isoformat()
        }
    finally:
        db.close()
