from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from models.database import init_db
from routers import users, schedules, chat
from scheduler.jobs import init_scheduler
import logging

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 시작 시
    init_db()
    init_scheduler()
    yield
    # 종료 시 (필요 시 cleanup)


app = FastAPI(
    title="발달장애인 돌봄 에이전트 AI",
    description="일관된 스케줄 및 루틴 관리를 위한 AI 케어 에이전트",
    version="0.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # 개발 중 전체 허용, 운영 시 React Native 앱 주소로 제한
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(schedules.router)
app.include_router(chat.router)


@app.get("/")
def root():
    return {"status": "ok", "service": "발달장애인 돌봄 에이전트 AI"}


@app.get("/health")
def health():
    return {"status": "healthy"}
