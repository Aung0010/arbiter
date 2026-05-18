from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import traceback
from collections import Counter
from typing import Optional, List, Dict, Any

import requests
import autogen
from dotenv import load_dotenv
from datasets import load_dataset
from tqdm import tqdm
from sklearn.metrics import accuracy_score


# ============================================================
# UTF-8 Output Setup
# Helps avoid Windows terminal encoding errors for symbols
# such as β, γ, μ, etc.
# ============================================================

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass


# ============================================================
# Environment Setup
# ============================================================

load_dotenv(".env.local")

OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY")

if not OLLAMA_API_KEY:
    raise RuntimeError(
        "OLLAMA_API_KEY is missing. "
        "Add it to .env.local as:\n"
        "OLLAMA_API_KEY=your_key_here"
    )


# ============================================================
# Direct Ollama Cloud Configuration
# ============================================================

OLLAMA_BASE_URL = "https://ollama.com/v1/"

# ============================================================
# Test 3: Role-Specialised Assisted Revision Workflow
# ============================================================
# Stage 1: GPT-OSS initial answer
# Stage 2: Ministral checks clinical evidence
# Stage 3: Gemma checks question intent and option alignment
# Stage 4: GPT-OSS revises or preserves the answer

MODEL_DIAGNOSTICIAN = "ministral-3:14b"
MODEL_CLINICAL_AUDITOR = "gemma3:12b"
MODEL_INTENT_AUDITOR = "rnj-1:8b"
MODEL_CMO = "ministral-3:14b"

DATASET_NAME = "Layered-Labs/benchbase-medqa"
DATASET_SPLIT = "test"

TIMEOUT_SECONDS = 1200


def build_llm_config(model_name: str) -> Dict[str, Any]:
    return {
        "config_list": [
            {
                "model": model_name,
                "api_key": OLLAMA_API_KEY,
                "base_url": OLLAMA_BASE_URL,
                "price": [0, 0],
            }
        ],
        "cache_seed": None,
        "temperature": 0,
        "timeout": TIMEOUT_SECONDS,
    }


llm_config_diagnostician = build_llm_config(MODEL_DIAGNOSTICIAN)
llm_config_clinical_auditor = build_llm_config(MODEL_CLINICAL_AUDITOR)
llm_config_intent_auditor = build_llm_config(MODEL_INTENT_AUDITOR)
llm_config_cmo = build_llm_config(MODEL_CMO)


# ============================================================
# Ollama Cloud Validation
# ============================================================

def validate_cloud_api() -> None:
    print("=" * 70)
    print("Checking Ollama Cloud API access...")
    print("=" * 70)

    headers = {
        "Authorization": f"Bearer {OLLAMA_API_KEY}"
    }

    try:
        response = requests.get(
            "https://ollama.com/api/tags",
            headers=headers,
            timeout=60,
        )
        response.raise_for_status()

        data = response.json()
        models = data.get("models", [])

        available_names = {
            model.get("name", "")
            for model in models
            if model.get("name")
        }

        print("Ollama Cloud API key accepted.")
        print(f"Models returned by API tags endpoint: {len(available_names)}")

        expected_models = {
            MODEL_DIAGNOSTICIAN,
            MODEL_CLINICAL_AUDITOR,
            MODEL_INTENT_AUDITOR,
            MODEL_CMO,
        }

        missing = [m for m in expected_models if m not in available_names]

        if missing:
            print("\nERROR: These configured models were not found:")
            for model in missing:
                print(f"  - {model}")

            print("\nAvailable model names:")
            for name in sorted(available_names):
                print(f"  - {name}")

            raise RuntimeError(
                "Model validation failed. Check the configured Ollama model names."
            )

        print("Configured models found:")
        for model in sorted(expected_models):
            print(f"  - {model}")

    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else "unknown"
        raise RuntimeError(
            f"Ollama Cloud API validation failed with HTTP {status}. "
            "Check whether the API key is valid."
        ) from e

    except requests.exceptions.RequestException as e:
        raise RuntimeError(
            f"Could not reach Ollama Cloud API: {e}"
        ) from e

    print("=" * 70)


# ============================================================
# JSON and Answer Parsing Helpers
# ============================================================

def extract_json_object(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None

    cleaned = text.strip()

    cleaned = re.sub(r"^```json\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^```\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

    return None


def extract_final_answer_from_cmo(text: str) -> Optional[str]:
    parsed = extract_json_object(text)

    if parsed:
        answer = str(parsed.get("final_answer", "")).strip().upper()
        if answer in {"A", "B", "C", "D"}:
            return answer

    match = re.search(
        r'"final_answer"\s*:\s*"([A-D])"',
        text or "",
        re.IGNORECASE,
    )
    if match:
        return match.group(1).upper()

    return None


def extract_diagnostician_answer(text: str) -> Optional[str]:
    if not text:
        return None

    patterns = [
        r"\[Diagnostician Final Answer\]\s*([A-D])",
        r"\[Diagnostician Final Answer\]\s*[:\-]?\s*([A-D])",
        r"Diagnostician\s+Final\s+Answer\s*[:\-]?\s*([A-D])",

        r"\[Final Answer\]\s*([A-D])",
        r"\[Final Answer\]\s*[:\-]?\s*([A-D])",
        r"Final\s+Answer\s*[:\-]?\s*([A-D])",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).upper()

    return None


def extract_clinical_auditor_answer(text: str) -> Optional[str]:
    if not text:
        return None

    patterns = [
        r"\[Clinical Auditor Final Recommendation\]\s*([A-D])",
        r"\[Clinical Auditor Final Recommendation\]\s*[:\-]?\s*([A-D])",
        r"Clinical\s+Auditor\s+Final\s+Recommendation\s*[:\-]?\s*([A-D])",
        r"\[Final Recommendation\]\s*([A-D])",
        r"Final\s+Recommendation\s*[:\-]?\s*([A-D])",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).upper()

    return None


def extract_intent_auditor_answer(text: str) -> Optional[str]:
    if not text:
        return None

    patterns = [
        r"\[Intent Auditor Final Recommendation\]\s*([A-D])",
        r"\[Intent Auditor Final Recommendation\]\s*[:\-]?\s*([A-D])",
        r"Intent\s+Auditor\s+Final\s+Recommendation\s*[:\-]?\s*([A-D])",
        r"\[Final Recommendation\]\s*([A-D])",
        r"Final\s+Recommendation\s*[:\-]?\s*([A-D])",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).upper()

    return None


# ============================================================
# Dataset Helpers
# ============================================================

def benchbase_options_to_choices(options: List[Dict[str, str]]) -> str:
    sorted_opts = sorted(
        options,
        key=lambda x: str(x.get("original_key", "")).upper()
    )

    lines = []

    for opt in sorted_opts:
        key = str(opt.get("original_key", "")).strip().upper()
        text = opt.get("text", "")
        lines.append(f"{key}) {text}")

    return "\n".join(lines)


def load_medqa():
    return load_dataset(DATASET_NAME)[DATASET_SPLIT]


def select_indices(
    total: int,
    start_idx: int,
    num_cases: Optional[int]
) -> List[int]:
    if start_idx < 0:
        start_idx = 0

    if start_idx >= total:
        return []

    if num_cases is None:
        end_idx = total
    else:
        end_idx = min(start_idx + num_cases, total)

    return list(range(start_idx, end_idx))


# ============================================================
# Transcript Helpers
# ============================================================

def extract_agent_outputs(messages: List[Dict[str, Any]]) -> Dict[str, str]:
    outputs = {
        "user_prompt": "",
        "diagnostician_response": "",
        "clinical_auditor_response": "",
        "intent_auditor_response": "",
        "cmo_response": "",
    }

    for msg in messages:
        name = msg.get("name") or msg.get("source") or ""
        content = str(msg.get("content", ""))

        if name == "User_Proxy":
            outputs["user_prompt"] = content
        elif name == "Diagnostician":
            outputs["diagnostician_response"] = content
        elif name == "Clinical_Evidence_Auditor":
            outputs["clinical_auditor_response"] = content
        elif name == "Question_Intent_Auditor":
            outputs["intent_auditor_response"] = content
        elif name == "Chief_Medical_Officer":
            outputs["cmo_response"] = content

    return outputs


def build_timeline(messages: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    timeline = []

    for step, msg in enumerate(messages, start=1):
        name = msg.get("name") or msg.get("source") or "Unknown"
        role = msg.get("role", "unknown")
        content = str(msg.get("content", ""))

        timeline.append(
            {
                "step": step,
                "speaker": name,
                "role": role,
                "content": content,
            }
        )

    return timeline


# ============================================================
# Collaboration Outcome Classification
# ============================================================

def classify_case(
    gold: str,
    diagnostician_answer: Optional[str],
    clinical_auditor_answer: Optional[str],
    intent_auditor_answer: Optional[str],
    final_answer: Optional[str],
) -> Dict[str, Any]:
    diagnostician_correct = diagnostician_answer == gold
    clinical_auditor_correct = (
        None if clinical_auditor_answer is None
        else clinical_auditor_answer == gold
    )
    intent_auditor_correct = (
        None if intent_auditor_answer is None
        else intent_auditor_answer == gold
    )
    final_correct = final_answer == gold

    if diagnostician_correct and final_correct:
        outcome_type = "maintained_correct"
    elif diagnostician_correct and not final_correct:
        outcome_type = "degraded_by_pipeline"
    elif not diagnostician_correct and final_correct:
        outcome_type = "corrected_by_pipeline"
    else:
        outcome_type = "maintained_incorrect"

    if clinical_auditor_answer is None or intent_auditor_answer is None:
        collaboration_subtype = "auditor_answer_not_parsed"

    elif (
        diagnostician_correct
        and clinical_auditor_correct
        and intent_auditor_correct
        and final_correct
    ):
        collaboration_subtype = "all_agents_correct"

    elif (
        not diagnostician_correct
        and not clinical_auditor_correct
        and not intent_auditor_correct
        and not final_correct
    ):
        collaboration_subtype = "all_agents_wrong"

    elif not diagnostician_correct and final_correct:
        if clinical_auditor_correct and intent_auditor_correct:
            collaboration_subtype = "both_auditors_helped_final_correction"
        elif clinical_auditor_correct and not intent_auditor_correct:
            collaboration_subtype = "clinical_auditor_helped_final_correction"
        elif not clinical_auditor_correct and intent_auditor_correct:
            collaboration_subtype = "intent_auditor_helped_final_correction"
        else:
            collaboration_subtype = "cmo_corrected_all_prior_agents"

    elif diagnostician_correct and not final_correct:
        if clinical_auditor_correct and intent_auditor_correct:
            collaboration_subtype = "cmo_overrode_all_correct_advisors"
        elif not clinical_auditor_correct and not intent_auditor_correct:
            collaboration_subtype = "both_auditors_misled_final_judge"
        elif not clinical_auditor_correct and intent_auditor_correct:
            collaboration_subtype = "clinical_auditor_misled_final_judge"
        else:
            collaboration_subtype = "intent_auditor_misled_final_judge"

    elif diagnostician_correct and final_correct:
        if not clinical_auditor_correct and not intent_auditor_correct:
            collaboration_subtype = "cmo_resisted_both_incorrect_auditors"
        elif not clinical_auditor_correct and intent_auditor_correct:
            collaboration_subtype = "cmo_resisted_incorrect_clinical_auditor"
        elif clinical_auditor_correct and not intent_auditor_correct:
            collaboration_subtype = "cmo_resisted_incorrect_intent_auditor"
        else:
            collaboration_subtype = "maintained_correct_other"

    elif not diagnostician_correct and not final_correct:
        if clinical_auditor_correct and intent_auditor_correct:
            collaboration_subtype = "cmo_failed_to_follow_both_correct_auditors"
        elif clinical_auditor_correct and not intent_auditor_correct:
            collaboration_subtype = "cmo_failed_to_follow_correct_clinical_auditor"
        elif not clinical_auditor_correct and intent_auditor_correct:
            collaboration_subtype = "cmo_failed_to_follow_correct_intent_auditor"
        else:
            collaboration_subtype = "maintained_incorrect_other"

    else:
        collaboration_subtype = "uncategorized"

    return {
        "diagnostician_correct": diagnostician_correct,
        "clinical_auditor_correct": clinical_auditor_correct,
        "intent_auditor_correct": intent_auditor_correct,
        "final_correct": final_correct,
        "outcome_type": outcome_type,
        "collaboration_subtype": collaboration_subtype,
    }


# ============================================================
# Single MedQA Case Runner
# ============================================================

def process_single_case(item: Dict[str, Any], idx: int) -> Dict[str, Any]:
    start_time = time.perf_counter()

    question = item["question"]
    options = item["options"]
    answer = item["answer"]

    gold_key = str(answer.get("original_key", "")).strip().upper()
    choices_str = benchbase_options_to_choices(options)

    medqa_prompt = f"""
You are given a USMLE-style MedQA multiple-choice question.

[Medical Case]
{question}

[Options]
{choices_str}

Task:
A role-specialised medical workflow will evaluate this case and select the single best answer.
"""

    try:
        user_proxy = autogen.UserProxyAgent(
            name="User_Proxy",
            system_message="You submit MedQA questions to the role-specialised medical workflow.",
            code_execution_config=False,
            human_input_mode="NEVER",
        )

        # ============================================================
        # Agent 1: GPT-OSS Initial Diagnostician
        # ============================================================

        diagnostician = autogen.AssistantAgent(
            name="Diagnostician",
            system_message="""
You are the Initial Diagnostician.

Your role is to provide the first full medical interpretation of the MedQA case.
Maximum length: 350 words.

You must provide:
1. The most important findings in the case.
2. The medical interpretation.
3. Why your chosen option is best.
4. A brief dismissal of the main competing option if relevant.
5. Your final answer letter.

You must always choose exactly one answer from A, B, C, or D.
Do not answer "none of the above."
Do not refuse to answer.
If all options seem imperfect, choose the best available option.

Do not output only a single answer letter.
Do not ramble.
Do not invent unsupported facts.

Formatting rules:
- Use plain text only.
- Do not use markdown.
- Do not use bold markers such as double asterisks.
- Do not use headings with hash symbols.
- Do not use tables.
- Use the exact section labels shown below.

Use this exact format:

[Key Findings]
- ...

[Reasoning]
...

[Diagnostician Final Answer]
A
""",
            llm_config=llm_config_diagnostician,
        )

        # ============================================================
        # Agent 2: Ministral Clinical Evidence Auditor
        # ============================================================

        clinical_auditor = autogen.AssistantAgent(
            name="Clinical_Evidence_Auditor",
            system_message="""
You are the Clinical Evidence Auditor.

Your role is not to debate generally.
Your role is to audit whether the Diagnostician's answer is supported by the medical evidence in the case.

Focus on:
1. Symptoms and signs.
2. Patient demographics and clinical context.
3. Labs, pathology, imaging, and physiologic findings.
4. Whether the selected answer is clinically consistent with those findings.
5. Whether another option better matches the clinical evidence.

Rules:
1. Review the original case independently before judging the Diagnostician.
2. Identify one or two key clinical evidence points that support or challenge the Diagnostician.
3. If the Diagnostician missed or misused a major clinical clue, state it clearly.
4. If another answer is clinically stronger, recommend it clearly.
5. If the Diagnostician is clinically well-supported, confirm it.
6. Do not invent unsupported medical facts.
7. You must always choose exactly one recommendation from A, B, C, or D.
8. Do not answer "none of the above."
9. If options seem imperfect, choose the best available option.

Maximum length: 240 words.

Formatting rules:
- Use plain text only.
- Do not use markdown.
- Do not use bold markers such as double asterisks.
- Do not use tables.

Use this exact format:

[Clinical Evidence Assessment]
- Supported or challenged:
- Key clinical evidence:
- Main concern if any:

[Clinical Auditor Final Recommendation]
A
""",
            llm_config=llm_config_clinical_auditor,
        )

        # ============================================================
        # Agent 3: Gemma Question-Intent and Option-Matching Auditor
        # ============================================================

        intent_auditor = autogen.AssistantAgent(
            name="Question_Intent_Auditor",
            system_message="""
You are the Question-Intent and Option-Matching Auditor.

Your role is not to debate clinical facts broadly.
Your role is to check whether the Diagnostician answered the exact task asked by the question and mapped it correctly to the answer options.

Focus on:
1. What the question is truly asking:
   diagnosis, mechanism, cause, risk factor, next step, drug action, complication, or another target.
2. Whether the Diagnostician answered that exact target.
3. Whether the chosen answer option matches the target more precisely than alternatives.
4. Whether the Diagnostician confused a disease clue with the requested mechanism or management decision.

Rules:
1. Re-read the original case and question wording carefully.
2. State the question target clearly.
3. Assess whether the Diagnostician's answer matches that target.
4. If the Diagnostician answered the wrong task or mismapped the options, state it clearly and recommend the better option.
5. If the Diagnostician matched the question target correctly, confirm it.
6. Do not invent unsupported medical facts.
7. You must always choose exactly one recommendation from A, B, C, or D.
8. Do not answer "none of the above."
9. If options seem imperfect, choose the best available option.

Maximum length: 240 words.

Formatting rules:
- Use plain text only.
- Do not use markdown.
- Do not use bold markers such as double asterisks.
- Do not use tables.

Use this exact format:

[Question Target]
- The question is asking for:

[Option-Matching Assessment]
- Matches or mismatches the Diagnostician:
- Key reason:

[Intent Auditor Final Recommendation]
A
""",
            llm_config=llm_config_intent_auditor,
        )

        # ============================================================
        # Agent 4: GPT-OSS Final CMO Reviser
        # ============================================================

        cmo = autogen.AssistantAgent(
            name="Chief_Medical_Officer",
            system_message="""
You are the Chief Medical Officer and Final Reviser.

You are the strongest final decision-maker in this workflow.

You have access to:
1. The original MedQA case and options.
2. Your medical team's Initial Diagnostician answer.
3. The Clinical Evidence Auditor's targeted assessment.
4. The Question-Intent and Option-Matching Auditor's targeted assessment.

Your job is to produce the single best final answer.

Decision rules:
1. Re-evaluate the original case yourself before deciding.
2. Treat the two auditor outputs as targeted assistance, not as votes.
3. Preserve the Diagnostician's answer when it remains best supported after considering the audits.
4. Revise the answer only when an auditor exposes a concrete clinical evidence problem, task-interpretation problem, or option-mapping problem.
5. If both auditors are unhelpful or misleading, ignore them and rely on the best medical reasoning.
6. If one auditor identifies a valid correction, incorporate it.
7. If both auditors identify the same valid weakness, take that seriously, but still decide from the original case.
8. Your goal is not to agree with prior agents; your goal is to output the best final answer.
9. You must always choose exactly one answer from A, B, C, or D.

Do not answer "none of the above."
Do not refuse to answer.
If all options seem imperfect, choose the best available option.

Return only valid JSON.
Do not use markdown.
Do not use bold markers such as double asterisks.
Do not use code fences.
Do not write text outside JSON.

Keep decision_summary under 120 words.

Use exactly this structure:

{
  "final_answer": "A",
  "decision_summary": "Concise medical justification for the final answer.",
  "initial_diagnostician_assessment": "correct | partially_correct | incorrect",
  "clinical_auditor_assessment": "helpful | partially_helpful | misleading",
  "intent_auditor_assessment": "helpful | partially_helpful | misleading",
  "revision_status": "preserved_initial_answer | revised_initial_answer",
  "key_evidence": [
    "Evidence point 1",
    "Evidence point 2"
  ]
}
""",
            llm_config=llm_config_cmo,
        )

        groupchat = autogen.GroupChat(
            agents=[
                user_proxy,
                diagnostician,
                clinical_auditor,
                intent_auditor,
                cmo,
            ],
            messages=[],
            max_round=5,
            speaker_selection_method="round_robin",
        )

        manager = autogen.GroupChatManager(
            groupchat=groupchat,
            llm_config=llm_config_cmo,
        )

        chat_result = user_proxy.initiate_chat(
            manager,
            message=medqa_prompt,
            summary_method="last_msg",
        )

        final_message = str(chat_result.summary)
        final_answer = extract_final_answer_from_cmo(final_message)
        cmo_json = extract_json_object(final_message)

        if not final_answer and groupchat.messages:
            final_message = str(groupchat.messages[-1].get("content", ""))
            final_answer = extract_final_answer_from_cmo(final_message)
            cmo_json = extract_json_object(final_message)

        agent_outputs = extract_agent_outputs(groupchat.messages)
        timeline = build_timeline(groupchat.messages)

        diagnostician_answer = extract_diagnostician_answer(
            agent_outputs["diagnostician_response"]
        )

        clinical_auditor_answer = extract_clinical_auditor_answer(
            agent_outputs["clinical_auditor_response"]
        )

        intent_auditor_answer = extract_intent_auditor_answer(
            agent_outputs["intent_auditor_response"]
        )

        elapsed = time.perf_counter() - start_time

        classification = classify_case(
            gold=gold_key,
            diagnostician_answer=diagnostician_answer,
            clinical_auditor_answer=clinical_auditor_answer,
            intent_auditor_answer=intent_auditor_answer,
            final_answer=final_answer,
        )

        return {
            "error": False,
            "idx": idx,
            "question": question,
            "choices": choices_str,
            "correct_answer": gold_key,

            "diagnostician_answer": diagnostician_answer,
            "clinical_auditor_answer": clinical_auditor_answer,
            "intent_auditor_answer": intent_auditor_answer,
            "pred_letter": final_answer,

            "diagnostician_correct": classification["diagnostician_correct"],
            "clinical_auditor_correct": classification["clinical_auditor_correct"],
            "intent_auditor_correct": classification["intent_auditor_correct"],
            "is_correct": classification["final_correct"],

            "outcome_type": classification["outcome_type"],
            "collaboration_subtype": classification["collaboration_subtype"],

            "final_message": final_message,
            "cmo_decision_json": cmo_json,

            "agent_outputs": agent_outputs,
            "timeline": timeline,
            "raw_chat_history": groupchat.messages,

            "record": {
                "elapsed_seconds": round(elapsed, 3),
            },
        }

    except Exception as e:
        traceback.print_exc()
        elapsed = time.perf_counter() - start_time

        return {
            "error": True,
            "idx": idx,
            "question": question,
            "choices": choices_str,
            "correct_answer": gold_key,
            "error_type": type(e).__name__,
            "error_message": str(e),
            "record": {
                "elapsed_seconds": round(elapsed, 3),
            },
        }


# ============================================================
# File Saving Helpers
# ============================================================

def ensure_output_folders(base_dir: str) -> Dict[str, str]:
    folders = {
        "completed": os.path.join(base_dir, "completed"),
        "errors": os.path.join(base_dir, "errors"),

        "maintained_correct": os.path.join(
            base_dir, "analysis_cases", "1_maintained_correct"
        ),
        "corrected_by_pipeline": os.path.join(
            base_dir, "analysis_cases", "2_corrected_by_pipeline"
        ),
        "degraded_by_pipeline": os.path.join(
            base_dir, "analysis_cases", "3_degraded_by_pipeline"
        ),
        "maintained_incorrect": os.path.join(
            base_dir, "analysis_cases", "4_maintained_incorrect"
        ),
    }

    for folder in folders.values():
        os.makedirs(folder, exist_ok=True)

    return folders


def save_case_json(folder: str, idx: int, result: Dict[str, Any]) -> None:
    path = os.path.join(folder, f"case_{idx}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)


# ============================================================
# Main Benchmark Runner
# ============================================================

def main() -> None:
    parser = argparse.ArgumentParser(
        description="AutoGen MedQA Role-Specialised Assisted Revision Pipeline"
    )

    parser.add_argument(
        "-n",
        "--num_cases",
        type=int,
        default=None,
        help="Number of MedQA cases to run. Default: all cases.",
    )

    parser.add_argument(
        "-s",
        "--start_idx",
        type=int,
        default=0,
        help="Starting index in the MedQA test set.",
    )

    parser.add_argument(
        "--output_dir",
        type=str,
        default="autogen_medqa_assisted_revision_results",
        help="Directory to save results.",
    )

    parser.add_argument(
        "--skip_model_check",
        action="store_true",
        help="Skip Ollama Cloud API/model validation before running.",
    )

    args = parser.parse_args()

    if not args.skip_model_check:
        validate_cloud_api()

    ds = load_medqa()
    total = len(ds)
    indices = select_indices(total, args.start_idx, args.num_cases)

    if not indices:
        print("No cases selected.")
        return

    os.makedirs(args.output_dir, exist_ok=True)
    folders = ensure_output_folders(args.output_dir)

    print("=" * 70)
    print("AutoGen MedQA Role-Specialised Assisted Revision Full Run")
    print("=" * 70)
    print(f"Dataset: {DATASET_NAME} ({DATASET_SPLIT})")
    print(f"Initial Diagnostician model: {MODEL_DIAGNOSTICIAN}")
    print(f"Clinical Evidence Auditor model: {MODEL_CLINICAL_AUDITOR}")
    print(f"Question-Intent Auditor model: {MODEL_INTENT_AUDITOR}")
    print(f"Final CMO Reviser model: {MODEL_CMO}")
    print(f"Cases: {indices[0]} to {indices[-1]} | Total selected: {len(indices)}")
    print(f"Output directory: {args.output_dir}")
    print("=" * 70)

    results: List[Dict[str, Any]] = []
    benchmark_start = time.perf_counter()

    for i in tqdm(indices, desc="Running MedQA"):
        item = ds[i]
        result = process_single_case(item, i)

        if result.get("error") or not result.get("pred_letter"):
            save_case_json(folders["errors"], i, result)
            continue

        results.append(result)

        save_case_json(folders["completed"], i, result)

        outcome_type = result["outcome_type"]
        save_case_json(folders[outcome_type], i, result)

    benchmark_elapsed = time.perf_counter() - benchmark_start

    if results:
        final_gold = [r["correct_answer"] for r in results]
        final_pred = [r["pred_letter"] for r in results]

        diag_gold = [
            r["correct_answer"]
            for r in results
            if r["diagnostician_answer"] is not None
        ]
        diag_pred = [
            r["diagnostician_answer"]
            for r in results
            if r["diagnostician_answer"] is not None
        ]

        clinical_gold = [
            r["correct_answer"]
            for r in results
            if r["clinical_auditor_answer"] is not None
        ]
        clinical_pred = [
            r["clinical_auditor_answer"]
            for r in results
            if r["clinical_auditor_answer"] is not None
        ]

        intent_gold = [
            r["correct_answer"]
            for r in results
            if r["intent_auditor_answer"] is not None
        ]
        intent_pred = [
            r["intent_auditor_answer"]
            for r in results
            if r["intent_auditor_answer"] is not None
        ]

        final_accuracy = float(accuracy_score(final_gold, final_pred))
        final_correct_count = sum(r["is_correct"] for r in results)

        diagnostician_accuracy = (
            float(accuracy_score(diag_gold, diag_pred))
            if diag_gold and diag_pred
            else None
        )

        clinical_auditor_accuracy = (
            float(accuracy_score(clinical_gold, clinical_pred))
            if clinical_gold and clinical_pred
            else None
        )

        intent_auditor_accuracy = (
            float(accuracy_score(intent_gold, intent_pred))
            if intent_gold and intent_pred
            else None
        )

        total_case_time = sum(r["record"]["elapsed_seconds"] for r in results)
        avg_case_time = total_case_time / len(results)

        outcome_counts = Counter(r["outcome_type"] for r in results)
        subtype_counts = Counter(r["collaboration_subtype"] for r in results)

        parsed_diagnostician_answers = sum(
            1 for r in results if r["diagnostician_answer"] is not None
        )

        parsed_clinical_auditor_answers = sum(
            1 for r in results if r["clinical_auditor_answer"] is not None
        )

        parsed_intent_auditor_answers = sum(
            1 for r in results if r["intent_auditor_answer"] is not None
        )

    else:
        final_accuracy = 0.0
        final_correct_count = 0
        diagnostician_accuracy = None
        clinical_auditor_accuracy = None
        intent_auditor_accuracy = None
        total_case_time = 0.0
        avg_case_time = 0.0
        outcome_counts = Counter()
        subtype_counts = Counter()
        parsed_diagnostician_answers = 0
        parsed_clinical_auditor_answers = 0
        parsed_intent_auditor_answers = 0

    summary = {
        "models": {
            "initial_diagnostician": MODEL_DIAGNOSTICIAN,
            "clinical_evidence_auditor": MODEL_CLINICAL_AUDITOR,
            "question_intent_auditor": MODEL_INTENT_AUDITOR,
            "final_cmo_reviser": MODEL_CMO,
        },
        "pipeline": {
            "stage_1": "GPT-OSS Diagnostician produces the initial structured medical answer.",
            "stage_2": "Ministral Clinical Evidence Auditor checks whether the answer matches the patient's findings.",
            "stage_3": "Gemma Question-Intent Auditor checks whether the answer matches the exact task and answer options.",
            "stage_4": "GPT-OSS Final CMO revises or preserves the initial answer after integrating both audits.",
        },
        "dataset": {
            "name": DATASET_NAME,
            "split": DATASET_SPLIT,
        },
        "cases": {
            "attempted": len(indices),
            "completed": len(results),
            "errors": len(indices) - len(results),
        },
        "accuracy": {
            "diagnostician_accuracy": diagnostician_accuracy,
            "clinical_auditor_accuracy": clinical_auditor_accuracy,
            "intent_auditor_accuracy": intent_auditor_accuracy,
            "final_correct": final_correct_count,
            "final_accuracy": final_accuracy,
        },
        "parsing": {
            "parsed_diagnostician_answers": parsed_diagnostician_answers,
            "unparsed_diagnostician_answers": len(results) - parsed_diagnostician_answers,
            "parsed_clinical_auditor_answers": parsed_clinical_auditor_answers,
            "unparsed_clinical_auditor_answers": len(results) - parsed_clinical_auditor_answers,
            "parsed_intent_auditor_answers": parsed_intent_auditor_answers,
            "unparsed_intent_auditor_answers": len(results) - parsed_intent_auditor_answers,
        },
        "collaboration_outcomes": {
            "maintained_correct": outcome_counts.get("maintained_correct", 0),
            "corrected_by_pipeline": outcome_counts.get("corrected_by_pipeline", 0),
            "degraded_by_pipeline": outcome_counts.get("degraded_by_pipeline", 0),
            "maintained_incorrect": outcome_counts.get("maintained_incorrect", 0),
        },
        "collaboration_subtypes": dict(subtype_counts),
        "time": {
            "total_benchmark_seconds": round(benchmark_elapsed, 3),
            "sum_case_seconds": round(total_case_time, 3),
            "average_case_seconds": round(avg_case_time, 3),
        },
        "output_folders": folders,
    }

    summary_file = os.path.join(args.output_dir, "summary.json")

    with open(summary_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 70)
    print("Benchmark Complete")
    print("=" * 70)
    print(f"Attempted: {len(indices)}")
    print(f"Completed: {len(results)}")
    print(f"Errors: {len(indices) - len(results)}")
    print(f"Diagnostician accuracy: {diagnostician_accuracy}")
    print(f"Clinical Auditor accuracy: {clinical_auditor_accuracy}")
    print(f"Intent Auditor accuracy: {intent_auditor_accuracy}")
    print(f"Diagnostician answers parsed: {parsed_diagnostician_answers}/{len(results)}")
    print(f"Clinical Auditor answers parsed: {parsed_clinical_auditor_answers}/{len(results)}")
    print(f"Intent Auditor answers parsed: {parsed_intent_auditor_answers}/{len(results)}")
    print(f"Final correct: {final_correct_count}")
    print(f"Final accuracy: {final_accuracy:.4%}")
    print(f"Maintained correct: {outcome_counts.get('maintained_correct', 0)}")
    print(f"Corrected by pipeline: {outcome_counts.get('corrected_by_pipeline', 0)}")
    print(f"Degraded by pipeline: {outcome_counts.get('degraded_by_pipeline', 0)}")
    print(f"Maintained incorrect: {outcome_counts.get('maintained_incorrect', 0)}")
    print(f"Total benchmark time: {benchmark_elapsed:.2f} seconds")
    print(f"Average time per completed case: {avg_case_time:.2f} seconds")
    print(f"Summary saved to: {summary_file}")
    print("=" * 70)


if __name__ == "__main__":
    main()