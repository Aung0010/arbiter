# Response Schema Specification

## Purpose

This document defines the **standard response JSON schema** returned by the backend
of the multi-LLM collaborative reasoning system to the frontend.

The schema is designed to:

- Support **simple UI rendering** (final answer, confidence, status)
- Preserve **auditability and transparency** for research and evaluation
- Enable **future extensibility** (weighted voting, abstention, verifier agents)

The response format is inspired by modern LLM applications (e.g. ChatGPT),
while explicitly exposing structured collaboration metadata.

---

## 2. High-Level Structure

The backend returns a single JSON object with four conceptual layers:

```text
Response
├── meta            # request & system metadata
├── final           # user-facing final answer
├── consensus       # aggregation & voting outcome
└── trace           # multi-LLM reasoning and discussion logs


Top-Level Object:

    {
    "meta": { ... },
    "final": { ... },
    "consensus": { ... },
    "trace": { ... }
    }

meta:

    "meta": {
    "request_id": "uuid-string",
    "timestamp": "2025-09-12T14:32:01Z",
    "task_type": "reasoning | math | commonsense | temporal | adversarial",
    "dataset": "StrategyQA | CommonsenseQA | GSM8K | AQuA | ANLI | custom",
    "system_version": "v1.0"
    }

final:

    "final": {
    "answer": "Yes, the statement is false because ...",
    "confidence": 0.87,
    "confidence_level": "high",
    "abstained": false
    }

consensus:

    "consensus": {
    "method": "majority_vote | weighted_vote | judge_selection",
    "num_agents": 3,
    "num_rounds": 2,
    "agreement_ratio": 0.67,
    "winning_answer": "Yes",
    "votes": [
        { "agent_id": "agent_1", "answer": "Yes" },
        { "agent_id": "agent_2", "answer": "Yes" },
        { "agent_id": "agent_3", "answer": "No" }
    ]
    }

trace:

    "trace": {
    "rounds": [
        {
        "round": 1,
        "agents": [
            {
            "agent_id": "agent_1",
            "model": "gpt-4.1",
            "answer": "Yes",
            "confidence": 0.82,
            "rationale": "The premise contradicts ..."
            },
            {
            "agent_id": "agent_2",
            "model": "claude-3",
            "answer": "No",
            "confidence": 0.60,
            "rationale": "There is an edge case ..."
            }
        ]
        },
        {
        "round": 2,
        "agents": [
            {
            "agent_id": "agent_1",
            "answer": "Yes",
            "confidence": 0.85,
            "rationale": "After considering counterpoints ..."
            }
        ]
        }
    ]
    }
    