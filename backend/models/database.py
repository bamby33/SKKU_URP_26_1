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
    theme_color = Column(String, default="#3B4A6B")      # 당사자 테마 색
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
    push_token = Column(String, nullable=True)               # Expo 푸시 토큰
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="guardian")


class Schedule(Base):
    """스케줄 항목"""
    __tablename__ = "schedules"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    title = Column(String, nullable=False)              # 예: "아침 식사"
    scheduled_time = Column(String, nullable=False)     # "09:00" 형식 (시작 시간)
    end_time = Column(String, nullable=True)            # "09:30" 형식 (종료 시간)
    color = Column(String, nullable=True)               # 블록 색상 "#RRGGBB"
    days_of_week = Column(String, default="0,1,2,3,4,5,6")  # 0=월 ~ 6=일
    is_active = Column(Boolean, default=True)
    is_fixed = Column(Boolean, default=False)
    category = Column(String, nullable=True)            # productive(숙제·자습·취미·운동) | routine(식사·위생·수면) | other
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="schedules")
    logs = relationship("ScheduleLog", back_populates="schedule")


class ScheduleLog(Base):
    """스케줄 달성 기록"""
    __tablename__ = "schedule_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    schedule_id = Column(Integer, ForeignKey("schedules.id"), index=True)
    status = Column(Enum(ScheduleStatus), default=ScheduleStatus.PENDING)
    log_date = Column(DateTime, default=datetime.utcnow)
    note = Column(Text, nullable=True)                    # 미수행 사유 / 메모
    refusal_count = Column(Integer, default=0)            # (구) '안했어요' 횟수 — 호환 유지
    # ── 동행 파이프라인 (시작/진행/종료) ──
    response_type = Column(String, nullable=True)         # started | later | no_response (시작 알림 반응)
    started_at = Column(DateTime, nullable=True)          # 일과 시작 시각
    ended_at = Column(DateTime, nullable=True)            # 일과 종료 시각
    actual_duration_min = Column(Integer, nullable=True)  # 실제 진행 시간(분)
    early_stop = Column(Boolean, default=False)           # 예정보다 일찍 '그만할래요'
    ai_summary = Column(Text, nullable=True)              # 거절/중도포기 사유의 AI 요약 (보호자용)
    # ── 전환 지연 (Phase 3) — '다 했어요' 시각 − 다음 일과 시작 시각(분). 음수=원활, 양수=지연 ──
    transition_delay_min = Column(Integer, nullable=True) # 완료 시에만 측정 (early_stop은 측정 안 함)
    next_schedule_id = Column(Integer, nullable=True)     # 전환 구간 식별용 (A→B의 B)

    schedule = relationship("Schedule", back_populates="logs")


class BehaviorLog(Base):
    """문제 행동 및 피드백 기록"""
    __tablename__ = "behavior_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    schedule_id = Column(Integer, ForeignKey("schedules.id"), nullable=True, index=True)
    stage = Column(Enum(FeedbackStage), nullable=False)
    trigger = Column(String, nullable=True)             # 감지 방식 (voice/gps/manual)
    context = Column(String, nullable=True)             # transition(시작/전환) | in_activity(수행 중) | spontaneous
    decibel_level = Column(Float, nullable=True)        # 음성 데시벨
    ai_response = Column(Text, nullable=True)           # AI가 한 말
    note = Column(Text, nullable=True)                  # 팔로업 대화에서 파악한 행동 원인
    guardian_notified = Column(Boolean, default=False)
    is_read = Column(Boolean, default=False)            # 보호자가 확인했는지
    logged_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="behavior_logs")


class DailyReport(Base):
    """일일 일과 종료 후 AI 분석 리포트"""
    __tablename__ = "daily_reports"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    report_date = Column(String, nullable=False)        # "YYYY-MM-DD"
    ai_summary = Column(Text, nullable=True)            # AI 3-4문장 분석
    achieved = Column(Integer, default=0)
    total = Column(Integer, default=0)
    self_assessment = Column(String, nullable=True)     # good | soso | bad (당사자 "오늘 어땠나요?")
    is_complete = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class UserPIN(Base):
    """당사자 취향 기반 로그인 PIN (3문제)"""
    __tablename__ = "user_pins"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    order = Column(Integer, nullable=False)               # 1, 2, 3
    question = Column(String, nullable=False)             # "제일 좋아하는 음식은?"
    correct_answer = Column(String, nullable=False)       # "치킨"
    correct_emoji = Column(String, nullable=False)        # "🍗"
    wrong_options = Column(Text, nullable=False)          # JSON 문자열



class ScheduleTransition(Base):
    """일과 간 전환 결과 — 자폐 전환 어려움 분석/다음날 최적화용"""
    __tablename__ = "schedule_transitions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    from_schedule_id = Column(Integer, ForeignKey("schedules.id"), nullable=True, index=True)
    to_schedule_id = Column(Integer, ForeignKey("schedules.id"), index=True)
    result = Column(String, nullable=False)             # accepted | refused | no_response
    log_date = Column(DateTime, default=datetime.utcnow)


class SuggestionLog(Base):
    """AI 스케줄 추천 표시/수락 기록 — 연구 Q3 'AI 추천 수락률' 측정용.
    action='shown'(제안 표시) vs 'accepted'(수락 적용). 수락률 = accepted ÷ shown."""
    __tablename__ = "suggestion_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    suggestion_type = Column(String, nullable=False)    # shorten | rest | reduce
    schedule_id = Column(Integer, nullable=True)         # 대상 일과 (rest 등은 없을 수 있음)
    action = Column(String, nullable=False)              # shown | accepted
    log_date = Column(DateTime, default=datetime.utcnow)


class GuardianNotification(Base):
    """보호자가 일과 수정 시 당사자에게 전달되는 알림"""
    __tablename__ = "guardian_notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    message = Column(String, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ChatMessage(Base):
    """AI-사용자 대화 기록"""
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    role = Column(String, nullable=False)    # "assistant" | "user"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


def _migrate_sqlite():
    """기존 SQLite DB에 신규 컬럼을 추가 (데이터 보존). SQLite는 ADD COLUMN 지원."""
    from sqlalchemy import inspect, text
    inspector = inspect(engine)
    table_names = inspector.get_table_names()

    # (테이블, 컬럼, 정의) — 컬럼이 없을 때만 ADD
    additions = [
        ("schedules", "end_time", "VARCHAR"),
        ("schedules", "color", "VARCHAR"),
        ("schedules", "is_fixed", "BOOLEAN DEFAULT 0"),
        ("guardians", "push_token", "VARCHAR"),
        ("schedule_logs", "user_id", "INTEGER"),
        ("schedule_logs", "refusal_count", "INTEGER DEFAULT 0"),
        ("schedule_logs", "response_type", "VARCHAR"),
        ("schedule_logs", "started_at", "DATETIME"),
        ("schedule_logs", "ended_at", "DATETIME"),
        ("schedule_logs", "actual_duration_min", "INTEGER"),
        ("schedule_logs", "early_stop", "BOOLEAN DEFAULT 0"),
        ("schedule_logs", "ai_summary", "TEXT"),
        ("schedule_logs", "transition_delay_min", "INTEGER"),
        ("schedule_logs", "next_schedule_id", "INTEGER"),
        ("behavior_logs", "context", "VARCHAR"),
        ("schedules", "category", "VARCHAR"),
        ("daily_reports", "self_assessment", "VARCHAR"),
    ]
    with engine.begin() as conn:
        for table, column, coldef in additions:
            if table not in table_names:
                continue
            existing = {c["name"] for c in inspector.get_columns(table)}
            if column not in existing:
                conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {column} {coldef}'))


def init_db():
    Base.metadata.create_all(bind=engine)
    try:
        _migrate_sqlite()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"SQLite migration skipped: {e}")
