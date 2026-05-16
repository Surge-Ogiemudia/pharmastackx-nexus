# PharmaStackX Nexus — Gemma 4 Good Hackathon

> **Mission:** To ensure that no patient ever leaves a hospital without the medicine they need because "nobody knew where it was."

PharmaStackX Nexus is an AI-orchestrated medicine discovery platform built for the world. It moves beyond "AI features" to a **True AI App** architecture where a single Gemma 4 "brain" handles intent classification, medicine extraction, pharmacist routing, and patient consultation.

Medicine stock failures aren't a local problem — they happen in the UK, the US, across Africa, and everywhere in between. Nexus is built to solve it wherever it occurs.

## 📺 [Watch the Demo Video](https://nexus.psx.ng/video)

## 🧠 The "One Brain" Architecture

Nexus is built around a central orchestrator (`nexus-brain.ts`). Every interaction — whether it's a typed query, a photograph of a prescription, or an informal WhatsApp message — flows through this brain.

- **Intent Classification:** Gemma 4 determines if the user needs a consultation, a drug search, or a structured request from a scan.
- **Medicine Extraction:** Vision-enabled Gemma 4 extracts brand names, strengths, and dosages from photos of medicine boxes and prescriptions with near-perfect accuracy.
- **Connection Routing:** The AI analyzes nearby pharmacists and scores them based on proximity, historical response rates, and stock likelihood to find the best match for the patient.
- **Real-time Visibility:** The **Nexus Dev Console** (visible in the demo) provides a real-time window into the AI's "thought process," making its decision-making transparent.

## ✈️ Offline Nexus (Digital Equity)

Connectivity gaps exist everywhere. Nexus solves this by integrating **Gemma 4 Edge** via MediaPipe and WebGPU.

- **Zero-Network Mode:** When offline, the app seamlessly switches from cloud inference (26B) to on-device inference (E2B).
- **On-Device Vision:** Patients can scan prescriptions and get medicine guidance even in "Airplane Mode," ensuring healthcare access is never blocked by a poor connection.

## 🛡️ Safety & Trust Layer (Autonomous Monitoring)

Healthcare AI requires a higher standard of trust. Nexus includes a custom safety layer (`nexus-safety.ts`) that monitors every AI output in real-time.

- **Chain-of-Thought Guard:** Automatically detects and prunes internal reasoning leaks, ensuring the patient sees only direct, professional advice.
- **Autonomous Self-Correction:** If the safety layer detects a failure pattern (double responses, "thinking leaks," or liability disclaimers), the Brain automatically triggers a **re-inference** with specific safety rules to fix the response before it reaches the user.
- **Failure Tracking:** A persistent log of AI hallucinations and pattern failures is maintained to drive continuous improvement of the system prompts.

## 🚀 Key Features

1. **AskRX:** Multilingual AI pharmacist — dosage, interactions, side effects in 9 languages (EN, FR, ES, AR, PT, Swahili, Yoruba, Igbo, Hausa).
2. **AI Scanner:** On-device vision extraction from medicine box or prescription photos.
3. **Smart Search:** Autonomous routing to nearby pharmacists with real-time availability responses.
4. **WhatsApp Pipeline:** Transforms informal group messages into structured platform requests.

## 🛠️ Technical Stack

- **Framework:** Next.js (App Router)
- **AI Models:** Gemma 4 (Cloud 26B via Google AI SDK / Edge E2B via MediaPipe WebGPU)
- **Styling:** Material UI + Framer Motion
- **Language:** TypeScript
- **Infrastructure:** Vercel (Deployed at [nexus.psx.ng](https://nexus.psx.ng))

## 📦 Getting Started

1. Clone the repository: `git clone https://github.com/Surge-Ogiemudia/pharmastackx-nexus`
2. Install dependencies: `npm install`
3. Add your `GEMINI_API_KEY` to `.env.local`
4. Run locally: `npm run dev`
5. Open [localhost:3000](http://localhost:3000)

---
*Built for the Gemma 4 Good Hackathon by Surge Ogiemudia / PharmaStackX.*
