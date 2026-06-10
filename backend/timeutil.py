"""KST(한국 표준시) 기준 시간 헬퍼.

DB의 naive datetime을 KST 기준으로 일관되게 다루기 위함.
- log_date 등은 kst_now()로 저장
- '오늘' 경계는 kst_today_start()로 비교
이렇게 하면 UTC 서버에서도 새벽 일과가 전날로 집계되는 문제가 없다.
"""
from datetime import datetime, timedelta

KST = timedelta(hours=9)


def kst_now() -> datetime:
    """현재 시각(KST, naive)."""
    return datetime.utcnow() + KST


def kst_today_start() -> datetime:
    """오늘 00:00(KST, naive)."""
    n = kst_now()
    return datetime(n.year, n.month, n.day)


def kst_weekday() -> int:
    """오늘 요일 (0=월 ~ 6=일, KST)."""
    return kst_now().weekday()
