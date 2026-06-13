"""스케줄 달성 계산 단일 소스.

check_schedule / today-report / dashboard 가 모두 이 로직을 사용해 일관성 보장.
정의: 달성 = (오늘 요일의 활성 일과 중 '최신 로그가 achieved'인 개수) / (오늘 요일의 활성 일과 수)
- 일과별 '최신 로그'만 사용 → 중복 로그가 있어도 달성률 100% 초과 불가
- '오늘' 경계는 KST 기준
"""
from sqlalchemy.orm import Session
from models.database import Schedule, ScheduleLog, ScheduleStatus, ScheduleTransition
from timeutil import kst_today_start, kst_weekday, kst_now


def _today_log(schedule: Schedule, db: Session) -> ScheduleLog:
    """오늘(KST) 해당 일과의 로그를 가져오거나, 없으면 PENDING 으로 새로 만들어 반환 (1일 1로그 보장)."""
    log = db.query(ScheduleLog).filter(
        ScheduleLog.schedule_id == schedule.id,
        ScheduleLog.log_date >= kst_today_start(),
    ).order_by(ScheduleLog.log_date.desc()).first()
    if not log:
        log = ScheduleLog(
            user_id=schedule.user_id, schedule_id=schedule.id,
            status=ScheduleStatus.PENDING, log_date=kst_now(),
        )
        db.add(log)
    return log


def today_schedules(user_id: int, db: Session) -> list[Schedule]:
    """오늘 요일(KST)에 해당하는 활성 일과."""
    dow = str(kst_weekday())
    all_s = db.query(Schedule).filter(
        Schedule.user_id == user_id, Schedule.is_active == True
    ).order_by(Schedule.scheduled_time).all()
    return [s for s in all_s if dow in [d.strip() for d in s.days_of_week.split(',')]]


def latest_log_map(schedule_ids: list[int], db: Session) -> dict[int, ScheduleLog]:
    """오늘(KST) 각 일과의 최신 로그 맵 {schedule_id: ScheduleLog}."""
    if not schedule_ids:
        return {}
    logs = db.query(ScheduleLog).filter(
        ScheduleLog.schedule_id.in_(schedule_ids),
        ScheduleLog.log_date >= kst_today_start(),
    ).order_by(ScheduleLog.log_date.asc()).all()
    m: dict[int, ScheduleLog] = {}
    for l in logs:
        m[l.schedule_id] = l  # 시간순 → 마지막(최신)이 남음
    return m


def upsert_log(schedule: Schedule, achieved: bool, note: str | None, db: Session,
               count_refusal: bool = False) -> ScheduleLog:
    """오늘 해당 일과의 로그를 upsert (있으면 갱신, 없으면 생성). 중복 방지.
    count_refusal=True 이고 미수행이면 거부 횟수(refusal_count) +1.
    """
    log = _today_log(schedule, db)
    log.status = ScheduleStatus.ACHIEVED if achieved else ScheduleStatus.MISSED
    log.log_date = kst_now()
    log.user_id = schedule.user_id
    if note is not None:
        log.note = note
    if count_refusal and not achieved:
        log.refusal_count = (log.refusal_count or 0) + 1
    return log


def record_start(schedule: Schedule, response_type: str, db: Session) -> ScheduleLog:
    """시작 알림 반응 기록. response_type: started | later | no_response.
    'started' 이면 진행 시작 시각을 남긴다 (status 는 PENDING 유지)."""
    log = _today_log(schedule, db)
    log.response_type = response_type
    log.user_id = schedule.user_id
    log.log_date = kst_now()
    if response_type == "started" and not log.started_at:
        log.started_at = kst_now()
    return log


def record_stop(schedule: Schedule, db: Session, achieved: bool = True,
                early_stop: bool = False, duration_min: int | None = None,
                note: str | None = None, transition_delay_min: int | None = None,
                next_schedule_id: int | None = None) -> ScheduleLog:
    """일과 종료('그만할래요'/완료) 기록 — 종료 시각·실제 진행시간·조기종료 여부."""
    log = _today_log(schedule, db)
    log.status = ScheduleStatus.ACHIEVED if achieved else ScheduleStatus.MISSED
    log.ended_at = kst_now()
    log.early_stop = early_stop
    log.user_id = schedule.user_id
    log.log_date = kst_now()
    # 전환 지연(Phase 3): 정상 완료('다 했어요')에서만 측정. 중도포기(early_stop)는 측정 안 함
    if not early_stop and transition_delay_min is not None:
        log.transition_delay_min = transition_delay_min
        log.next_schedule_id = next_schedule_id
    if note is not None:
        log.note = note
    if duration_min is not None:
        log.actual_duration_min = duration_min
    elif log.started_at is not None:
        secs = (kst_now() - log.started_at).total_seconds()
        log.actual_duration_min = max(0, int(secs // 60))
    return log


def record_transition(user_id: int, from_schedule_id: int | None,
                      to_schedule_id: int, result: str, db: Session) -> ScheduleTransition:
    """일과 간 전환 결과 기록. result: accepted | refused | no_response."""
    t = ScheduleTransition(
        user_id=user_id, from_schedule_id=from_schedule_id,
        to_schedule_id=to_schedule_id, result=result, log_date=kst_now(),
    )
    db.add(t)
    return t


def schedule_suitability(user_id: int, db: Session, days: int = 7) -> list[dict]:
    """일과별 적합도(🟢🟡🔴) — 최근 N일의 완료/조기종료/미수행 + 전환 거절로 산출.
    같은 제목의 일과(요일별로 나뉜 행)는 하나로 묶어 집계. green/yellow/red/unknown.
    cells: 최근 7일 일자별 상태(히트맵용)."""
    from datetime import timedelta
    WEEKDAY = ['월', '화', '수', '목', '금', '토', '일']
    today0 = kst_today_start()
    day_starts = [today0 - timedelta(days=i) for i in range(days - 1, -1, -1)]  # 오래된→오늘
    since = day_starts[0]
    scheds = db.query(Schedule).filter(
        Schedule.user_id == user_id, Schedule.is_active == True
    ).order_by(Schedule.scheduled_time).all()

    import re
    def _norm(t: str) -> str:
        # 이모지·공백·기호 제거, 한글/영문/숫자만 남겨 정규화 (제목 변형 통합)
        return re.sub(r'[^\w가-힣]', '', t or '', flags=re.UNICODE).lower()

    # 제목 기준 그룹화 (중복 방지): 정규화 키 -> {ids, 가장 이른 시간, 대표 제목}
    groups: dict[str, dict] = {}
    for s in scheds:
        key = _norm(s.title)
        g = groups.get(key)
        if not g:
            groups[key] = {"ids": [s.id], "time": s.scheduled_time, "end": s.end_time,
                           "title": s.title, "category": s.category}
        else:
            g["ids"].append(s.id)
            if s.scheduled_time < g["time"]:
                g["time"] = s.scheduled_time
                g["end"] = s.end_time
                g["category"] = s.category

    out = []
    for g in groups.values():
        ids = g["ids"]
        logs = db.query(ScheduleLog).filter(
            ScheduleLog.schedule_id.in_(ids), ScheduleLog.log_date >= since
        ).all()
        n = len(logs)
        full   = sum(1 for l in logs if l.status == ScheduleStatus.ACHIEVED and not l.early_stop)
        early  = sum(1 for l in logs if l.status == ScheduleStatus.ACHIEVED and l.early_stop)
        missed = sum(1 for l in logs if l.status == ScheduleStatus.MISSED)

        # 예상보다 오래 걸림: 실제 진행시간 > 예정 시간(end-start)
        planned = None
        if g.get("end"):
            try:
                sh, sm = g["time"].split(":"); eh, em = g["end"].split(":")
                planned = (int(eh) * 60 + int(em)) - (int(sh) * 60 + int(sm))
            except Exception:
                planned = None
        over_durs = [l.actual_duration_min - planned for l in logs
                     if l.actual_duration_min and planned and l.actual_duration_min > planned]
        over = len(over_durs)
        over_avg = round(sum(over_durs) / len(over_durs)) if over_durs else 0

        trans = db.query(ScheduleTransition).filter(
            ScheduleTransition.to_schedule_id.in_(ids), ScheduleTransition.log_date >= since
        ).all()
        tn = len(trans)
        refused = sum(1 for t in trans if t.result in ("refused", "no_response"))

        # ── Phase 4: 전환지연(이 일과 '다 했어요' → 다음 일과 시각) ──
        delays = [l.transition_delay_min for l in logs if l.transition_delay_min is not None]
        delay_avg = round(sum(delays) / len(delays)) if delays else 0
        delay_high = sum(1 for d in delays if d > 10)        # 전환지연 10분 초과
        delay_high_repeat = delay_high >= 2                  # 반복(2회 이상)

        # ── Phase 4: 도전행동(2·3단계) — dB 높음/격한표현 위기신호 ──
        from models.database import BehaviorLog, FeedbackStage
        crisis = db.query(BehaviorLog).filter(
            BehaviorLog.schedule_id.in_(ids), BehaviorLog.logged_at >= since,
            BehaviorLog.stage.in_([FeedbackStage.STAGE_2, FeedbackStage.STAGE_3]),
        ).count()

        if n == 0:
            grade = "unknown"
        else:
            full_ratio   = full / n
            missed_ratio = missed / n
            refuse_ratio = (refused / tn) if tn else 0
            # 🔴 도전행동(2단계) 발생  /  미수행·거절 과다  →  빨강
            if crisis >= 1 or missed_ratio >= 0.4 or full_ratio < 0.25 or (tn >= 3 and refuse_ratio >= 0.6):
                grade = "red"
            # 🟢 자연 종료 위주 + 전환지연 양호  →  초록
            elif full_ratio >= 0.6 and missed_ratio < 0.2 and not delay_high_repeat and delay_avg <= 0:
                grade = "green"
            # 🟡 중도포기 OR 전환지연 반복(>10)  →  노랑
            else:
                grade = "yellow"

        # 히트맵: 일자별 상태 (green=완료 / yellow=중단 / red=미수행 / none=기록없음)
        cells = []
        for ds in day_starts:
            de = ds + timedelta(days=1)
            day_logs = [l for l in logs if ds <= l.log_date < de]
            if any(l.status == ScheduleStatus.ACHIEVED and not l.early_stop for l in day_logs):
                st = "green"
            elif any(l.status == ScheduleStatus.ACHIEVED and l.early_stop for l in day_logs):
                st = "yellow"
            elif any(l.status == ScheduleStatus.MISSED for l in day_logs):
                st = "red"
            else:
                st = "none"
            cells.append({"label": WEEKDAY[ds.weekday()], "status": st})

        # 부정 연속(최근일부터 yellow/red가 연달아) — 3일 이상이면 보호자 재검토 권고
        neg_streak = 0
        for c in reversed(cells):
            if c["status"] in ("yellow", "red"):
                neg_streak += 1
            elif c["status"] == "none":
                continue  # 기록 없는 날은 끊지 않고 건너뜀
            else:
                break
        needs_review = grade == "red" or neg_streak >= 3

        notes = [l.note for l in logs if l.note]
        out.append({
            "schedule_id": ids[0], "title": g["title"], "time": g["time"],
            "category": g.get("category") or "routine",
            "grade": grade, "days": n,
            "completed_full": full, "early_stop": early, "missed": missed,
            "refused_transitions": refused, "over": over, "over_avg": over_avg,
            "delay_avg": delay_avg, "delay_high": delay_high, "crisis": crisis,
            "needs_review": needs_review,
            "reason": (notes[-1] if notes else None),
            "cells": cells,
        })

    out.sort(key=lambda x: x["time"])
    return out


def weekly_rates(user_id: int, db: Session, days: int = 7) -> list[dict]:
    """최근 N일 일과 달성률 (꺾은선 그래프용). [{label, rate, has}] 오래된→오늘."""
    from datetime import timedelta
    WEEKDAY = ['월', '화', '수', '목', '금', '토', '일']
    today0 = kst_today_start()
    all_s = db.query(Schedule).filter(
        Schedule.user_id == user_id, Schedule.is_active == True
    ).all()
    out = []
    for i in range(days - 1, -1, -1):
        ds = today0 - timedelta(days=i)
        de = ds + timedelta(days=1)
        dow = str(ds.weekday())
        day_scheds = [s for s in all_s if dow in [d.strip() for d in s.days_of_week.split(',')]]
        ids = [s.id for s in day_scheds]
        total = len(day_scheds)
        label = WEEKDAY[ds.weekday()]
        if total == 0:
            out.append({"label": label, "rate": 0, "has": False})
            continue
        logs = db.query(ScheduleLog).filter(
            ScheduleLog.schedule_id.in_(ids), ScheduleLog.log_date >= ds, ScheduleLog.log_date < de
        ).order_by(ScheduleLog.log_date.asc()).all()
        latest = {}
        for l in logs:
            latest[l.schedule_id] = l
        achieved = sum(1 for sid in ids if latest.get(sid) and latest[sid].status == ScheduleStatus.ACHIEVED)
        out.append({"label": label, "rate": round(achieved / total * 100), "has": True})
    return out


def today_achievement(user_id: int, db: Session) -> dict:
    """오늘 달성 현황 (단일 정의).
    분모(total) = '지금까지 시작 시각이 도래한 일과' — 새 일과 시간이 될 때마다 +1.
    → 지금까지 할 일을 다 했으면 100%. (아직 시각이 안 된 미래 일과는 분모에서 제외)"""
    scheds = today_schedules(user_id, db)
    lm = latest_log_map([s.id for s in scheds], db)
    now_hhmm = kst_now().strftime("%H:%M")
    due = [s for s in scheds if s.scheduled_time <= now_hhmm]   # 시각 도래한 일과만 분모에
    achieved = sum(1 for s in due if lm.get(s.id) and lm[s.id].status == ScheduleStatus.ACHIEVED)
    total = len(due)
    rate = round(achieved / total * 100) if total > 0 else 0
    return {"schedules": scheds, "log_map": lm, "achieved": achieved, "total": total, "rate": rate,
            "all_total": len(scheds)}
