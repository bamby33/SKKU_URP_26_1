"""일과 카테고리 분류 (productive | routine | fixed | sleep | rest)

- 우선 스케줄 생성 AI가 category를 직접 출력하고,
- 누락/기존 데이터엔 제목 키워드로 폴백 분류한다.
"""

import re

CATEGORIES = ("productive", "routine", "fixed", "sleep", "rest")

# 우선순위: sleep > fixed > productive > rest > routine(기본)
_SLEEP_KW      = ["취침", "수면", "자기", "잠자기", "잠자", "낮잠", "잠들"]  # '잠' 단독 제외('잠깐' 오탐)
_FIXED_KW      = ["복지관", "학교", "기관", "병원", "치료", "센터", "재활", "방문", "외출"]
_PRODUCTIVE_KW = ["숙제", "자습", "공부", "독서", "책", "그림", "미술", "운동", "체조",
                  "요리", "청소", "정리", "만들기", "연습", "학습", "글쓰기", "퍼즐"]
_REST_KW       = ["휴식", "쉬기", "쉬는", "놀이", "자유", "여가", "티비", "tv", "게임", "음악 감상", "낮잠"]
_ROUTINE_KW    = ["기상", "세면", "양치", "씻", "목욕", "샤워", "식사", "아침", "점심", "저녁",
                  "간식", "밥", "약", "복용", "산책", "위생", "화장실"]


def classify_category(title: str) -> str:
    t = (title or "").lower()
    def has(kws): return any(k.lower() in t for k in kws)
    if has(_SLEEP_KW):      return "sleep"
    if has(_FIXED_KW):      return "fixed"
    if has(_PRODUCTIVE_KW): return "productive"
    if has(_REST_KW):       return "rest"
    if has(_ROUTINE_KW):    return "routine"
    return "routine"  # 기본: 보수적(독려 X, 완전제외 X — 매일 하는 것 가정)


_INSTANT_KW = ["기상", "일어나", "복용", "투약", "출근", "등교", "등원",
               "퇴근", "하교", "하원", "세면", "양치", "씻"]


def is_instant(title: str) -> bool:
    """순간(점) 일과 — 수행시간 개념이 없는 일과(기상·약 복용·세면·양치 등).
    끝 시간/진행중/duration 없이 '했어요/안했어요'로만 기록. time_adjust(시간단축) 대상에서 제외."""
    t = title or ""
    return any(k in t for k in _INSTANT_KW)


def is_bedtime(title: str) -> bool:
    """밤 취침 여부(낮잠 제외) — 시작/완료/달성 대상이 아닌 특수 일과.
    달성률 계산·목록에서 제외하고 '취침 중'으로만 표시하는 데 사용."""
    t = title or ""
    return any(k in t for k in _SLEEP_KW) and "낮잠" not in t


def normalize_category(value: str | None, title: str) -> str:
    """AI가 준 category가 유효하면 그대로, 아니면 제목으로 폴백 분류."""
    if value and value.strip().lower() in CATEGORIES:
        return value.strip().lower()
    return classify_category(title)


# 흔한 접미어 — 동일 활동의 표기 차이 흡수 ('운동'='운동 시간', '독서'='독서 하기')
_NAME_SUFFIXES = ("시간", "하기", "하는시간", "타임")


def canonical_key(title: str) -> str:
    """동일 활동 묶음용 정규 키.
    이모지·기호·공백 제거 + 흔한 접미어 제거 → '운동'과 '운동 시간'을 같은 키로 본다.
    집계/제안에서 같은 일과가 표기 차이로 갈라지지 않게 하는 단일 소스."""
    t = re.sub(r"[^\w가-힣]", "", (title or ""), flags=re.UNICODE).lower()
    changed = True
    while changed:
        changed = False
        for suf in _NAME_SUFFIXES:
            if t.endswith(suf) and len(t) > len(suf):
                t = t[: -len(suf)]
                changed = True
    return t or re.sub(r"[^\w가-힣]", "", (title or ""), flags=re.UNICODE).lower() or (title or "").strip()
