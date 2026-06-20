"""계정 진단 — 각 사용자의 PIN 등록 여부 + 연결된 보호자 계정을 출력 (읽기 전용).
사용: python whoami.py
"""
from models.database import SessionLocal, User, UserPIN, Guardian

db = SessionLocal()
try:
    users = db.query(User).order_by(User.id).all()
    for u in users:
        pin = db.query(UserPIN).filter(UserPIN.user_id == u.id, UserPIN.order == 1).first()
        guards = db.query(Guardian).filter(Guardian.user_id == u.id).all()
        g_str = ", ".join(f"{g.username}(name={g.name})" for g in guards) or "없음"
        print(f"uid={u.id:<3} name={u.name:<12} 당사자PIN={'있음' if pin else '없음'}  보호자계정=[{g_str}]")
finally:
    db.close()
