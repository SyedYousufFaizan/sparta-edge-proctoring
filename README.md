# 🛡️ S.P.A.R.T.A. — Smart Platform for Adversarial Readiness & Technical Assessment

<div align="center">

![S.P.A.R.T.A. Banner](https://img.shields.io/badge/S.P.A.R.T.A.-FAANG%20Interrogation%20Engine-FF0033?style=for-the-badge&logo=matrix&logoColor=white)

**"Battle-Test Candidates Before the Real Interview"**

*Eliminate resume inflation, catch phantomware, and rebuild battle-tested software engineers.*

[![Next.js 16](https://img.shields.io/badge/Next.js-16%20Turbopack-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python%203.13-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Groq Fast API](https://img.shields.io/badge/Groq-Fast%20Inference-f55036?style=flat-square)](https://groq.com/)
[![Deepgram](https://img.shields.io/badge/Deepgram-Nova--2%20%26%20Aura-13EF93?style=flat-square)](https://deepgram.com/)
[![NVIDIA NIM](https://img.shields.io/badge/NVIDIA-Nemotron--OCR--v1-76B900?style=flat-square&logo=nvidia)](https://build.nvidia.com/)

</div>

---

## 🎯 Overview

**S.P.A.R.T.A.** (**Smart Platform for Adversarial Readiness & Technical Assessment**) is an elite, high-stakes AI-powered technical auditing and interrogation platform. Designed to bridge the gap between exaggerated resume claims and true technical competence, S.P.A.R.T.A. cross-references uploaded candidate resumes against real GitHub code evidence and target Job Descriptions (JDs).

It operates through a **Two-Phase Architecture**:
1. **Phase 1: The Scrutiny (The Hot Seat)** — A ruthless technical hiring manager persona that stress-tests under-the-hood implementation mechanics across 4 structured turns.
2. **Phase 2: The Rebuild & Battle Audit Report (The Coach)** — A supportive career strategist that converts the candidate's actual voice defense into FAANG-grade XYZ/STAR resume patches.

---

## ✨ Key Features

### 🔍 1. Hybrid PDF Extraction & NVIDIA OCR Bridge
- **Native Fast-Lane**: Instant digital vector text extraction using PyMuPDF (`fitz`).
- **NVIDIA Nemotron-OCR-v1 Fallback**: Automatic 3.0x lossless PNG rendering and dedicated NVIDIA NIM inference for scanned PDF pages.

### 📊 2. Dynamic Combat Readiness Scoring ($0-100$)
- **Weighted Mathematical Post-Processor**: Calculates dynamic scores based on actual evidence rather than static anchoring:
  $$\text{Score} = \text{round}(0.40 \times \text{Experience} + 0.30 \times \text{Skills} + 0.15 \times \text{Formatting} + 0.15 \times \text{ATS})$$
- **Semantic Skill Extraction**: Context-aware missing skill analysis (e.g. recognizing `NodeJS` = `Node.js`, `Managed 10-person team` = `team management`). Returns `[]` when all requirements are satisfied.

### 🎙️ 3. Full-Screen Voice Interrogation Terminal (`/interrogation`)
- **Real-Time Voice Recognition**: Microsecond streaming STT powered by **Deepgram Nova-2**.
- **Natural Voice Synthesis**: Spoken audio generation via **Deepgram Aura Athena** with real-time word reveal.
- **Dynamic Programmatic State Machine**:
  - Replaces fragile LLM prompt-planning with a strict Python-based state machine that ensures rigid 1-question pacing across 6-8+ turns.
  - **Phase 1 (Claims Verification)**: Systematically interrogates 3-4 domains extracted from the candidate's actual resume/code overlap.
  - **Phase 1 Scenario**: Injects a dynamically generated "What-If" system design challenge scaled to the target seniority level.
  - **Phase 2 (Missing Skill Gaps)**: Pivots to grill the candidate on 2-3 domains explicitly required by the Job Description but missing from their resume.
- **Adaptive Follow-Up Logic**: Dynamically triggers follow-up questions if the candidate dodges or provides weak answers, but skips them if the candidate verbally surrenders.
- **Async Audio Race Safety**: Immediate voice cutoff and auto-transition to the Final Report when the AI concludes the final domain.

### 📄 4. S.P.A.R.T.A. Battle Audit Report
- Generates 3 copy-pasteable FAANG-grade XYZ/STAR resume bullets built directly from the candidate's **spoken defense transcript**.

---

## 🚀 AI & Neural Network Models Stack

| Model Name | Provider | Role in S.P.A.R.T.A. |
| :--- | :--- | :--- |
| **HEAVY_MODEL (`gpt-oss-120b`)** | Groq / OpenAI API | **Flagship Audit & Interrogation Brain**: Technical critique, dynamic scoring, State Machine, and STAR resume reconstruction. |
| **FAST_MODEL (`gpt-oss-20b`)** | Groq / OpenAI API | **Gatekeeper**: Ultra-fast resume validation checking document structure in `< 400ms`. |
| **NVIDIA Nemotron-OCR-v1** | NVIDIA NIM API | **High-Res OCR Engine**: Lossless PNG OCR for scanned PDF resumes. |
| **Deepgram Nova-2** | Deepgram | **Real-Time STT**: Microsecond streaming speech recognition. |
| **Deepgram Aura Athena** | Deepgram | **Natural TTS**: Neural voice synthesis for live interrogation responses. |
| **PyMuPDF (`fitz`)** | Open Source | **Digital Vector Extraction**: Zero-latency native PDF parser. |

---

## 🛠️ Project Structure

```
S.P.A.R.T.A/
├── backend/
│   ├── main.py              # FastAPI server & route handlers
│   ├── brain.py             # LLM State Machine Engine & dynamic scoring logic
│   ├── pipeline.py          # NVIDIA Nemotron-OCR-v1 & PyMuPDF hybrid bridge
│   ├── ingest_github.py     # GitHub repository scrapers
│   ├── ingest_pdf.py        # PDF text parsers
│   └── requirements.txt     # Python dependencies
│
└── frontend/
    ├── app/
    │   ├── interrogation/   # Dedicated Full-Screen Voice Terminal & Battle Report
    │   │   └── page.tsx
    │   ├── api/             # Next.js API routes (deepgram, interrogation, rebuild)
    │   ├── page.tsx         # Main Audit Dashboard & File Upload
    │   └── layout.tsx       # Root layout & Metadata
    ├── public/              # Matrix theme assets
    ├── package.json         # Node.js dependencies
    └── next.config.ts       # Next.js 16 configuration
```

---

## 📦 Installation & Setup

### Prerequisites
- **Node.js**: v18+ and `pnpm` (or `npm`)
- **Python**: 3.11+
- **API Keys**: Groq API Key, Deepgram API Key, NVIDIA API Key

---

### 1. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

Create a `.env` file inside `backend/`:
```env
GROQ_API_KEY=your_groq_api_key_here
DEEPGRAM_API_KEY=your_deepgram_api_key_here
NVIDIA_API_KEY=your_nvidia_api_key_here
GITHUB_TOKEN=your_github_token_here  # Optional
```

Start the FastAPI server:
```bash
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```
- **Backend API**: `http://127.0.0.1:8000`
- **Swagger Documentation**: `http://127.0.0.1:8000/docs`

---

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
pnpm install

# Create local environment file
```
Create `.env.local` inside `frontend/`:
```env
DEEPGRAM_API_KEY=your_deepgram_api_key_here
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

Start the Next.js dev server:
```bash
pnpm dev
```
- **Frontend App**: `http://localhost:3000`
- **Voice Interrogation Terminal**: `http://localhost:3000/interrogation`

---

## 🔌 API Endpoints Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `POST /analyze` | `POST` | Cross-references uploaded PDF resume vs. GitHub repository & Job Description. |
| `POST /chat` | `POST` | AI interrogation endpoint driven by a dynamic Python state machine. |
| `POST /rebuild` | `POST` | Generates 3 STAR resume patches derived from the candidate's spoken defense. |
| `GET /api/deepgram` | `GET` | Issue temporary Deepgram API tokens for client-side STT/TTS streaming. |
| `POST /api/interrogation` | `POST` | Proxy handler for live two-phase voice interrogation turns. |

---

## 🎨 UI Aesthetic & Design Philosophy

- **Matrix Terminal Aesthetic**: Deep dark mode (`#000000`), neon green highlights (`#00FF41`), and high-contrast red alert indicators (`#EF4444`).
- **CMD Block Cursor**: Sharp rectangular terminal I-beam block cursors (`█`) with glowing aura animations.
- **Full Transparency**: No silent swallows or dummy score fallbacks.

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for details.

<div align="center">

**S.P.A.R.T.A. Engine — Battle-Tested Software Engineering**

</div>
