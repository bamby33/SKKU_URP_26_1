"""다음날 최적화 — 최근 데이터로 내일 일과 조정 '제안' 생성 (보호자 승인 방식).
제안 종류:
  - shorten : 조기종료/짧은 진행 → 시간 단축 (자동 적용 가능)
  - rest    : 두 일과 사이 전환 반복 거절 → 휴식/순서 조정 (안내)
  - review  : 같은 일과 3일 연속 미수행 → 보호자 재검토 (안내)
  - reduce  : 자기평가 나쁨 + 완료율 높음 → 일과 수 줄이기 (안내)
  - add_easy: 자기평가 나쁨 + 완료율 낮음 → 쉬운 일과 추가 (안내)
"""
import re
from datetime import timedelta
from sqlalchemy.orm import Session
from models.database import (
    Schedule, ScheduleLog, ScheduleStatus, ScheduleTransition, DailyReport, User,
)
from timeutil import kst_now, kst_today_start
from services.achievement import schedule_suitability


def _norm(t: str) -> str:
    return re.sub(r'[^\w가-힣]', '', t or '', flags=re.UNICODE).lower()


def _mins(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _hhmm(mins: int) -> str:
    mins = max(0, min(24 * 60 - 1, mins))
    return f"{mins // 60:02d}:{mins % 60:02d}"


def next_day_suggestions(user_id: int, db: Session, days: int = 7) -> list[dict]:
    since = kst_today_start() - timedelta(days=days)
    scheds = db.query(Schedule).filter(
        Schedule.user_id == user_id, Schedule.is_active == True
    ).order_by(Schedule.scheduled_time).all()
    if not scheds:
        return []

    # 활동 정규 키 + 시각 그룹화 — '운동'='운동 시간'은 묶되, 시각이 다르면 별개(단축 계산 분리)
    from services.category import canonical_key
    groups: dict[tuple, dict] = {}
    for s in scheds:
        k = (canonical_key(s.title), s.scheduled_time)
        g = groups.get(k)
        if not g:
            groups[k] = {"ids": [s.id], "title": s.title, "start": s.scheduled_time,
                         "end": s.end_time, "category": s.category}
        else:
            g["ids"].append(s.id)

    id_to_title = {s.id: s.title for s in scheds}
    suggestions: list[dict] = []

    # 카테고리 게이팅(Phase 5): productive·routine만 시간 조정(단축) 대상.
    # fixed(기관·병원 고정일정)·sleep(수면)은 최적화 제외. rest는 자동생성(Phase 6)이라 단축 안 함.
    ADJUSTABLE = ("productive", "routine")

    # ── 1) 시간 단축 (조기종료/짧은 진행) — productive·routine 한정 ──
    for g in groups.values():
        if (g.get("category") or "routine") not in ADJUSTABLE:
            continue
        if not g["end"]:
            continue
        planned = _mins(g["end"]) - _mins(g["start"])
        if planned <= 10:
            continue
        durs = [l.actual_duration_min for l in db.query(ScheduleLog).filter(
            ScheduleLog.schedule_id.in_(g["ids"]),
            ScheduleLog.log_date >= since,
            ScheduleLog.status == ScheduleStatus.ACHIEVED,
            ScheduleLog.actual_duration_min.isnot(None),
        ).all() if l.actual_duration_min is not None]
        if len(durs) < 2:
            continue
        avg = sum(durs) / len(durs)
        if avg < planned * 0.6:
            new_dur = max(10, round(avg / 5) * 5)
            if new_dur < planned:
                new_end = _hhmm(_mins(g["start"]) + new_dur)
                suggestions.append({
                    "type": "shorten",
                    "title": g["title"],
                    "schedule_ids": g["ids"],
                    "message": f"최근 평균 {round(avg)}분만 해서, 시간을 줄이는 걸 추천해요.",
                    "planned_min": planned,
                    "new_min": new_dur,
                    "applicable": True,
                    "action": {"new_end_time": new_end},
                })

    # 적합도(완료율·등급 산출에 사용) — '재검토' 제안은 제거됨
    suit = schedule_suitability(user_id, db, days=7)

    # ── 2) 전환 어려움 반복(거절 OR 전환지연>10) → 사이 휴식 자동 삽입 ──
    id_to_sched = {s.id: s for s in scheds}
    pair_count: dict[tuple, int] = {}
    # (a) 전환 거절/무반응
    trans = db.query(ScheduleTransition).filter(
        ScheduleTransition.user_id == user_id,
        ScheduleTransition.log_date >= since,
        ScheduleTransition.result.in_(["refused", "no_response"]),
        ScheduleTransition.from_schedule_id.isnot(None),
    ).all()
    for t in trans:
        pair_count[(t.from_schedule_id, t.to_schedule_id)] = pair_count.get((t.from_schedule_id, t.to_schedule_id), 0) + 1
    # (b) 전환지연 10분 초과 (Phase 3 측정값)
    delay_logs = db.query(ScheduleLog).filter(
        ScheduleLog.user_id == user_id, ScheduleLog.log_date >= since,
        ScheduleLog.next_schedule_id.isnot(None),
        ScheduleLog.transition_delay_min.isnot(None),
        ScheduleLog.transition_delay_min > 10,
    ).all()
    for l in delay_logs:
        pair_count[(l.schedule_id, l.next_schedule_id)] = pair_count.get((l.schedule_id, l.next_schedule_id), 0) + 1

    REST_LEN = 10
    for (fid, tid), cnt in pair_count.items():
        A, B = id_to_sched.get(fid), id_to_sched.get(tid)
        if cnt < 3 or not A or not B:
            continue
        if (B.category or "routine") == "sleep":   # 취침 앞엔 휴식 안 넣음
            continue
        # 삽입 슬롯: A 종료~B 시작 사이 빈틈에 10분, 없으면 B 직전 10분
        a_end = A.end_time or _hhmm(_mins(A.scheduled_time) + 30)
        b_start = B.scheduled_time
        gap = _mins(b_start) - _mins(a_end)
        if gap >= REST_LEN:
            r_start, r_end = a_end, _hhmm(_mins(a_end) + REST_LEN)
        elif gap > 0:
            r_start, r_end = a_end, b_start
        else:
            r_start, r_end = _hhmm(_mins(b_start) - REST_LEN), b_start
        suggestions.append({
            "type": "rest",
            "title": B.title,
            "schedule_ids": [tid],
            "message": f"'{A.title}' 다음에 '{B.title}'로 넘어가길 자주 힘들어해요 ({cnt}회). 사이에 {r_start}~{r_end} 짧은 휴식을 넣어보세요.",
            "applicable": True,
            "action": {
                "user_id": user_id, "to_schedule_id": tid,
                "rest_start": r_start, "rest_end": r_end,
                "days_of_week": B.days_of_week,
            },
        })

    # ── 4) 자기평가 나쁨 → 일과 수 조정 ──
    recent_reports = db.query(DailyReport).filter(
        DailyReport.user_id == user_id,
        DailyReport.self_assessment.isnot(None),
    ).order_by(DailyReport.report_date.desc()).limit(3).all()
    bad = [r for r in recent_reports if r.self_assessment == "bad"]
    if len(recent_reports) >= 2 and len(bad) >= 2:
        # 뺄 후보는 productive(활동) 일과만 — fixed·routine·sleep은 빼지 않음
        prod = [su for su in suit if su.get("category") == "productive" and su["grade"] != "unknown"]
        prod.sort(key=lambda su: {"red": 0, "yellow": 1, "green": 2}.get(su["grade"], 3))
        target = prod[0] if prod else None
        if target:
            suggestions.append({
                "type": "reduce", "title": target["title"],
                "schedule_ids": [target["schedule_id"]],
                "message": f"요즘 '힘들어요'가 많아요. 내일은 '{target['title']}' 같은 활동 일과를 하나 빼서 여유를 줘보세요.",
                "applicable": False, "action": {},
            })

    # ── 5) add_easy: 자기평가 나쁨 + 완료율 낮음 → 좋아하는 활동 추가 제안 ──
    if len(recent_reports) >= 2 and len(bad) >= 2:
        rates = [r.achieved / r.total for r in recent_reports if r.total and r.total > 0]
        avg_rate = sum(rates) / len(rates) if rates else 1.0
        if avg_rate < 0.6:
            user = db.query(User).filter(User.id == user_id).first()
            likes_text = ""
            for line in (user.special_notes or "").splitlines():
                if "좋아하는 것:" in line:
                    likes_text = line.split("좋아하는 것:")[1].strip()
                    break
            if likes_text:
                first_like = likes_text.split(",")[0].split(".")[0].split("、")[0].strip()
                suggestions.append({
                    "type": "add_easy",
                    "title": first_like,
                    "schedule_ids": [],
                    "message": f"요즘 힘들어하고 일과도 잘 못 하고 있어요. '{first_like}'처럼 좋아하는 활동을 짧게 하나 추가해서 기분을 북돋아 보세요.",
                    "applicable": False,
                    "action": {},
                })

    return suggestions


def apply_shorten(schedule_ids: list[int], new_end_time: str, db: Session) -> int:
    """시간 단축 제안 적용 — 해당 일과들의 end_time 변경. 변경 개수 반환."""
    n = 0
    for sid in schedule_ids:
        s = db.query(Schedule).filter(Schedule.id == sid, Schedule.is_active == True).first()
        # 종료가 시작보다 빨라지는 잘못된 값은 적용 안 함 (깨진 데이터 방지)
        if s and _mins(new_end_time) > _mins(s.scheduled_time):
            s.end_time = new_end_time
            n += 1
    db.commit()
    return n


def apply_rest(user_id: int, rest_start: str, rest_end: str,
               days_of_week: str, db: Session) -> int:
    """휴식 자동 삽입 제안 적용 — rest 카테고리 일과 생성. 생성 개수 반환(중복이면 0)."""
    exists = db.query(Schedule).filter(
        Schedule.user_id == user_id, Schedule.scheduled_time == rest_start,
        Schedule.category == "rest", Schedule.is_active == True,
    ).first()
    if exists:
        return 0
    db.add(Schedule(
        user_id=user_id, title="🧘 잠깐 휴식", scheduled_time=rest_start,
        end_time=rest_end, days_of_week=days_of_week, category="rest", is_active=True,
    ))
    db.commit()
    return 1
