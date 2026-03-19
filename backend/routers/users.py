"""사용자 & 보호자 CRUD API"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from models.database import get_db, User, Guardian, DisabilityType, DisabilityLevel
from agents.tools.personalization import personalize_user

router = APIRouter(prefix="/users", tags=["users"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class GuardianCreate(BaseModel):
    name: str
    phone: str
    email: str | None = None


class UserCreate(BaseModel):
    name: str
    disability_type: DisabilityType
    disability_level: DisabilityLevel
    special_notes: str | None = None
    guardian: GuardianCreate


class UserResponse(BaseModel):
    id: int
    name: str
    disability_type: str
    disability_level: str
    special_notes: str | None
    feedback_mode: str

    class Config:
        from_attributes = True


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/", response_model=UserResponse)
def create_user(data: UserCreate, db: Session = Depends(get_db)):
    """사용자 + 보호자 등록 (초기 설정)"""
    user = User(
        name=data.name,
        disability_type=data.disability_type,
        disability_level=data.disability_level,
        special_notes=data.special_notes,
    )
    db.add(user)
    db.flush()

    guardian = Guardian(
        user_id=user.id,
        name=data.guardian.name,
        phone=data.guardian.phone,
        email=data.guardian.email,
    )
    db.add(guardian)
    db.commit()
    db.refresh(user)

    # 사용자 개별화 Tool 자동 실행
    personalize_user(user_id=user.id)

    return user


@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    return user


@router.get("/")
def list_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return [{"id": u.id, "name": u.name, "disability_type": u.disability_type} for u in users]
