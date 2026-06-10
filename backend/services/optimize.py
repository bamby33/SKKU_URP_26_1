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
    Schedule, ScheduleLog, ScheduleStatus, ScheduleTransition, DailyReport,
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

    # 제목 그룹화
    groups: dict[str, dict] = {}
    for s in scheds:
        k = _norm(s.title)
        g = groups.get(k)
        if not g:
            groups[k] = {"ids": [s.id], "title": s.title, "start": s.scheduled_time, "end": s.end_time}
        else:
            g["ids"].append(s.id)
            if s.scheduled_time < g["start"]:
                g["start"], g["end"] = s.scheduled_time, s.end_time

    id_to_title = {s.id: s.title for s in scheds}
    suggestions: list[dict] = []

    # ── 1) 시간 단축 (조기종료/짧은 진행) ──
    for g in groups.values():
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
                    "message": f"'{g['title']}'을(를) {planned}분 → {new_dur}분으로 줄여보는 건 어떨까요? (평균 {round(avg)}분만 했어요)",
                    "applicable": True,
                    "action": {"new_end_time": new_end},
                })

    # ── 2) 3일 연속 미수행 → 재검토 ──
    suit = schedule_suitability(user_id, db, days=7)
    for su in suit:
        last3 = [c["status"] for c in su["cells"][-3:]]
        if len(last3) == 3 and all(s == "red" for s in last3):
            suggestions.append({
                "type": "review",
                "title": su["title"],
                "schedule_ids": [su["schedule_id"]],
                "message": f"'{su['title']}'을(를) 3일 연속 못 했어요. 시간대나 난이도가 맞는지 검토가 필요해요.",
                "applicable": False,
                "action": {},
            })

    # ── 3) 전환 반복 거절 → 사이 휴식 ──
    trans = db.query(ScheduleTransition).filter(
        ScheduleTransition.user_id == user_id,
        ScheduleTransition.log_date >= since,
        ScheduleTransition.result.in_(["refused", "no_response"]),
        ScheduleTransition.from_schedule_id.isnot(None),
    ).all()
    pair_count: dict[tuple, int] = {}
    for t in trans:
        pair_count[(t.from_schedule_id, t.to_schedule_id)] = pair_count.get((t.from_schedule_id, t.to_schedule_id), 0) + 1
    for (fid, tid), cnt in pair_count.items():
        if cnt >= 3 and fid in id_to_title and tid in id_to_title:
            suggestions.append({
                "type": "rest",
                "title": id_to_title[tid],
                "schedule_ids": [tid],
                "message": f"'{id_to_title[fid]}' 다음에 '{id_to_title[tid]}'로 넘어가길 자주 힘들어해요 ({cnt}회). 사이에 짧은 휴식을 넣거나 순서를 바꿔보세요.",
                "applicable": False,
                "action": {},
            })

    # ── 4) 자기평가 나쁨 → 일과 수 조정 ──
    recent_reports = db.query(DailyReport).filter(
        DailyReport.user_id == user_id,
        DailyReport.self_assessment.isnot(None),
    ).order_by(DailyReport.report_date.desc()).limit(3).all()
    bad = [r for r in recent_reports if r.self_assessment == "bad"]
    if len(recent_reports) >= 2 and len(bad) >= 2:
        # 최근 완료율(전체 그룹 green 비율) 추정
        greens = sum(1 for su in suit if su["grade"] == "green")
        graded = [su for su in suit if su["grade"] != "unknown"]
        comp = (greens / len(graded)) if graded else 0
        if comp >= 0.6:
            suggestions.append({
                "type": "reduce", "title": "전체 일과", "schedule_ids": [],
                "message": "요즘 '힘들어요'가 많아요. 잘 해내고 있으니, 내일은 일과를 1개쯤 줄여 여유를 줘보세요.",
                "applicable": False, "action": {},
            })
        else:
            suggestions.append({
                "type": "add_easy", "title": "전체 일과", "schedule_ids": [],
                "message": "요즘 '힘들어요'가 많고 달성도 낮아요. 쉬운 일과를 하나 넣어 성취감을 먼저 주는 걸 추천해요.",
                "applicable": False, "action": {},
            })

    return suggestions


def apply_shorten(schedule_ids: list[int], new_end_time: str, db: Session) -> int:
    """시간 단축 제안 적용 — 해당 일과들의 end_time 변경. 변경 개수 반환."""
    n = 0
    for sid in schedule_ids:
        s = db.query(Schedule).filter(Schedule.id == sid, Schedule.is_active == True).first()
        if s:
            s.end_time = new_end_time
            n += 1
    db.commit()
    return n
