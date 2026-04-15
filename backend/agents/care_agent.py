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

역할:
- 사용자의 일관된 스케줄과 루틴을 관리합니다.
- 사용자의 상태를 감지하고 적절한 단계별 피드백을 제공합니다.
- 보호자에게 필요한 정보를 전달합니다.

행동 원칙:
1. 항상 이해하기 쉬운 짧고 단순한 문장을 사용합니다.
2. 긍정적인 표현을 사용합니다.
3. 복잡한 설명을 피합니다.
4. 사용자의 거부 반응을 존중하고 선택지를 제공합니다.
5. 문제 행동 감지 시 반드시 적절한 Tool을 호출합니다.

Tool 사용 규칙:
- 스케줄 달성 여부 확인 시 → check_schedule 호출
- 사용자 거부/흥분 감지 시 → detect_user_response 호출 후 provide_feedback 호출
- 보호자에게 알림 필요 시 → send_message 호출
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
