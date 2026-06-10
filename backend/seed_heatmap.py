"""테스트용 — 최근 7일 적합도 히트맵 데이터 채우기.
서버에서:  python seed_heatmap.py [user_id ...]   (기본: 1 5)
일과가 없으면 기본 일과 6개도 만들어줌. 재실행해도 최근 7일치는 새로 덮어씀.
"""
import sys
from datetime import timedelta
from models.database import (
    SessionLocal, Schedule, ScheduleLog, ScheduleStatus, ScheduleTransition,
)
from timeutil import kst_today_start

USERS = [int(a) for a in sys.argv[1:]] or [1, 5]

DEFAULTS = [
    ("🌅 기상", "07:00", "07:30"),
    ("🍳 아침 식사", "08:00", "08:30"),
    ("🏃 운동", "10:00", "10:40"),
    ("📚 숙제", "15:00", "15:40"),
    ("🍽️ 저녁 식사", "18:00", "18:40"),
    ("🛁 세면", "21:00", "21:20"),
]

# i=0 → 6일 전 … i=6 → 오늘.  g=완료 y=중단 r=미수행 n=기록없음
PATTERNS = {
    "기상": ["g", "g", "g", "y", "g", "g", "g"],
    "아침": ["g", "g", "g", "g", "g", "y", "g"],
    "운동": ["y", "r", "y", "r", "y", "n", "g"],
    "숙제": ["g", "g", "y", "g", "r", "n", "g"],
    "저녁": ["g", "g", "g", "g", "g", "g", "g"],
    "세면": ["g", "y", "g", "g", "y", "g", "n"],
}
DEFAULT_PAT = ["g", "n", "g", "y", "g", "n", "g"]


def pat_for(title: str):
    for k, v in PATTERNS.items():
        if k in title:
            return v
    return DEFAULT_PAT


def seed(db, user_id: int):
    scheds = db.query(Schedule).filter(
        Schedule.user_id == user_id, Schedule.is_active == True
    ).all()
    if not scheds:
        for t, st, et in DEFAULTS:
            db.add(Schedule(user_id=user_id, title=t, scheduled_time=st, end_time=et,
                            days_of_week="0,1,2,3,4,5,6", is_active=True))
        db.commit()
        scheds = db.query(Schedule).filter(
            Schedule.user_id == user_id, Schedule.is_active == True
        ).all()

    today0 = kst_today_start()
    since = today0 - timedelta(days=6)
    ids = [s.id for s in scheds]

    # 최근 7일치 기존 로그/전환 제거 후 재생성
    db.query(ScheduleLog).filter(
        ScheduleLog.schedule_id.in_(ids), ScheduleLog.log_date >= since
    ).delete(synchronize_session=False)
    db.query(ScheduleTransition).filter(
        ScheduleTransition.user_id == user_id, ScheduleTransition.log_date >= since
    ).delete(synchronize_session=False)
    db.commit()

    for s in scheds:
        pat = pat_for(s.title)
        for i, code in enumerate(pat):
            if code == "n":
                continue
            ds = today0 - timedelta(days=6 - i) + timedelta(hours=9)
            if code == "g":
                db.add(ScheduleLog(user_id=user_id, schedule_id=s.id, status=ScheduleStatus.ACHIEVED,
                                   log_date=ds, early_stop=False, actual_duration_min=30, response_type="started"))
            elif code == "y":
                db.add(ScheduleLog(user_id=user_id, schedule_id=s.id, status=ScheduleStatus.ACHIEVED,
                                   log_date=ds, early_stop=True, actual_duration_min=8, response_type="started"))
            elif code == "r":
                db.add(ScheduleLog(user_id=user_id, schedule_id=s.id, status=ScheduleStatus.MISSED,
                                   log_date=ds, response_type="no_response"))
                db.add(ScheduleTransition(user_id=user_id, from_schedule_id=None, to_schedule_id=s.id,
                                          result="refused", log_date=ds))
    db.commit()
    print(f"✅ user {user_id}: {len(scheds)}개 일과에 최근 7일 기록 생성")


if __name__ == "__main__":
    db = SessionLocal()
    try:
        for uid in USERS:
            seed(db, uid)
    finally:
        db.close()
