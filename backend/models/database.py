from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, Float, ForeignKey, Enum, Text
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from datetime import datetime
import enum
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./care_agent.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Enums ──────────────────────────────────────────────────────────────────────

class DisabilityType(str, enum.Enum):
    INTELLECTUAL = "intellectual"   # 지적장애
    AUTISM = "autism"               # 자폐스펙트럼


class DisabilityLevel(str, enum.Enum):
    MILD = "mild"           # 경도
    MODERATE = "moderate"   # 중도
    SEVERE = "severe"       # 고도  (서비스 대상 외)


class FeedbackStage(str, enum.Enum):
    STAGE_1 = "stage_1"  # 사전 신호 감지
    STAGE_2 = "stage_2"  # 문제 행동 중
    STAGE_3 = "stage_3"  # 진정 후


class ScheduleStatus(str, enum.Enum):
    PENDING = "pending"
    ACHIEVED = "achieved"
    MISSED = "missed"


# ── Models ─────────────────────────────────────────────────────────────────────

class User(Base):
    """발달장애인 사용자"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    disability_type = Column(Enum(DisabilityType), nullable=False)
    disability_level = Column(Enum(DisabilityLevel), nullable=False)
    special_notes = Column(Text, nullable=True)          # 특이사항 (보호자 입력)
    feedback_mode = Column(String, default="auto")       # auto | text | voice | button
    created_at = Column(DateTime, default=datetime.utcnow)

    guardian = relationship("Guardian", back_populates="user", uselist=False)
    schedules = relationship("Schedule", back_populates="user")
    behavior_logs = relationship("BehaviorLog", back_populates="user")


class Guardian(Base):
    """보호자"""
    __tablename__ = "guardians"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    email = Column(String, nullable=True)
    username = Column(String, unique=True, nullable=True)    # 로그인 아이디
    hashed_password = Column(String, nullable=True)          # bcrypt 해시
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="guardian")


class Schedule(Base):
    """스케줄 항목"""
    __tablename__ = "schedules"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String, nullable=False)              # 예: "아침 식사"
    scheduled_time = Column(String, nullable=False)     # "09:00" 형식
    days_of_week = Column(String, default="0,1,2,3,4,5,6")  # 0=월 ~ 6=일
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="schedules")
    logs = relationship("ScheduleLog", back_populates="schedule")


class ScheduleLog(Base):
    """스케줄 달성 기록"""
    __tablename__ = "schedule_logs"

    id = Column(Integer, primary_key=True, index=True)
    schedule_id = Column(Integer, ForeignKey("schedules.id"))
    status = Column(Enum(ScheduleStatus), default=ScheduleStatus.PENDING)
    log_date = Column(DateTime, default=datetime.utcnow)
    note = Column(Text, nullable=True)

    schedule = relationship("Schedule", back_populates="logs")


class BehaviorLog(Base):
    """문제 행동 및 피드백 기록"""
    __tablename__ = "behavior_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    stage = Column(Enum(FeedbackStage), nullable=False)
    trigger = Column(String, nullable=True)             # 감지 방식 (voice/gps/manual)
    decibel_level = Column(Float, nullable=True)        # 음성 데시벨
    ai_response = Column(Text, nullable=True)           # AI가 한 말
    guardian_notified = Column(Boolean, default=False)
    logged_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="behavior_logs")


class UserPIN(Base):
    """당사자 취향 기반 로그인 PIN (3문제)"""
    __tablename__ = "user_pins"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    order = Column(Integer, nullable=False)               # 1, 2, 3
    question = Column(String, nullable=False)             # "제일 좋아하는 음식은?"
    correct_answer = Column(String, nullable=False)       # "치킨"
    correct_emoji = Column(String, nullable=False)        # "🍗"
    wrong_options = Column(Text, nullable=False)          # JSON 문자열


class ChatMessage(Base):
    """AI-사용자 대화 기록"""
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    role = Column(String, nullable=False)    # "assistant" | "user"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


def init_db():
    Base.metadata.create_all(bind=engine)
