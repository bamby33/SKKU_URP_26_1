"""
Care Agent - 발달장애인 돌봄 에이전트 AI 핵심 로직
- Google GenAI SDK (Gemma) 기반
- 5개 Tool을 자율적으로 호출하며 대화 흐름 관리
"""
import json
import os
from typing import Any, Generator
from dotenv import load_dotenv
from google import genai
from google.genai import types

from agents.tools.personalization import personalize_user, TOOL_DEFINITION as T1
from agents.tools.schedule_check import check_schedule, TOOL_DEFINITION as T2
from agents.tools.feedback import provide_feedback, TOOL_DEFINITION as T3
from agents.tools.detect import detect_user_response, TOOL_DEFINITION as T4
from agents.tools.messaging import send_message, TOOL_DEFINITION as T5

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
GEMMA_MODEL = os.getenv("GEMMA_MODEL", "gemma-3-12b-it")

client = genai.Client(api_key=GOOGLE_API_KEY)

# Tool 실행 함수 매핑
TOOL_EXECUTORS: dict[str, Any] = {
    "personalize_user": personalize_user,
    "check_schedule": check_schedule,
    "provide_feedback": provide_feedback,
    "detect_user_response": detect_user_response,
    "send_message": send_message,
}

# OpenAI 형식 Tool 정의 → google-genai FunctionDeclaration 변환
def _build_tools(tool_defs: list[dict]) -> list[types.Tool]:
    declarations = []
    for tool in tool_defs:
        fn = tool["function"]
        declarations.append(
            types.FunctionDeclaration(
                name=fn["name"],
                description=fn["description"],
                parameters=fn["parameters"],
            )
        )
    return [types.Tool(function_declarations=declarations)]

TOOLS = _build_tools([T1, T2, T3, T4, T5])

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
  1. 선택지 2개 제시 (둘 다 수용 가능한 것으로):
     예) "지금 할까요, 3분 뒤에 할까요?"
     예) "세면대에서 할까요, 컵으로 할까요?"
  2. 과제를 작게 나눠서 제안:
     예) "치약만 올려보는 것부터 해볼까요?"
  3. AAC 버튼 제공 (앱 UI):
     "쉬고 싶어요" / "도와주세요" / "싫어요(대신 ~하고 싶어요)"
  → detect_user_response 호출 후 provide_feedback(stage="stage_1") 호출

▶ 2단계 대응:
  1. 낮고 일정한 톤으로 짧게 메시지 전달:
     예) "괜찮아요. 잠깐 쉬어요."
  2. 좋아하는 다른 행동으로 전환 유도:
     예) "좋아하는 음악 들어볼까요?"
  3. 보호자/기관에 자동 연락:
     send_message 호출로 보호자에게 알림 발송
  → detect_user_response 호출 후 provide_feedback(stage="stage_2") 호출
     이후 반드시 send_message 호출

▶ 3단계 대응:
  1. 즉시 안전 확인:
     "몸에 다친 곳은 없나요?"
  2. 약 1시간 후 (다음 대화 시) 부드럽게 대화 시작:
     "아까 어떤 기분이 들었는지 이야기해볼 수 있어요?"
  3. 쉬운 질문부터 시작, 사용자가 편해하면 점차 심화:
     "오늘 힘든 게 있었나요?" → "무엇 때문에 힘들었나요?" → "다음엔 어떻게 하면 좋을까요?"
  4. 대화 내용을 바탕으로 사용자 성향 학습
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
"""

# 장애 유형별 대화 지침
DISABILITY_GUIDELINES = {
    "INTELLECTUAL": {
        "MILD":     "짧고 명확한 문장을 사용하세요. 한 번에 하나씩 안내하세요.",
        "MODERATE": "매우 단순한 단어만 사용하세요. 그림이나 이모지를 적극 활용하세요. 반복 확인을 자주 하세요.",
        "SEVERE":   "극히 짧은 문장(5단어 이하)만 사용하세요. 이모지로 의미를 보완하세요. 칭찬을 자주 하세요.",
    },
    "AUTISM": {
        "MILD":     "예측 가능한 패턴으로 대화하세요. 갑작스러운 변화를 최소화하세요.",
        "MODERATE": "고정된 루틴을 강조하세요. 감각 자극(소음·밝기)에 대한 언급을 피하세요. 직접적으로 말하세요.",
        "SEVERE":   "루틴을 절대 바꾸지 마세요. 한 가지 행동만 요청하세요. 이모지와 간단한 단어만 사용하세요.",
    },
}

# 피드백 방식별 응답 스타일
FEEDBACK_STYLE = {
    "voice":  "음성으로 전달되므로 자연스럽게 말하듯이 쓰세요. 특수문자보다 말로 표현하세요.",
    "text":   "텍스트로 전달됩니다. 간단한 이모지를 활용하세요.",
    "button": "AAC 버튼 사용자입니다. '예/아니요'로 대답할 수 있는 질문만 하세요.",
    "auto":   "상황에 맞게 판단하세요.",
}


def _build_system_prompt(user_profile: dict | None) -> str:
    """사용자 프로필을 반영한 동적 시스템 프롬프트 생성"""
    if not user_profile:
        return BASE_SYSTEM_PROMPT

    name = user_profile.get("name", "사용자")
    d_type = user_profile.get("disability_type", "INTELLECTUAL")
    d_level = user_profile.get("disability_level", "MILD")
    notes = user_profile.get("special_notes", "")
    f_mode = user_profile.get("feedback_mode", "voice")

    guideline = DISABILITY_GUIDELINES.get(d_type, {}).get(d_level, "")
    style = FEEDBACK_STYLE.get(f_mode, "")

    profile_section = f"""
[현재 사용자 정보]
이름: {name}
장애 유형: {d_type} / {d_level}
특이사항: {notes if notes else "없음"}
피드백 방식: {f_mode}

[개별화 대화 지침]
- {guideline}
- {style}
- 반드시 "{name}" 이름을 가끔 불러주며 친근하게 대화하세요.
"""
    return BASE_SYSTEM_PROMPT + profile_section


def _build_contents(history: list[dict], user_message: str) -> list[types.Content]:
    """대화 기록 + 현재 메시지를 Content 리스트로 변환"""
    contents = []
    for msg in history:
        role = "user" if msg["role"] == "user" else "model"
        contents.append(types.Content(role=role, parts=[types.Part(text=msg["content"])]))
    contents.append(types.Content(role="user", parts=[types.Part(text=user_message)]))
    return contents


def _execute_tool(tool_name: str, tool_args: dict) -> dict:
    """Tool 실행 및 결과 반환"""
    executor = TOOL_EXECUTORS.get(tool_name)
    if not executor:
        return {"error": f"알 수 없는 Tool: {tool_name}"}
    try:
        return executor(**tool_args)
    except Exception as e:
        return {"error": str(e)}


def chat(
    user_id: int,
    message: str,
    history: list[dict] | None = None,
    context: dict | None = None,
    user_profile: dict | None = None,
) -> dict[str, Any]:
    """
    사용자 메시지를 받아 AI 응답 반환 (Tool 자동 호출 포함)

    Returns:
        {"reply": str, "tool_calls": list, "stage": str | None}
    """
    # 컨텍스트 정보를 메시지에 포함
    user_content = message
    if context:
        ctx_parts = []
        if context.get("decibel"):
            ctx_parts.append(f"[음성 데시벨: {context['decibel']}dB]")
        if context.get("gps_moved") is not None:
            moved = "이동함" if context["gps_moved"] else "이동 안 함"
            ctx_parts.append(f"[GPS: {moved}]")
        if ctx_parts:
            user_content = " ".join(ctx_parts) + " " + message

    contents = _build_contents(history or [], user_content)
    tool_calls_made = []
    final_reply = ""

    # 사용자별 동적 config 생성
    config = types.GenerateContentConfig(
        system_instruction=_build_system_prompt(user_profile),
        tools=TOOLS,
    )

    # Agentic loop - Tool 호출이 없을 때까지 반복 (최대 5회)
    for _ in range(5):
        response = client.models.generate_content(
            model=GEMMA_MODEL,
            contents=contents,
            config=config,
        )

        candidate = response.candidates[0]
        parts = candidate.content.parts

        # 응답을 contents에 추가
        contents.append(types.Content(role="model", parts=parts))

        # Function call 파트 수집
        function_calls = [p for p in parts if p.function_call and p.function_call.name]

        if not function_calls:
            # 텍스트 응답 수집
            final_reply = "".join(p.text for p in parts if p.text)
            break

        # Tool 실행 후 결과 전달
        tool_response_parts = []
        for part in function_calls:
            fc = part.function_call
            tool_name = fc.name
            tool_args = dict(fc.args) if fc.args else {}

            # user_id 자동 주입
            executor = TOOL_EXECUTORS.get(tool_name)
            if executor and hasattr(executor, "__code__") and \
                    "user_id" in executor.__code__.co_varnames:
                tool_args.setdefault("user_id", user_id)

            result = _execute_tool(tool_name, tool_args)
            tool_calls_made.append({"tool": tool_name, "args": tool_args, "result": result})

            tool_response_parts.append(
                types.Part(
                    function_response=types.FunctionResponse(
                        name=tool_name,
                        response={"result": result},
                    )
                )
            )

        contents.append(types.Content(role="tool", parts=tool_response_parts))

    # 피드백 단계 추출
    stage = None
    for tc in tool_calls_made:
        if tc["tool"] == "provide_feedback":
            stage = tc["args"].get("stage")

    return {"reply": final_reply, "tool_calls": tool_calls_made, "stage": stage}


def stream_chat(
    user_id: int,
    message: str,
    history: list[dict] | None = None,
    context: dict | None = None,
) -> Generator[str, None, None]:
    """스트리밍 응답 버전 (WebSocket 용)"""
    result = chat(user_id, message, history, context)
    for word in result["reply"].split():
        yield word + " "
