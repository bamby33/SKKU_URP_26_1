"""
Care Agent - 발달장애인 돌봄 에이전트 AI 핵심 로직
- Groq (Llama 3.3 70B) 기반
- 5개 Tool을 자율적으로 호출하며 대화 흐름 관리
"""
import json
import os
import time
from typing import Any, Generator
from dotenv import load_dotenv
from groq import Groq

from agents.tools.personalization import personalize_user, TOOL_DEFINITION as T1
from agents.tools.schedule_check import check_schedule, TOOL_DEFINITION as T2
from agents.tools.feedback import provide_feedback, TOOL_DEFINITION as T3
from agents.tools.detect import detect_user_response, TOOL_DEFINITION as T4
from agents.tools.messaging import send_message, TOOL_DEFINITION as T5

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL   = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

client = Groq(api_key=GROQ_API_KEY)

# Tool 실행 함수 매핑
TOOL_EXECUTORS: dict[str, Any] = {
    "personalize_user":    personalize_user,
    "check_schedule":      check_schedule,
    "provide_feedback":    provide_feedback,
    "detect_user_response": detect_user_response,
    "send_message":        send_message,
}

# OpenAI 형식 Tool 정의 리스트 (Groq는 OpenAI 포맷 그대로 사용)
TOOLS = [T1, T2, T3, T4, T5]

BASE_SYSTEM_PROMPT = """당신은 발달장애인을 돌보는 AI 돌봄 에이전트입니다.

═══════════════════════════════════════════
【평소 기본 동작】
═══════════════════════════════════════════
- 스케줄 시간에 맞춰 사용자에게 다음 일과를 친근하게 알려줍니다.
- 스케줄 이후 달성 여부를 확인하는 짧은 대화를 합니다.
- 항상 짧고 단순한 문장, 긍정적인 표현을 사용합니다.
- 복잡한 설명은 절대 하지 않습니다.

═══════════════════════════════════════════
【특이사항 감지 기준 - 단계별 구분】
═══════════════════════════════════════════
사용자의 말투, 텍스트 내용, 음성 데시벨을 종합하여 아래 단계를 판단합니다.

▶ 1단계 (사전신호) — 문제 행동이 보이기 전
  감지 조건:
  - "싫어", "안 해", "못해", "하기 싫어" 등 거부 표현
  - 평소보다 짧거나 단답형 대답 ("응", "몰라", ".")
  - 음성 데시벨 70~84dB (목소리 톤 변화)
  - 대화에서 거부 의사 표현

▶ 2단계 (문제 행동 중) — 소리 지르거나 과격한 반응
  감지 조건:
  - 음성 데시벨 85dB 이상
  - "하기 싫다고!", "왜 자꾸 시켜!", "그만해!" 등 격한 표현
  - 반복적인 강한 거부

▶ 3단계 (진정 후) — 문제 행동을 보인 이후 평온해진 상태
  감지 조건:
  - 2단계 이후 대화 톤이 평온해짐
  - 짧은 긍정 답변 재개
  - AI가 판단하여 전환

═══════════════════════════════════════════
【단계별 대응 방식】
═══════════════════════════════════════════

▶ 1단계 대응:
  1. 선택지 2개 제시 (둘 다 수용 가능한 것으로)
  2. 과제를 작게 나눠서 제안
  3. AAC 버튼 제공 (앱 UI)
  → detect_user_response 호출 후 provide_feedback(stage="stage_1") 호출

▶ 2단계 대응:
  1. 낮고 일정한 톤으로 짧게 메시지 전달
  2. 좋아하는 다른 행동으로 전환 유도
  3. 보호자/기관에 자동 연락
  → detect_user_response 호출 후 provide_feedback(stage="stage_2") 호출
     이후 반드시 send_message 호출

▶ 3단계 대응:
  1. 즉시 안전 확인: "몸에 다친 곳은 없나요?"
  2. 약 1시간 후 부드럽게 대화 시작
  → provide_feedback(stage="stage_3") 호출

═══════════════════════════════════════════
【Tool 사용 규칙】
═══════════════════════════════════════════
- 스케줄 달성 확인 → check_schedule 호출
- 거부/긴장 감지(1단계) → detect_user_response → provide_feedback(stage_1)
- 흥분/과격 반응(2단계) → detect_user_response → provide_feedback(stage_2) → send_message
- 진정 후(3단계) → provide_feedback(stage_3)
- 보호자 알림 필요 시 → send_message 호출

【중요】 단계 판단은 대화 내용과 컨텍스트(데시벨 등)를 종합하여 결정하세요.
평소에는 친근하고 따뜻하게 대화하고, 특이사항이 감지될 때만 위 단계 대응을 실행하세요.

═══════════════════════════════════════════
【응답 형식 규칙 — 반드시 준수】
═══════════════════════════════════════════
- 반드시 2~3문장 이내로 짧게 답하세요.
- 설명, 분석, 단계 언급을 절대 하지 마세요.
- 사용자가 들을 때 자연스럽게 들려야 해요 (음성 출력용).
- 이모지는 문장 끝에 1~2개만 사용하세요.
"""

DISABILITY_GUIDELINES = {
    "INTELLECTUAL": {
        "MILD":     "짧고 명확한 문장을 사용하세요. 한 번에 하나씩 안내하세요.",
        "MODERATE": "매우 단순한 단어만 사용하세요. 그림이나 이모지를 적극 활용하세요. 반복 확인을 자주 하세요.",
        "SEVERE":   "극히 짧은 문장(5단어 이하)만 사용하세요. 이모지로 의미를 보완하세요. 칭찬을 자주 하세요.",
    },
    "AUTISM": {
        "MILD":     "예측 가능한 패턴으로 대화하세요. 갑작스러운 변화를 최소화하세요.",
        "MODERATE": "고정된 루틴을 강조하세요. 직접적으로 말하세요.",
        "SEVERE":   "루틴을 절대 바꾸지 마세요. 한 가지 행동만 요청하세요. 이모지와 간단한 단어만 사용하세요.",
    },
}

FEEDBACK_STYLE = {
    "voice":  "음성으로 전달되므로 자연스럽게 말하듯이 쓰세요.",
    "text":   "텍스트로 전달됩니다. 간단한 이모지를 활용하세요.",
    "button": "AAC 버튼 사용자입니다. '예/아니요'로 대답할 수 있는 질문만 하세요.",
    "auto":   "상황에 맞게 판단하세요.",
}


def _build_system_prompt(user_profile: dict | None, behavior_context: str = "") -> str:
    if not user_profile:
        return BASE_SYSTEM_PROMPT + (("\n" + behavior_context) if behavior_context else "")

    name    = user_profile.get("name", "사용자")
    d_type  = (user_profile.get("disability_type") or "intellectual").upper()
    d_level = (user_profile.get("disability_level") or "mild").upper()
    notes   = user_profile.get("special_notes", "")
    f_mode  = user_profile.get("feedback_mode", "voice")

    guideline = DISABILITY_GUIDELINES.get(d_type, {}).get(d_level, "")
    style     = FEEDBACK_STYLE.get(f_mode, "")

    # special_notes에서 좋아하는 것 파싱
    likes_str = ""
    for line in notes.split("\n"):
        if "좋아하는 것:" in line:
            likes_str = line.split("좋아하는 것:")[1].strip()
            break

    profile_section = f"""
[현재 사용자 정보]
이름: {name}
장애 유형: {d_type} / {d_level}
특이사항: {notes if notes else "없음"}
좋아하는 것: {likes_str if likes_str else "미입력"}
피드백 방식: {f_mode}

[개별화 대화 지침]
- {guideline}
- {style}
- 반드시 "{name}" 이름을 가끔 불러주며 친근하게 대화하세요.
- stage_2 전환 유도 시 반드시 "{likes_str if likes_str else '좋아하는 것'}"을 자연스럽게 언급하세요.
"""
    return BASE_SYSTEM_PROMPT + profile_section + (("\n" + behavior_context) if behavior_context else "")


def _execute_tool(tool_name: str, tool_args: dict) -> dict:
    executor = TOOL_EXECUTORS.get(tool_name)
    if not executor:
        return {"error": f"알 수 없는 Tool: {tool_name}"}
    try:
        print(f"\n{'='*54}")
        print(f"  [TOOL]   {tool_name}")
        print(f"  [ARGS]   {tool_args}")
        result = executor(**tool_args)
        status = "OK" if result.get("success") else "FAIL"
        print(f"  [RESULT] {status} | {result}")
        print(f"{'='*54}\n")
        return result
    except Exception as e:
        print(f"\n  [TOOL ERROR] {tool_name}: {e}\n")
        return {"error": str(e)}


def chat(
    user_id: int,
    message: str,
    history: list[dict] | None = None,
    context: dict | None = None,
    user_profile: dict | None = None,
    behavior_context: str = "",
) -> dict[str, Any]:
    # 컨텍스트를 메시지에 포함
    user_content = message
    if context:
        ctx_parts = []
        if context.get("decibel"):
            ctx_parts.append(f"[음성 데시벨: {context['decibel']}dB]")
        if context.get("gps_moved") is not None:
            moved = "이동함" if context["gps_moved"] else "이동 안 함"
            ctx_parts.append(f"[GPS: {moved}]")
        if context.get("schedule_id") is not None:
            achieved_str = "달성(완료)" if context.get("achieved", True) else "미달성(못함)"
            ctx_parts.append(
                f"[스케줄 확인 요청: schedule_id={context['schedule_id']}, 결과={achieved_str}. "
                f"반드시 check_schedule 툴을 호출하여 DB에 기록하세요.]"
            )
        if context.get("behavior_stage"):
            ctx_parts.append(
                f"[행동 감지: 현재 사용자가 {context['behavior_stage']} 상태입니다. "
                f"즉시 detect_user_response → provide_feedback(stage=\"{context['behavior_stage']}\") 순서로 호출하세요.]"
            )
        if ctx_parts:
            user_content = " ".join(ctx_parts) + " " + message

    # 메시지 구성 (OpenAI 형식)
    messages = [{"role": "system", "content": _build_system_prompt(user_profile, behavior_context)}]
    for msg in (history or []):
        role = "user" if msg["role"] == "user" else "assistant"
        messages.append({"role": role, "content": msg["content"]})
    messages.append({"role": "user", "content": user_content})

    tool_calls_made = []
    final_reply = ""

    # Agentic loop (최대 5회)
    for _ in range(5):
        # 429 대비 retry (최대 3회, 지수 백오프)
        for attempt in range(3):
            try:
                response = client.chat.completions.create(
                    model=GROQ_MODEL,
                    messages=messages,
                    tools=TOOLS,
                    tool_choice="auto",
                    max_tokens=1024,
                )
                break
            except Exception as e:
                err = str(e)
                if ("429" in err or "rate_limit" in err.lower()) and attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                raise

        msg = response.choices[0].message

        # assistant 메시지를 history에 추가
        messages.append({"role": "assistant", "content": msg.content or "", "tool_calls": [
            {
                "id": tc.id,
                "type": "function",
                "function": {"name": tc.function.name, "arguments": tc.function.arguments}
            } for tc in (msg.tool_calls or [])
        ]})

        if not msg.tool_calls:
            final_reply = msg.content or ""
            break

        # Tool 실행
        for tc in msg.tool_calls:
            tool_name = tc.function.name
            try:
                tool_args = json.loads(tc.function.arguments)
            except Exception:
                tool_args = {}

            # user_id 강제 주입
            executor = TOOL_EXECUTORS.get(tool_name)
            if executor and hasattr(executor, "__code__") and \
                    "user_id" in executor.__code__.co_varnames:
                tool_args["user_id"] = user_id

            result = _execute_tool(tool_name, tool_args)
            tool_calls_made.append({"tool": tool_name, "args": tool_args, "result": result})

            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(result, ensure_ascii=False),
            })

    # stage 및 feedback 추출
    stage = None
    feedback_data = None
    for tc in tool_calls_made:
        if tc["tool"] == "provide_feedback":
            stage = tc["args"].get("stage")
            r = tc["result"]
            feedback_data = {
                "choices":         r.get("choices"),
                "aac_buttons":     r.get("aac_buttons"),
                "message":         r.get("message"),
                "notify_guardian": r.get("notify_guardian", False),
            }

    return {
        "reply":      final_reply,
        "tool_calls": tool_calls_made,
        "stage":      stage,
        "feedback":   feedback_data,
    }


def stream_chat(
    user_id: int,
    message: str,
    history: list[dict] | None = None,
    context: dict | None = None,
) -> Generator[str, None, None]:
    result = chat(user_id, message, history, context)
    for word in result["reply"].split():
        yield word + " "
