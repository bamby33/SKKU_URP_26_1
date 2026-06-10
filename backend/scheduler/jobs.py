"""
APScheduler 기반 자동 스케줄 작업
- 전날 밤: 다음날 스케줄 공지
- 스케줄 시간: AI가 알림 전송
- 매일 밤 22:00: 일과 종료 AI 분석 + 일일 리포트 생성
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from datetime import timedelta
from sqlalchemy.orm import Session
from models.database import (
    SessionLocal, User, Guardian, Schedule, ScheduleLog, ScheduleStatus,
    DisabilityLevel, DailyReport
)
from agents.tools.messaging import send_message
from agents.care_agent import chat as agent_chat
from services.push import send_push
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
    from timeutil import kst_now
    today = kst_now().date().isoformat()

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

            # 달성 현황 (단일 로직)
            from services.achievement import today_achievement
            ach = today_achievement(user.id, db)
            today_schedules = ach["schedules"]
            log_map = ach["log_map"]

            if not today_schedules:
                continue

            achieved_count = ach["achieved"]
            total_count = ach["total"]
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


async def send_stage3_followup(user_id: int):
    """stage_3 발생 60분 후 — 부드러운 대화 시작 메시지 DB 저장"""
    from models.database import ChatMessage
    db = SessionLocal()
    try:
        result = agent_chat(
            user_id=user_id,
            message="(60분 경과 — 사용자가 아까 흥분했다가 진정된 상황. 부드럽게 대화를 시작하며 어떤 기분이었는지 물어보세요.)",
        )
        reply = result.get("reply") or "아까 어떤 기분이 들었는지 이야기해볼 수 있어요? 😊"
        db.add(ChatMessage(user_id=user_id, role="assistant", content=reply))
        db.commit()
        logger.info(f"[stage3 followup] user={user_id} 메시지 저장 완료")
    except Exception as e:
        logger.error(f"[stage3 followup] 오류 user={user_id}: {e}")
    finally:
        db.close()


def schedule_stage3_followup(user_id: int, delay_minutes: int = 60):
    """stage_3 followup 잡 예약"""
    run_at = datetime.utcnow() + timedelta(minutes=delay_minutes)
    job_id = f"stage3_followup_{user_id}"

    # 이미 예약된 잡이 있으면 덮어씀
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    scheduler.add_job(
        send_stage3_followup,
        DateTrigger(run_date=run_at),
        args=[user_id],
        id=job_id,
        replace_existing=True,
    )
    logger.info(f"[stage3 followup] 예약 user={user_id} 실행시각={run_at.isoformat()}")


# ── 취침 1시간 전: 보호자에게 다음날 스케줄 추천 푸시 ──────────────────────────
SLEEP_KW = ["취침", "수면", "자기", "잠"]


def _find_bedtime(user_id: int, db: Session) -> str | None:
    """사용자 스케줄에서 취침 관련 일과의 가장 이른 시각(HH:MM) 반환."""
    scheds = db.query(Schedule).filter(
        Schedule.user_id == user_id, Schedule.is_active == True
    ).all()
    times = [s.scheduled_time for s in scheds if any(k in s.title for k in SLEEP_KW)]
    return min(times) if times else None


async def notify_guardian_tomorrow_recommendation(user_id: int):
    """취침 1시간 전 — 보호자에게 내일 일과 + AI 추천 푸시"""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        guardian = db.query(Guardian).filter(Guardian.user_id == user_id).first()
        if not user or not guardian:
            return

        # 내일 일과
        tomorrow_idx = (datetime.today().weekday() + 1) % 7
        all_s = db.query(Schedule).filter(
            Schedule.user_id == user_id, Schedule.is_active == True
        ).all()
        tomorrow = sorted(
            [s for s in all_s if str(tomorrow_idx) in [d.strip() for d in s.days_of_week.split(',')]],
            key=lambda x: x.scheduled_time,
        )
        sched_text = ", ".join(f"{s.scheduled_time} {s.title}" for s in tomorrow) or "등록된 일과 없음"

        # 오늘 미수행 일과
        today_dow = str(datetime.now().weekday())
        today_start = datetime.combine(date.today(), datetime.min.time())
        today_s = [s for s in all_s if today_dow in s.days_of_week.split(',')]
        logs = db.query(ScheduleLog).filter(
            ScheduleLog.schedule_id.in_([s.id for s in today_s]),
            ScheduleLog.log_date >= today_start,
        ).all() if today_s else []
        log_map = {l.schedule_id: l for l in logs}
        missed = [s.title for s in today_s
                  if log_map.get(s.id) and log_map[s.id].status == ScheduleStatus.MISSED]
        missed_text = (", ".join(missed)) if missed else "없음"

        # AI 추천 (Gemma)
        prompt = (
            f"보호자에게 보낼 짧은 안내를 2문장 이내 존댓말로 작성하세요. "
            f"{user.name}님의 내일 일과: {sched_text}. "
            f"오늘 미수행 일과: {missed_text}. "
            f"내일을 위한 조정 제안 한 가지를 부드럽게 포함하세요."
        )
        rec = ""
        try:
            result = agent_chat(user_id=user_id, message=prompt)
            rec = (result.get("reply") or "").strip()
        except Exception as e:
            logger.error(f"[취침전추천] AI 오류 user={user_id}: {e}")

        body = (rec or f"내일 {user.name}님 일과: {sched_text}")[:170]
        send_push(guardian.push_token, "내일 일과 추천", body, {"screen": "GuardianReport"})
        logger.info(f"[취침전추천] user={user_id} 발송")
    finally:
        db.close()


def register_bedtime_jobs(db: Session):
    """각 사용자의 취침 1시간 전에 보호자 추천 푸시 잡 등록."""
    users = _get_active_users(db)
    for user in users:
        bedtime = _find_bedtime(user.id, db)
        if not bedtime:
            continue
        h, m = map(int, bedtime.split(":"))
        total = (h * 60 + m - 60) % (24 * 60)  # 1시간 전
        rh, rm = divmod(total, 60)
        job_id = f"bedtime_rec_{user.id}"
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)
        scheduler.add_job(
            notify_guardian_tomorrow_recommendation,
            CronTrigger(hour=rh, minute=rm),
            args=[user.id],
            id=job_id,
            replace_existing=True,
        )
        logger.info(f"[등록] bedtime_rec user={user.id} at {rh:02d}:{rm:02d} (취침 {bedtime} 1시간 전)")


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
        register_bedtime_jobs(db)
    finally:
        db.close()

    scheduler.start()
    logger.info("스케줄러 시작")
