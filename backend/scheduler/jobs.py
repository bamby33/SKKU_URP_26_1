"""
APScheduler 기반 자동 스케줄 작업
- 전날 밤: 다음날 스케줄 공지
- 스케줄 시간: AI가 알림 전송
- 매일 밤 22:00: 일과 종료 AI 분석 + 일일 리포트 생성
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session
from models.database import (
    SessionLocal, User, Schedule, ScheduleLog, ScheduleStatus,
    DisabilityLevel, DailyReport
)
from agents.tools.messaging import send_message
from agents.care_agent import chat as agent_chat
from datetime import datetime, date
import logging

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()


def _get_active_users(db: Session) -> list[User]:
    return db.query(User).filter(
        User.disability_level != DisabilityLevel.SEVERE
    ).all()


async def notify_daily_schedule():
    """전날 밤 21:00 - 다음날 스케줄 공지"""
    db = SessionLocal()
    try:
        users = _get_active_users(db)
        for user in users:
            schedules = db.query(Schedule).filter(
                Schedule.user_id == user.id,
                Schedule.is_active == True
            ).order_by(Schedule.scheduled_time).all()

            if not schedules:
                continue

            schedule_text = ", ".join([f"{s.scheduled_time} {s.title}" for s in schedules])
            message = f"내일 스케줄을 알려드릴게요: {schedule_text}"

            # AI에게 스케줄 공지 메시지 생성 요청
            result = agent_chat(
                user_id=user.id,
                message=f"내일 스케줄을 {user.name}님에게 알려주세요: {schedule_text}",
            )
            logger.info(f"[야간공지] user={user.id} reply={result['reply']}")

            # 보호자에게도 알림
            send_message(
                user_id=user.id,
                message_type="daily_report",
            )
    finally:
        db.close()


async def trigger_schedule_notification(user_id: int, schedule_id: int, title: str):
    """특정 스케줄 시간에 AI 알림 전송"""
    result = agent_chat(
        user_id=user_id,
        message=f"지금 '{title}' 시간이에요. 사용자에게 알려주세요.",
    )
    logger.info(f"[스케줄알림] user={user_id} schedule={title} reply={result['reply']}")


async def send_daily_report():
    """매일 밤 22:00 - 일과 종료 AI 분석 + DailyReport 저장"""
    db = SessionLocal()
    today = date.today().isoformat()
    today_dow = str(datetime.now().weekday())

    try:
        users = _get_active_users(db)
        for user in users:
            # 이미 오늘 리포트가 있으면 스킵
            existing = db.query(DailyReport).filter(
                DailyReport.user_id == user.id,
                DailyReport.report_date == today
            ).first()
            if existing and existing.is_complete:
                continue

            # 오늘 스케줄 (요일 필터)
            all_schedules = db.query(Schedule).filter(
                Schedule.user_id == user.id,
                Schedule.is_active == True
            ).order_by(Schedule.scheduled_time).all()
            today_schedules = [s for s in all_schedules if today_dow in s.days_of_week.split(",")]

            if not today_schedules:
                continue

            # ScheduleLog에서 달성 현황 수집
            schedule_ids = [s.id for s in today_schedules]
            today_start = datetime.combine(date.today(), datetime.min.time())
            logs = db.query(ScheduleLog).filter(
                ScheduleLog.schedule_id.in_(schedule_ids),
                ScheduleLog.log_date >= today_start
            ).all()
            log_map = {l.schedule_id: l for l in logs}

            achieved_count = sum(1 for l in logs if l.status == ScheduleStatus.ACHIEVED)
            total_count = len(today_schedules)
            missed = [s.title for s in today_schedules
                      if log_map.get(s.id) and log_map[s.id].status == ScheduleStatus.MISSED]
            schedule_summary = ", ".join([f"{s.scheduled_time} {s.title}" for s in today_schedules])

            # AI에게 3-4문장 분석 요청
            prompt = (
                f"오늘 {user.name}님의 하루 일과가 끝났습니다. "
                f"오늘 일과: {schedule_summary}. "
                f"총 {total_count}개 일과 중 {achieved_count}개 완료했습니다. "
                f"{'미완료 일과: ' + ', '.join(missed) + '.' if missed else '모든 일과를 완료했습니다.'} "
                f"오늘 하루를 짧게(3~4문장) 따뜻하게 평가하고, 내일을 위한 한 가지 제안을 해주세요."
            )
            try:
                result = agent_chat(user_id=user.id, message=prompt)
                ai_summary = result.get("reply", "오늘도 수고하셨어요.")
            except Exception as e:
                logger.error(f"[일과분석] AI 오류 user={user.id}: {e}")
                ai_summary = f"오늘 {total_count}개 일과 중 {achieved_count}개를 완료했습니다. 수고하셨어요!"

            # DailyReport 저장 (없으면 생성, 있으면 업데이트)
            if existing:
                existing.ai_summary = ai_summary
                existing.achieved = achieved_count
                existing.total = total_count
                existing.is_complete = True
                existing.updated_at = datetime.utcnow()
            else:
                report = DailyReport(
                    user_id=user.id,
                    report_date=today,
                    ai_summary=ai_summary,
                    achieved=achieved_count,
                    total=total_count,
                    is_complete=True,
                )
                db.add(report)

            db.commit()

            # 보호자 알림 발송
            send_message(user_id=user.id, message_type="daily_report")
            logger.info(f"[일일리포트] user={user.id} 완료 achieved={achieved_count}/{total_count}")
    finally:
        db.close()


def register_schedule_jobs(db: Session):
    """DB에 있는 스케줄들을 APScheduler에 등록"""
    users = _get_active_users(db)
    for user in users:
        schedules = db.query(Schedule).filter(
            Schedule.user_id == user.id,
            Schedule.is_active == True
        ).all()
        for s in schedules:
            hour, minute = s.scheduled_time.split(":")
            days = s.days_of_week  # "0,1,2,3,4,5,6"

            job_id = f"schedule_{s.id}"
            if scheduler.get_job(job_id):
                scheduler.remove_job(job_id)

            scheduler.add_job(
                trigger_schedule_notification,
                CronTrigger(
                    day_of_week=days,
                    hour=int(hour),
                    minute=int(minute)
                ),
                args=[user.id, s.id, s.title],
                id=job_id,
                replace_existing=True
            )
            logger.info(f"[등록] job={job_id} user={user.id} time={s.scheduled_time} title={s.title}")


def init_scheduler():
    """스케줄러 초기화 및 고정 Job 등록"""
    # 전날 밤 스케줄 공지
    scheduler.add_job(
        notify_daily_schedule,
        CronTrigger(hour=21, minute=0),
        id="nightly_schedule_notify",
        replace_existing=True
    )

    # 일일 리포트
    scheduler.add_job(
        send_daily_report,
        CronTrigger(hour=22, minute=0),
        id="daily_report",
        replace_existing=True
    )

    # DB 스케줄 등록
    db = SessionLocal()
    try:
        register_schedule_jobs(db)
    finally:
        db.close()

    scheduler.start()
    logger.info("스케줄러 시작")
