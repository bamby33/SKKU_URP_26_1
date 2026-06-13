"""테스트용 — 최근 7일 적합도 히트맵 데이터 채우기.
서버에서:  python seed_heatmap.py [user_id ...]   (기본: 1 5)
일과가 없으면 기본 일과 6개도 만들어줌. 재실행해도 최근 7일치는 새로 덮어씀.
"""
import sys
from datetime import timedelta
from models.database import (
    SessionLocal, Schedule, ScheduleLog, ScheduleStatus, ScheduleTransition,
    BehaviorLog, FeedbackStage,
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

# i=0 → 6일 전 … i=6 → 오늘.  g=완료 o=완료(오래걸림) y=중도포기 r=거절/미수행 n=기록없음
PATTERNS = {
    "기상": ["g", "g", "g", "y", "g", "g", "g"],
    "아침": ["g", "g", "g", "g", "g", "y", "g"],
    "운동": ["y", "r", "y", "r", "y", "n", "g"],
    "숙제": ["g", "g", "o", "g", "r", "n", "o"],
    "저녁": ["g", "g", "g", "g", "g", "g", "g"],
    "세면": ["g", "o", "g", "g", "o", "g", "n"],
}
DEFAULT_PAT = ["g", "n", "g", "y", "g", "n", "g"]

REASONS = {"운동": "몸이 힘들다고 했어요", "숙제": "하기 싫다고 했어요", "세면": "물이 차갑다고 했어요"}
def reason_of(title: str) -> str:
    for k, v in REASONS.items():
        if k in title:
            return v
    return "기분이 별로라고 했어요"

def planned_of(s) -> int:
    if not s.end_time:
        return 30
    try:
        sh, sm = s.scheduled_time.split(":"); eh, em = s.end_time.split(":")
        return max(10, (int(eh) * 60 + int(em)) - (int(sh) * 60 + int(sm)))
    except Exception:
        return 30


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

    # 종료시간 없는 일과엔 기본 종료시간(시작+40분) 부여 — AI 단축 제안이 가능하도록
    from services.category import classify_category
    for s in scheds:
        if not s.end_time:
            try:
                h, m = s.scheduled_time.split(":")
                end = (int(h) * 60 + int(m) + 40)
                s.end_time = f"{(end // 60) % 24:02d}:{end % 60:02d}"
            except Exception:
                pass
        if not s.category:  # 카테고리 백필 (기존 데이터)
            s.category = classify_category(s.title)
    db.commit()

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
        pl = planned_of(s)
        for i, code in enumerate(pat):
            if code == "n" or i == len(pat) - 1:  # 오늘(마지막)은 비워둠 → 라이브 테스트용
                continue
            ds = today0 - timedelta(days=6 - i) + timedelta(hours=9)
            if code == "g":
                db.add(ScheduleLog(user_id=user_id, schedule_id=s.id, status=ScheduleStatus.ACHIEVED,
                                   log_date=ds, early_stop=False, actual_duration_min=pl, response_type="started"))
            elif code == "o":  # 완료했지만 예상보다 오래
                db.add(ScheduleLog(user_id=user_id, schedule_id=s.id, status=ScheduleStatus.ACHIEVED,
                                   log_date=ds, early_stop=False, actual_duration_min=pl + 15, response_type="started"))
            elif code == "y":  # 중도포기 (예정보다 한참 짧게 → AI 단축 제안 유발)
                db.add(ScheduleLog(user_id=user_id, schedule_id=s.id, status=ScheduleStatus.ACHIEVED,
                                   log_date=ds, early_stop=True, actual_duration_min=max(5, pl // 3),
                                   response_type="started", note=reason_of(s.title)))
            elif code == "r":  # 거절/미수행
                db.add(ScheduleLog(user_id=user_id, schedule_id=s.id, status=ScheduleStatus.MISSED,
                                   log_date=ds, response_type="no_response", note=reason_of(s.title)))
                db.add(ScheduleTransition(user_id=user_id, from_schedule_id=None, to_schedule_id=s.id,
                                          result="refused", log_date=ds))
    db.commit()

    # ── 오늘 데모 데이터 (보호자 화면 테스트용): 힘들어한 일과 AI요약 + 문제행동 ──
    # 오늘 기존 데모 로그/행동 제거 (재실행 멱등)
    db.query(ScheduleLog).filter(
        ScheduleLog.schedule_id.in_(ids), ScheduleLog.log_date >= today0
    ).delete(synchronize_session=False)
    db.query(BehaviorLog).filter(
        BehaviorLog.user_id == user_id, BehaviorLog.logged_at >= today0
    ).delete(synchronize_session=False)
    db.commit()

    def find(kw):
        return next((s for s in scheds if kw in s.title), None)
    def smin(s):  # 일과 시작 시각(분)
        try: h, m = s.scheduled_time.split(":"); return int(h) * 60 + int(m)
        except Exception: return 0

    # ⚠️ 현재 시각 이후(미래) 일과는 '대기'로 둠 — 달성률에 미리 100% 안 뜨게
    from timeutil import kst_now
    now = kst_now(); now_min = now.hour * 60 + now.minute
    # BehaviorLog.logged_at 은 실제 앱처럼 UTC 로 저장해야 프론트(+'Z' 변환)에서 시각이 안 밀림
    def bt(minutes):  # KST HH:MM → UTC naive
        return today0 - timedelta(hours=9) + timedelta(minutes=minutes)

    ex = find("운동")   # 중도포기
    hw = find("숙제")   # 거절
    if ex and smin(ex) <= now_min:
        db.add(ScheduleLog(user_id=user_id, schedule_id=ex.id, status=ScheduleStatus.ACHIEVED,
                           log_date=today0 + timedelta(minutes=smin(ex) + 5), early_stop=True,
                           actual_duration_min=8, response_type="started",
                           note="다리가 아프다고 했어요",
                           ai_summary="운동을 하다가 다리가 아프다며 중간에 그만뒀어요.\n오늘은 몸 상태가 평소보다 안 좋아 보여요.\n무리하지 않고 쉬게 해주는 게 좋겠어요."))
        db.add(BehaviorLog(user_id=user_id, schedule_id=ex.id, stage=FeedbackStage.STAGE_2,
                           trigger="voice_decibel", context="in_activity", decibel_level=96.0,
                           logged_at=bt(smin(ex))))
    if hw and smin(hw) <= now_min:
        db.add(ScheduleLog(user_id=user_id, schedule_id=hw.id, status=ScheduleStatus.MISSED,
                           log_date=today0 + timedelta(minutes=smin(hw) + 2), response_type="later",
                           note="하기 싫다고 했어요",
                           ai_summary="숙제 시간에 하기 싫다고 거부했어요.\n다른 데 관심이 가 있어 집중이 어려웠던 것 같아요.\n잠깐 쉬었다가 다시 권해보면 좋겠어요."))
        db.add(BehaviorLog(user_id=user_id, schedule_id=hw.id, stage=FeedbackStage.STAGE_1,
                           trigger="text_refusal", context="transition",
                           logged_at=bt(smin(hw))))

    # 나머지 일과는 '시각이 지난 것만' 완료 처리 (미래는 대기)
    for s in scheds:
        if (ex and s.id == ex.id) or (hw and s.id == hw.id):
            continue
        if smin(s) > now_min:
            continue
        db.add(ScheduleLog(user_id=user_id, schedule_id=s.id, status=ScheduleStatus.ACHIEVED,
                           log_date=today0 + timedelta(minutes=smin(s)), early_stop=False,
                           actual_duration_min=planned_of(s), response_type="started"))
    db.commit()
    print(f"✅ user {user_id}: 최근 7일 기록 + 오늘 데모(문제행동 3건·힘들어한 일과 2건) 생성")


if __name__ == "__main__":
    db = SessionLocal()
    try:
        for uid in USERS:
            seed(db, uid)
    finally:
        db.close()
