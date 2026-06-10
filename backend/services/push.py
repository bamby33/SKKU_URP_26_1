"""Expo 푸시 알림 발송 서비스

Expo Push API(https://exp.host/--/api/v2/push/send)로 보호자 기기에 푸시 전송.
토큰이 없거나 실패하면 콘솔 출력으로 폴백한다.
"""
import logging
import httpx

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def send_push(token: str | None, title: str, body: str, data: dict | None = None) -> bool:
    """단일 Expo 푸시 토큰으로 알림 전송. 성공 여부 반환."""
    if not token or not token.startswith("ExponentPushToken"):
        logger.info(f"[PUSH 미발송 - 토큰 없음/형식오류] {title}: {body}")
        return False

    payload = {
        "to": token,
        "title": title,
        "body": body,
        "sound": "default",
        "priority": "high",
        "data": data or {},
    }
    try:
        with httpx.Client(timeout=10) as client:
            res = client.post(
                EXPO_PUSH_URL,
                json=payload,
                headers={"Content-Type": "application/json", "Accept": "application/json"},
            )
        if res.status_code == 200:
            return True
        logger.error(f"[PUSH 실패] status={res.status_code} body={res.text[:200]}")
        return False
    except Exception as e:
        logger.error(f"[PUSH 예외] {e}")
        return False
