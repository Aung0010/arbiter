# Arbiter — Collective LLM Debate for More Reliable AI

> Built a multi-LLM orchestration system that enables multiple language models to debate and reach consensus — improving answer quality, consistency, and transparency over single-model systems.

<!-- TODO: Add demo GIF here -->
<!-- ![Demo](docs/demo.gif) -->

**Tech Stack:** React · Node.js · Express · Ollama · Supabase (planned)

---

## Problem

Large Language Models often:
- Hallucinate confidently
- Produce inconsistent answers across runs
- Offer little transparency into reasoning

This limits their reliability in analytical and high-stakes use cases.

---

## Solution

Arbiter coordinates multiple independent LLMs to:

1. Generate initial answers in parallel  
2. Critique each other’s reasoning through structured debate  
3. Produce a final consensus answer via voting or abstention  

Instead of trusting a single model, reasoning becomes a **collective decision process.**

---

## Current Impact (Early Stage)

- ✅ Local multi-model runtime configured using Ollama  
- ✅ Backend orchestration scaffold implemented  
- ✅ Debate pipeline design finalized  
- ⏳ Consensus logic in progress  
- ⏳ Benchmark evaluation upcoming  

> Impact will evolve into quantitative metrics once experiments begin.

---

## Tech Stack

**Frontend:** React (Vite), Tailwind  
**Backend:** Node.js, Express  
**LLM Runtime:** Ollama (local inference)  
**Storage:** Supabase (planned)  
**Tooling:** GitHub, npm  

---

## How It Works (Concept)

User Prompt

↓

Multiple LLMs generate responses
↓

Structured debate rounds
↓

Consensus voting / abstention
↓

Final Answer + Logs

---

## ⚙️ Why Local Models?

Local open-source models enable:
- Cost control
- Repeatable experiments
- Greater orchestration control
- Safer iteration

Smaller models amplify measurable improvements — making research gains more visible.

---

## How to Run (Dev)

```bash
cd backend
npm install
npm run dev
```

---

## Roadmap

- Debate execution engine
- Consensus mechanisms
- Logging + metrics dashboard
- UI prototype
- Demo + deployment

---

## 👥 Team

MCS19 – Monash University FIT Final Year Project 2026
