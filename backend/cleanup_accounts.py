"""계정 정리 — 지정한 (보호자 아이디 → 당사자 PIN) 짝만 남기고 나머지 사용자/보호자/데이터 전부 삭제.

기본은 미리보기(삭제 안 함). 실제 적용은 --apply.
  python cleanup_accounts.py          # 미리보기
  python cleanup_accounts.py --apply  # 실제 삭제 + PIN 설정

⚠️ 하드 삭제(되돌릴 수 없음). 반드시 미리보기로 확인 후 --apply.
"""
import sys
from passlib.context import CryptContext
from models.database import (
    SessionLocal, User, Guardian, UserPIN, Schedule, ScheduleLog,
    BehaviorLog, ScheduleTransition, DailyReport, GuardianNotification,
    ChatMessage, SuggestionLog,
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# 남길 짝: 보호자 username → 당사자 PIN. (보호자가 연결된 당사자를 그대로 남김)
KEEP = {"demo": "1234"}


def run(apply: bool):
    db = SessionLocal()
    try:
        keep_user_ids = set()
        for uname, pin in KEEP.items():
            g = db.query(Guardian).filter(Guardian.username == uname).first()
            if not g:
                print(f"⚠️  보호자 '{uname}' 없음 — 건너뜀")
                continue
            uid = g.user_id
            u = db.query(User).filter(User.id == uid).first()
            sch = db.query(Schedule).filter(Schedule.user_id == uid, Schedule.is_active == True).count()
            keep_user_ids.add(uid)
            print(f"KEEP  보호자 '{uname}' → 당사자 uid={uid}({u.name if u else '?'}), 일과 {sch}개, PIN→{pin}")
            if apply:
                rec = db.query(UserPIN).filter(UserPIN.user_id == uid, UserPIN.order == 1).first()
                if rec:
                    rec.correct_answer = pwd_context.hash(pin)
                else:
                    db.add(UserPIN(user_id=uid, order=1, question="PIN", correct_answer=pwd_context.hash(pin)))

        all_users = db.query(User).all()
        del_ids = [u.id for u in all_users if u.id not in keep_user_ids]
        print(f"\n삭제 대상 {len(del_ids)}명:")
        for u in all_users:
            if u.id not in keep_user_ids:
                gs = [x.username for x in db.query(Guardian).filter(Guardian.user_id == u.id).all()]
                print(f"  DELETE uid={u.id} name={u.name} 보호자={gs}")

        if not apply:
            print("\n[DRY RUN] 변경 없음. 실제 적용: python cleanup_accounts.py --apply")
            return

        for uid in del_ids:
            sch_ids = [s.id for s in db.query(Schedule).filter(Schedule.user_id == uid).all()]
            if sch_ids:
                db.query(ScheduleLog).filter(ScheduleLog.schedule_id.in_(sch_ids)).delete(synchronize_session=False)
            db.query(ScheduleLog).filter(ScheduleLog.user_id == uid).delete(synchronize_session=False)
            db.query(Schedule).filter(Schedule.user_id == uid).delete(synchronize_session=False)
            db.query(BehaviorLog).filter(BehaviorLog.user_id == uid).delete(synchronize_session=False)
            db.query(ScheduleTransition).filter(ScheduleTransition.user_id == uid).delete(synchronize_session=False)
            db.query(DailyReport).filter(DailyReport.user_id == uid).delete(synchronize_session=False)
            db.query(UserPIN).filter(UserPIN.user_id == uid).delete(synchronize_session=False)
            db.query(GuardianNotification).filter(GuardianNotification.user_id == uid).delete(synchronize_session=False)
            db.query(ChatMessage).filter(ChatMessage.user_id == uid).delete(synchronize_session=False)
            db.query(SuggestionLog).filter(SuggestionLog.user_id == uid).delete(synchronize_session=False)
            db.query(Guardian).filter(Guardian.user_id == uid).delete(synchronize_session=False)
            db.query(User).filter(User.id == uid).delete(synchronize_session=False)
        db.commit()
        print(f"\n✅ 완료: {len(del_ids)}명 + 데이터 삭제, KEEP {len(keep_user_ids)}명 PIN 설정.")
    finally:
        db.close()


if __name__ == "__main__":
    run("--apply" in sys.argv)
