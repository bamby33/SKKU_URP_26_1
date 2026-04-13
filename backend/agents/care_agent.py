"""
Care Agent - 발달장애인 돌봄 에이전트 AI 핵심 로직
- Google Generative AI (Gemma) 기반
- 5개 Tool을 자율적으로 호출하며 대화 흐름 관리
"""
import json
import os
from typing import Any, Generator
from dotenv import load_dotenv
import google.generativeai as genai

from agents.tools.personalization import personalize_user, TOOL_DEFINITION as T1
from agents.tools.schedule_check import check_schedule, TOOL_DEFINITION as T2
from agents.tools.feedback import provide_feedback, TOOL_DEFINITION as T3
from agents.tools.detect import detect_user_response, TOOL_DEFINITION as T4
from agents.tools.messaging import send_message, TOOL_DEFINITION as T5

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
GEMMA_MODEL = os.getenv("GEMMA_MODEL", "gemma-3-12b-it")

genai.configure(api_key=GOOGLE_API_KEY)

# Tool 실행 함수 매핑
TOOL_EXECUTORS: dict[str, Any] = {
    "personalize_user": personalize_user,
    "check_schedule": check_schedule,
    "provide_feedback": provide_feedback,
    "detect_user_response": detect_user_response,
    "send_message": send_message,
}

# OpenAI 형식 Tool 정의 → Google Generative AI 형식으로 변환
def _to_genai_tools(tool_defs: list[dict]) -> list[dict]:
    function_declarations = []
    for tool in tool_defs:
        fn = tool["function"]
        function_declarations.append({
            "name": fn["name"],
            "description": fn["description"],
            "parameters": fn["parameters"],
        })
    return [{"function_declarations": function_declarations}]

TOOLS = _to_genai_tools([T1, T2, T3, T4, T5])

SYSTEM_PROMPT = """당신은 발달장애인을 돌보는 AI 에이전트입니다.

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
- 사용자 초기 설정 시 → personalize_user 호출
- 스케줄 달성 여부 확인 시 → check_schedule 호출
- 사용자 거부/흥분 감지 시 → detect_user_response 호출 후 provide_feedback 호출
- 보호자에게 알림 필요 시 → send_message 호출
"""


def _execute_tool(tool_name: str, tool_args: dict) -> str:
    """Tool 실행 및 결과를 JSON 문자열로 반환"""
    executor = TOOL_EXECUTORS.get(tool_name)
    if not executor:
        return json.dumps({"error": f"알 수 없는 Tool: {tool_name}"})
    try:
        result = executor(**tool_args)
        return json.dumps(result, ensure_ascii=False, default=str)
    except Exception as e:
        return json.dumps({"error": str(e)})


def chat(
    user_id: int,
    message: str,
    history: list[dict] | None = None,
    context: dict | None = None
) -> dict[str, Any]:
    """
    사용자 메시지를 받아 AI 응답 반환 (Tool 자동 호출 포함)

    Args:
        user_id: 사용자 ID
        message: 사용자 메시지
        history: 이전 대화 기록 [{"role": "user"/"assistant", "content": "..."}]
        context: 추가 컨텍스트 (decibel, gps_moved 등)

    Returns:
        {"reply": str, "tool_calls": list, "stage": str | None}
    """
    model = genai.GenerativeModel(
        model_name=GEMMA_MODEL,
        system_instruction=SYSTEM_PROMPT,
        tools=TOOLS,
    )

    # 히스토리 변환 (OpenAI 형식 → Google 형식)
    chat_history = []
    if history:
        for msg in history:
            role = "user" if msg["role"] == "user" else "model"
            chat_history.append({"role": role, "parts": [msg["content"]]})

    chat_session = model.start_chat(history=chat_history)

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

    tool_calls_made = []
    final_reply = ""

    response = chat_session.send_message(user_content)

    # Agentic loop - Tool 호출이 없을 때까지 반복
    for _ in range(5):
        has_function_call = any(
            hasattr(part, "function_call") and part.function_call.name
            for part in response.parts
        )

        if not has_function_call:
            final_reply = response.text
            break

        # Tool 실행
        tool_responses = []
        for part in response.parts:
            if not (hasattr(part, "function_call") and part.function_call.name):
                continue

            fc = part.function_call
            tool_name = fc.name
            tool_args = dict(fc.args)

            # user_id 자동 주입
            executor = TOOL_EXECUTORS.get(tool_name)
            if executor and hasattr(executor, "__code__") and \
                    "user_id" in executor.__code__.co_varnames:
                tool_args.setdefault("user_id", user_id)

            result_str = _execute_tool(tool_name, tool_args)
            result_dict = json.loads(result_str)
            tool_calls_made.append({
                "tool": tool_name,
                "args": tool_args,
                "result": result_dict,
            })

            tool_responses.append(
                genai.protos.Part(
                    function_response=genai.protos.FunctionResponse(
                        name=tool_name,
                        response={"result": result_dict},
                    )
                )
            )

        response = chat_session.send_message(tool_responses)

    # 피드백 단계 추출
    stage = None
    for tc in tool_calls_made:
        if tc["tool"] == "provide_feedback":
            stage = tc["args"].get("stage")

    return {
        "reply": final_reply,
        "tool_calls": tool_calls_made,
        "stage": stage,
    }


def stream_chat(
    user_id: int,
    message: str,
    history: list[dict] | None = None,
    context: dict | None = None
) -> Generator[str, None, None]:
    """스트리밍 응답 버전 (WebSocket 용)"""
    result = chat(user_id, message, history, context)
    for word in result["reply"].split():
        yield word + " "
