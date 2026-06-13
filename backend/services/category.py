"""일과 카테고리 분류 (productive | routine | fixed | sleep | rest)

- 우선 스케줄 생성 AI가 category를 직접 출력하고,
- 누락/기존 데이터엔 제목 키워드로 폴백 분류한다.
"""

CATEGORIES = ("productive", "routine", "fixed", "sleep", "rest")

# 우선순위: sleep > fixed > productive > rest > routine(기본)
_SLEEP_KW      = ["취침", "수면", "자기", "잠자기", "잠"]
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


def normalize_category(value: str | None, title: str) -> str:
    """AI가 준 category가 유효하면 그대로, 아니면 제목으로 폴백 분류."""
    if value and value.strip().lower() in CATEGORIES:
        return value.strip().lower()
    return classify_category(title)
