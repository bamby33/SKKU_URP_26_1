"""중복 일과 정리 — 같은 canonical_key의 활성 일과가 여러 개면 하나만 남기고 나머지 비활성화.
로그가 많은(완료 기록이 있는) 일과를 keeper로 두고, 나머지 일과의 로그를 keeper로 승계한다.

사용:
  python dedup_schedules.py            # 전체 사용자
  python dedup_schedules.py 5          # uid=5 만
  python dedup_schedules.py 5 --dry    # 미리보기(변경 안 함)
"""
import sys
from models.database import SessionLocal, Schedule, ScheduleLog
from services.category import canonical_key


def run(user_id: int | None, dry: bool):
    db = SessionLocal()
    try:
        q = db.query(Schedule).filter(Schedule.is_active == True)
        if user_id is not None:
            q = q.filter(Schedule.user_id == user_id)
        schedules = q.all()

        # 사용자별 → canonical_key별 그룹
        by_user: dict = {}
        for s in schedules:
            by_user.setdefault(s.user_id, {}).setdefault(canonical_key(s.title), []).append(s)

        log_count = {}
        def logs_of(sid):
            if sid not in log_count:
                log_count[sid] = db.query(ScheduleLog).filter(ScheduleLog.schedule_id == sid).count()
            return log_count[sid]

        total_deact = 0
        for uid, groups in by_user.items():
            for ck, items in groups.items():
                if len(items) <= 1:
                    continue
                # keeper: 로그 많은 것 → 그다음 낮은 id
                items.sort(key=lambda s: (-logs_of(s.id), s.id))
                keeper = items[0]
                dups = items[1:]
                print(f"[uid={uid}] '{ck}' 중복 {len(items)}개 → keep id={keeper.id}({keeper.scheduled_time}), "
                      f"deactivate {[ (d.id, d.scheduled_time) for d in dups ]}")
                if dry:
                    continue
                for d in dups:
                    # 로그 승계 후 비활성화
                    db.query(ScheduleLog).filter(ScheduleLog.schedule_id == d.id)\
                        .update({ScheduleLog.schedule_id: keeper.id}, synchronize_session=False)
                    d.is_active = False
                    total_deact += 1

        if dry:
            print("\n[DRY RUN] 변경 사항 없음. 실제 적용하려면 --dry 빼고 다시 실행.")
        else:
            db.commit()
            print(f"\n✅ 완료: {total_deact}개 중복 일과 비활성화 + 로그 승계.")
    finally:
        db.close()


if __name__ == "__main__":
    uid = None
    dry = "--dry" in sys.argv
    for a in sys.argv[1:]:
        if a.isdigit():
            uid = int(a)
    run(uid, dry)
