# 발달장애인 돌봄 에이전트 AI

> SKKU URP 26-1 팀 프로젝트

발달장애인의 일관된 스케줄 및 루틴 관리를 지원하는 AI 케어 에이전트입니다.

---

## 기술 스택

- **Backend**: Python, FastAPI, SQLite (SQLAlchemy), APScheduler
- **AI**: Ollama + LLaMA 3.1 8B (로컬 오픈소스)
- **Frontend**: React Native (Expo)
- **DB**: SQLite (개발) → PostgreSQL (운영 예정)

---

## 프로젝트 구조

```
backend/
├── main.py                      # FastAPI 진입점
├── .env                         # 환경변수 (커밋 안 됨)
├── requirements.txt
├── models/database.py           # DB 모델 (User, Guardian, Schedule 등)
├── agents/
│   ├── care_agent.py            # AI 에이전트 핵심 로직
│   └── tools/
│       ├── personalization.py   # Tool 1: 사용자 개별화
│       ├── schedule_check.py    # Tool 2: 스케줄 달성 확인
│       ├── feedback.py          # Tool 3: 단계별 피드백 (1~3단계)
│       ├── detect.py            # Tool 4: 사용자 반응 감지 (데시벨/GPS/텍스트)
│       └── messaging.py         # Tool 5: 보호자 메시지 발신
├── routers/
│   ├── users.py                 # 사용자/보호자 API
│   ├── schedules.py             # 스케줄 관리 API
│   └── chat.py                  # AI 대화 API (REST + WebSocket)
└── scheduler/jobs.py            # 자동 스케줄 알림 (APScheduler)
```

---

## 핵심 기능 (5개 Tool)

| Tool | 설명 |
|------|------|
| 사용자 개별화 | 장애 종류/정도 → 스케줄표 + 피드백 방식 자동 설정 |
| 스케줄 달성 확인 | 달성 여부 기록 + 오늘 달성률 계산 |
| 단계별 피드백 | 사전신호(1단계) → 문제행동 중(2단계) → 진정 후(3단계) |
| 사용자 반응 감지 | 데시벨(50/70/85dB 기준), GPS, 텍스트 키워드로 상태 감지 |
| 메시지 발신 | 보호자 일일 리포트 / 긴급 알림 |

---

## 시작하기

**1. Ollama 모델 다운로드**
```bash
ollama pull llama3.1
```

**2. 백엔드 실행**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

API 문서: `http://localhost:8000/docs`

---

## 진행 상황

- [x] 백엔드 초기 구조
- [x] 5개 Tool 구현
- [x] GitHub 연결
- [ ] Ollama 모델 세팅 및 테스트
- [ ] React Native 프론트엔드
