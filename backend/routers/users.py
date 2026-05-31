"""사용자 & 보호자 CRUD API"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from passlib.context import CryptContext
from models.database import get_db, User, Guardian, UserPIN, DisabilityType, DisabilityLevel
from agents.tools.personalization import personalize_user
import json
import random

router = APIRouter(prefix="/users", tags=["users"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Schemas ────────────────────────────────────────────────────────────────────

class GuardianCreate(BaseModel):
    name: str
    phone: str
    email: str | None = None
    username: str
    password: str


class UserCreate(BaseModel):
    name: str
    disability_type: DisabilityType
    disability_level: DisabilityLevel
    special_notes: str | None = None
    theme_color: str = "#3B4A6B"
    guardian: GuardianCreate


class UserResponse(BaseModel):
    id: int
    name: str
    disability_type: str
    disability_level: str
    special_notes: str | None
    feedback_mode: str
    theme_color: str

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
        theme_color=data.theme_color,
    )
    db.add(user)
    db.flush()

    # 아이디 중복 확인
    if db.query(Guardian).filter(Guardian.username == data.guardian.username).first():
        raise HTTPException(status_code=400, detail="이미 사용 중인 아이디입니다.")

    guardian = Guardian(
        user_id=user.id,
        name=data.guardian.name,
        phone=data.guardian.phone,
        email=data.guardian.email,
        username=data.guardian.username,
        hashed_password=pwd_context.hash(data.guardian.password),
    )
    db.add(guardian)
    db.commit()
    db.refresh(user)

    # 사용자 개별화 Tool 자동 실행
    personalize_user(user_id=user.id)

    return user


@router.get("/check-username/{username}")
def check_username(username: str, db: Session = Depends(get_db)):
    """아이디 중복 확인"""
    exists = db.query(Guardian).filter(Guardian.username == username).first() is not None
    return {"available": not exists}


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


# ── 로그인 ──────────────────────────────────────────────────────────────────────

class LoginResponse(BaseModel):
    user_id: int
    name: str
    role: str


class GuardianLoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login/guardian", response_model=LoginResponse)
def guardian_login(data: GuardianLoginRequest, db: Session = Depends(get_db)):
    """보호자 아이디/비밀번호 로그인"""
    guardian = db.query(Guardian).filter(Guardian.username == data.username).first()
    if not guardian or not pwd_context.verify(data.password, guardian.hashed_password):
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다.")

    user = db.query(User).filter(User.id == guardian.user_id).first()
    return LoginResponse(user_id=user.id, name=guardian.name, role="guardian")


@router.get("/login/user/{user_id}", response_model=LoginResponse)
def user_biometric_verify(user_id: int, db: Session = Depends(get_db)):
    """당사자 생체인식 로그인 — 기기 인증 후 user_id 유효성 확인"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    return LoginResponse(user_id=user.id, name=user.name, role="user")


# ── 숫자 PIN ────────────────────────────────────────────────────────────────────

class PINSetupRequest(BaseModel):
    pin: str  # 4자리 숫자


class PINLoginRequest(BaseModel):
    user_id: int
    pin: str


@router.post("/pin-login")
def pin_login(data: PINLoginRequest, db: Session = Depends(get_db)):
    """당사자 4자리 숫자 PIN 로그인"""
    user = db.query(User).filter(User.id == data.user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="사용자를 찾을 수 없습니다.")

    record = db.query(UserPIN).filter(UserPIN.user_id == data.user_id, UserPIN.order == 1).first()
    if not record or not pwd_context.verify(data.pin, record.correct_answer):
        raise HTTPException(status_code=401, detail="PIN이 올바르지 않아요.")

    return {"user_id": user.id, "name": user.name}


@router.post("/{user_id}/pins")
def setup_pins(user_id: int, data: PINSetupRequest, db: Session = Depends(get_db)):
    """보호자가 당사자의 4자리 숫자 PIN 등록"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    if not data.pin.isdigit() or len(data.pin) != 4:
        raise HTTPException(status_code=400, detail="4자리 숫자를 입력해주세요.")

    db.query(UserPIN).filter(UserPIN.user_id == user_id).delete()
    db.add(UserPIN(
        user_id=user_id,
        order=1,
        question="pin",
        correct_answer=pwd_context.hash(data.pin),
        correct_emoji="🔢",
        wrong_options="[]",
    ))
    db.commit()
    return {"message": "PIN 설정 완료"}
