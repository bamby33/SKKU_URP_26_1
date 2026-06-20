"""
Care Agent - 발달장애인 돌봄 에이전트 AI 핵심 로직
- vLLM (Llama 3.1 8B Instruct) 기반
- 4개 Tool을 자율적으로 호출하며 대화 흐름 관리
"""
import json
import os
import time
from typing import Any, Generator
from dotenv import load_dotenv
from openai import OpenAI

from agents.tools.schedule_check import check_schedule, TOOL_DEFINITION as T2
from agents.tools.feedback import provide_feedback, TOOL_DEFINITION as T3
from agents.tools.detect import detect_user_response, TOOL_DEFINITION as T4
from agents.tools.messaging import send_message, TOOL_DEFINITION as T5

load_dotenv()

VLLM_BASE_URL = os.getenv("VLLM_BASE_URL", "http://localhost:8001/v1")
LLM_MODEL     = os.getenv("LLM_MODEL", "meta-llama/Meta-Llama-3.1-8B-Instruct")

client = OpenAI(base_url=VLLM_BASE_URL, api_key="none")

# Tool 실행 함수 매핑
TOOL_EXECUTORS: dict[str, Any] = {
    "check_schedule":      check_schedule,
    "provide_feedback":    provide_feedback,
    "detect_user_response": detect_user_response,
    "send_message":        send_message,
}

# OpenAI 형식 Tool 정의 리스트 (Groq는 OpenAI 포맷 그대로 사용)
TOOLS = [T2, T3, T4, T5]

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

▶ 1단계 (사전신호) — 부정 언어만 (목소리는 크지 않음)
  감지 조건:
  - "싫어", "안 해", "못해", "하기 싫어", "모르겠어" 등 거부 표현
  - 목소리 크기는 평소 수준 (조용한 거부)

▶ 2단계 (문제 행동 중) — 데시벨이 높음(흥분)
  감지 조건:
  - 음성 데시벨이 높음 (부정 언어 유무와 무관)
  - 또는 부정 언어 + 높은 데시벨
  - "하기 싫다고!", "그만해!" 등을 큰 소리로 외침

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
- 코드, 마크다운 기호(```, *, #, - 등), 영어 함수명, JSON을 절대 출력하지 마세요. 오직 한국어 문장만 답하세요.
- 외국어 단어(영어·스페인어 등)를 절대 섞지 마세요. 100% 한국어 단어만 사용하세요.
- "(AAC 버튼 제공)", "(선택지 제공)" 같은 메타 설명이나 토큰(<end_of_turn> 등)을 문장에 절대 쓰지 마세요. 실제 대화 문장만 말하세요.
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

    # special_notes 파싱
    likes_str = ""
    dislikes_str = ""
    problem_notes_str = ""
    for line in notes.split("\n"):
        if "좋아하는 것:" in line:
            likes_str = line.split("좋아하는 것:")[1].strip()
        elif "싫어하는 것:" in line:
            dislikes_str = line.split("싫어하는 것:")[1].strip()
        elif "문제행동 특이사항:" in line:
            problem_notes_str = line.split("문제행동 특이사항:")[1].strip()

    profile_section = f"""
[현재 사용자 정보]
이름: {name}
장애 유형: {d_type} / {d_level}
좋아하는 것: {likes_str if likes_str else "미입력"}
싫어하는 것·힘든 것: {dislikes_str if dislikes_str else "미입력"}
문제행동 특이사항: {problem_notes_str if problem_notes_str else "미입력"}
피드백 방식: {f_mode}

[개별화 대화 지침]
- {guideline}
- {style}
- 가끔 "{name}" 이름을 불러주며 친근하게 대화하세요.
- "{likes_str if likes_str else '좋아하는 것'}"은 **2단계에서 흥분을 가라앉히고 다른 행동으로 전환할 때에만**, 그것도 대화 흐름상 자연스러울 때 한 번만 제안하세요.
- 평소 대화·1단계·일과 확인 등 그 외 상황에서는 좋아하는 것을 **억지로 꺼내지 마세요** (뜬금없는 언급 금지).
- "{dislikes_str}"에 해당하는 상황은 최대한 자극을 줄이고, 대화 방식을 부드럽게 유지하세요.
- 문제행동 특이사항: "{problem_notes_str}" — 이 패턴이 감지되면 즉시 1단계 대응을 시작하세요.
"""
    return BASE_SYSTEM_PROMPT + profile_section + (("\n" + behavior_context) if behavior_context else "")


def _build_general_prompt(user_profile: dict | None) -> str:
    """일반 대화(스케줄·문제행동 맥락 아님)용 — 다정한 말동무 + 일상 도우미. DB 툴 없음."""
    name = (user_profile or {}).get("name", "친구")
    d_level = ((user_profile or {}).get("disability_level") or "mild").upper()
    simple = "아주 짧고 쉬운 단어로" if d_level in ("MODERATE", "SEVERE") else "짧고 쉬운 말로"
    return f"""당신은 발달장애가 있는 {name}님의 다정한 말동무이자 일상생활 도우미예요.

[평소 대화]
- {simple} 자연스럽게 대화하세요. {name}님이 한 말에 맞게 반응하세요.
  예: "배고파" → "배고프구나, 뭐 먹고 싶어?" / "준비 됐어" → "오 멋지다! 😊"
- 일과·스케줄을 억지로 꺼내지 마세요. 상대가 말한 주제로만 이어가세요.

[방법을 물어보면 — 차근차근 한 단계씩]
- "세면하는 법 알려줘", "어떻게 해?", "도와줘"처럼 무언가 하는 방법을 물으면,
  한꺼번에 다 말하지 말고 **딱 한 단계만** 아주 쉽고 구체적인 동작 하나로 알려주세요.
- 한 단계를 말한 뒤 "다 했어? 그럼 다음 알려줄게 😊"처럼 확인하고 기다리세요.
- 다음 차례에 그 다음 한 단계만 알려주세요. (예: 세면 → "먼저 수도를 틀어요 🚰" → 다음 "손에 물을 묻혀요" → "비누를 발라요" …)
- {name}님이 "다 했어/응"이라고 하면 칭찬하고 다음 단계로, "모르겠어"라고 하면 더 쉽게 다시 알려주세요.

[항상 지켜요]
- 한 번에 1~2문장으로 짧고 따뜻하게. 이모지는 끝에 1개 정도.
- 외국어·특수기호·토큰·마크다운·영어 함수명을 절대 쓰지 말고, 순수 한국어 문장만 답하세요."""


_TOOL_WORDS = ("detect_user_response", "provide_feedback", "check_schedule", "send_message",
               "detect user response", "provide feedback", "check schedule", "send message")


def _sanitize_reply(text: str) -> str:
    """LLM 답변에서 새어 나온 도구 이름·함수호출·토큰·특수기호 제거 (음성/한국어 출력용)."""
    import re
    t = text or ""
    t = re.sub(r"<\|?\s*(end_of_turn|start_of_turn)\s*\|?>", "", t)
    t = re.sub(r"[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)", "", t)   # 함수호출형 word(...) 먼저
    for w in _TOOL_WORDS:
        t = re.sub(re.escape(w), "", t, flags=re.IGNORECASE)   # 남은 도구 이름(괄호 없는 경우)
    t = re.sub(r"\b[a-z]+_[a-z]+(?:_[a-z]+)*\b", "", t)         # 남은 snake_case 영어 토큰
    # 도구/메타 태그 제거: [호출]·(도구 호출)·[provide_feedback 호출] 등 (괄호 안에 메타어 있으면)
    t = re.sub(r"[\[\(][^\]\)]*(호출|도구|함수|stage|tool|call|feedback|response)[^\]\)]*[\]\)]", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\[\s*\]|\(\s*\)", "", t)                       # 빈 괄호 잔여 제거
    t = re.sub(r"[*#`>|]", "", t)                               # 마크다운 기호('_'는 보존)
    t = re.sub(r"[ \t]{2,}", " ", t).strip()
    return t


# 디스크 절약: 상세 로그는 CARE_DEBUG=1 일 때만 (실험 중 uvicorn.log 폭증 방지)
DEBUG = os.getenv("CARE_DEBUG") == "1"


def _execute_tool(tool_name: str, tool_args: dict) -> dict:
    executor = TOOL_EXECUTORS.get(tool_name)
    if not executor:
        return {"error": f"알 수 없는 Tool: {tool_name}"}
    try:
        result = executor(**tool_args)
        if DEBUG:
            status = "OK" if result.get("success") else "FAIL"
            print(f"  [TOOL] {tool_name} {status} | args={tool_args}")
        return result
    except Exception as e:
        print(f"  [TOOL ERROR] {tool_name}: {e}")
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
        if context.get("schedule_title"):
            ctx_parts.append(f"[현재 일과: '{context['schedule_title']}' — 이 일과에 대해 대화하세요. 무슨 일과인지 되묻지 마세요.]")
        # 과제분할: 집중이 필요한 생산적 일과에서 어려워하면, 한꺼번에 하라고 하지 말고 아주 작은 첫 단계 하나만 제안
        if context.get("schedule_category") == "productive" and context.get("behavior_stage") == "stage_1":
            ctx_parts.append(
                f"[이 일과는 집중이 필요한 활동입니다. 한꺼번에 다 하라고 하지 말고, "
                f"전체를 아주 작은 단계로 쪼개서(과제 분할) '가장 쉬운 첫 단계 하나만 같이 해볼까요?'처럼 "
                f"작은 한 걸음을 제안하세요.]"
            )
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
            stage = context["behavior_stage"]
            if stage == "stage_1":
                ctx_parts.append(
                    f"[행동 감지: 사용자가 사전신호(stage_1) 상태입니다. "
                    f"detect_user_response → provide_feedback(stage=\"stage_1\") 순서로 호출하고, "
                    f"선택지 2개와 AAC 버튼을 제시하세요.]"
                )
            else:
                ctx_parts.append(
                    f"[행동 감지: 현재 사용자가 {stage} 상태입니다. "
                    f"즉시 detect_user_response → provide_feedback(stage=\"{stage}\") 순서로 호출하세요.]"
                )
        if ctx_parts:
            user_content = " ".join(ctx_parts) + " " + message

    # 메시지 구성 (OpenAI 형식)
    # Gemma(vLLM)는 system role을 지원하지 않으므로(400 'System role not supported'),
    # 시스템 프롬프트를 첫 user 메시지 앞에 합쳐서 전달한다.
    # 스케줄·문제행동 맥락이면 에이전트(툴 O), 평범한 대화면 말동무(툴 X)
    _ctx = context or {}
    agent_mode = bool(_ctx.get("behavior_stage") or _ctx.get("schedule_id") is not None)
    if agent_mode:
        system_content = _build_system_prompt(user_profile, behavior_context)
        active_tools = TOOLS
    else:
        system_content = _build_general_prompt(user_profile)
        active_tools = []
    messages: list[dict] = []
    prepended = False
    for msg in (history or []):
        role = "user" if msg["role"] == "user" else "assistant"
        content = msg["content"]
        if not prepended and role == "user":
            content = f"{system_content}\n\n{content}"
            prepended = True
        messages.append({"role": role, "content": content})
    final_user = user_content if prepended else f"{system_content}\n\n{user_content}"
    messages.append({"role": "user", "content": final_user})

    tool_calls_made = []
    final_reply = ""

    # Agentic loop (최대 5회)
    for _ in range(5):
        # 429 대비 retry (최대 3회, 지수 백오프)
        for attempt in range(3):
            try:
                _kwargs = dict(
                    model=LLM_MODEL,
                    messages=messages,
                    max_tokens=1024,
                    stop=["<end_of_turn>", "<start_of_turn>"],
                )
                if active_tools:
                    _kwargs["tools"] = active_tools
                    _kwargs["tool_choice"] = "auto"
                response = client.chat.completions.create(**_kwargs)
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
        "reply":      _sanitize_reply(final_reply),
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
