# 발달장애인 돌봄 에이전트 AI

> SKKU URP 26-1 팀 프로젝트

발달장애인의 일관된 스케줄 및 루틴 관리를 지원하는 AI 케어 에이전트입니다.

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Backend | Python 3.11+, FastAPI, SQLAlchemy, APScheduler |
| AI | Ollama + LLaMA 3.1 8B (로컬) |
| Frontend | React Native (Expo SDK 54) |
| DB | SQLite (개발) → PostgreSQL (운영 예정) |

---

## 프로젝트 구조

```
Urp_26_1/
├── backend/
│   ├── main.py                      # FastAPI 진입점
│   ├── .env                         # 환경변수 (커밋 안 됨 → .env.example 참고)
│   ├── .env.example                 # 환경변수 템플릿
│   ├── requirements.txt
│   ├── models/database.py           # DB 모델 (User, Guardian, Schedule 등)
│   ├── agents/
│   │   ├── care_agent.py            # AI 에이전트 핵심 로직
│   │   └── tools/
│   │       ├── personalization.py   # Tool 1: 사용자 개별화
│   │       ├── schedule_check.py    # Tool 2: 스케줄 달성 확인
│   │       ├── feedback.py          # Tool 3: 단계별 피드백 (1~3단계)
│   │       ├── detect.py            # Tool 4: 사용자 반응 감지
│   │       └── messaging.py         # Tool 5: 보호자 메시지 발신
│   ├── routers/
│   │   ├── users.py                 # 사용자/보호자 API
│   │   ├── schedules.py             # 스케줄 관리 API
│   │   └── chat.py                  # AI 대화 API (REST + WebSocket)
│   └── scheduler/jobs.py            # APScheduler 자동 알림
└── frontend/
    ├── App.tsx                      # 앱 진입점
    ├── src/
    │   ├── api/client.ts            # Axios API 클라이언트
    │   ├── navigation/AppNavigator.tsx
    │   ├── screens/
    │   │   ├── user/
    │   │   │   ├── ScheduleScreen.tsx    # 화면 1: 스케줄 공지
    │   │   │   ├── FeedbackScreen.tsx    # 화면 4: 미달성 피드백
    │   │   │   └── EmergencyScreen.tsx   # 화면 5: 문제행동 대응
    │   │   └── guardian/
    │   │       └── GuardianReportScreen.tsx  # 화면 2: 보호자 리포트
    │   └── theme/colors.ts
    └── package.json
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

## 개발 환경 설정

### 공통 필수 설치

- [Git](https://git-scm.com/)
- [Python 3.11+](https://www.python.org/)
- [Node.js LTS](https://nodejs.org/)
- [Android Studio](https://developer.android.com/studio) (에뮬레이터 사용 시)
- [Ollama](https://ollama.com/) (AI 기능 사용 시)

### Android Studio 설정 (에뮬레이터)

1. SDK Manager → **Android SDK API 34** 설치
2. Virtual Device Manager → **Pixel 8 (API 34)** 생성
3. 시스템 환경변수 추가:
   - `ANDROID_HOME` = `C:\Users\<사용자명>\AppData\Local\Android\Sdk`
   - `Path` 에 `%ANDROID_HOME%\platform-tools` 추가

---

## 백엔드 실행

```bash
cd backend

# 1. 가상환경 생성 및 활성화
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

# 2. 패키지 설치
pip install -r requirements.txt

# 3. 환경변수 설정
copy .env.example .env       # Windows
# cp .env.example .env       # Mac/Linux

# 4. 서버 실행
uvicorn main:app --reload
```

API 문서: http://localhost:8000/docs

---

## 프론트엔드 실행

```bash
cd frontend

# 1. 패키지 설치
npm install

# 2. 에뮬레이터 실행 (Android Studio에서 AVD 먼저 시작)

# 3. 앱 실행
npx expo start --android
```

> **에뮬레이터 접속 주소**: 백엔드는 `http://10.0.2.2:8000` (에뮬레이터 → 로컬호스트)

---

## AI 모델 설정 (Ollama)

```bash
# Ollama 설치 후
ollama pull llama3.1
```

> Ollama 없이도 스케줄/사용자 API는 정상 동작합니다.

---

## 진행 상황

- [x] 백엔드 초기 구조
- [x] 5개 Tool 구현
- [x] GitHub 연결
- [x] 프론트엔드 초기 구조 (화면 1, 2, 4, 5)
- [ ] 온보딩/초기 화면
- [ ] 탭 네비게이션 (사용자 / 보호자)
- [ ] 화면 3: 알림 화면
- [ ] 백엔드 API 연동
- [ ] Ollama 모델 세팅 및 테스트
