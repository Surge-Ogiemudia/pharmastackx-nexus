# PharmaStackX Nexus — Gemma 4 Good Hackathon

> **Mission:** To ensure that no patient ever leaves a hospital without the medicine they need because "nobody knew where it was."

PharmaStackX Nexus is an AI-orchestrated medicine discovery platform designed for the Nigerian healthcare context. It moves beyond "AI features" to a **True AI App** architecture where a single Gemma 4 "brain" handles intent classification, medicine extraction, pharmacist routing, and patient consultation.

## 📺 [Watch the Demo Video](https://nexus.psx.ng/video)

## 🧠 The "One Brain" Architecture

Nexus is built around a central orchestrator (`nexus-brain.ts`). Every interaction — whether it's a typed query, a photograph of a prescription, or an informal WhatsApp message — flows through this brain.

- **Intent Classification:** Gemma 4 determines if the user needs a consultation, a drug search, or a structured request from a scan.
- **Medicine Extraction:** vision-enabled Gemma 4 extracts brand names, strengths, and dosages from photos of medicine boxes and prescriptions with near-perfect accuracy.
- **Connection Routing:** The AI analyzes nearby pharmacists and scores them based on proximity, historical response rates, and stock likelihood to find the best match for the patient.
- **Real-time Visibility:** The **Nexus Dev Console** (visible in the demo) provides a real-time window into the AI's "thought process," making its decision-making transparent.

## ✈️ Offline Nexus (Digital Equity)

Nigeria faces significant connectivity challenges. Nexus solves this by integrating **Gemma 4 Edge** via MediaPipe and WebGPU.

- **Zero-Network Mode:** When offline, the app seamlessly switches from cloud inference (26B) to on-device inference (E2B).
- **On-Device Vision:** Patients can scan prescriptions and get medicine guidance even in "Airplane Mode," ensuring healthcare access is never blocked by a poor data connection.

## 🚀 Key Features

1. **AskRX (Clip 6):** Multilingual AI pharmacist consultation with local Nigerian brand context.
2. **AI Scanner (Clip 7):** On-device vision extraction for Grandma-friendly medicine discovery.
3. **Smart Search (Clip 8):** Autonomous routing to real Benin City pharmacists.
4. **WhatsApp Pipeline (Clip 9):** Transforming informal group messages into structured platform requests.

## 🛠️ Technical Stack

- **Framework:** Next.js 15 (App Router)
- **AI Models:** Gemma 4 (Cloud 26B via Google AI SDK / Edge E2B via MediaPipe WebGPU)
- **Styling:** Material UI + Framer Motion (Premium animations)
- **Language:** TypeScript
- **Infrastructure:** Vercel (Deployed at [nexus.psx.ng](https://nexus.psx.ng))

## 📦 Getting Started

1. Clone the repository: `git clone https://github.com/Surge-Ogiemudia/pharmastackx-nexus`
2. Install dependencies: `npm install`
3. Add your `GEMINI_API_KEY` to `.env.local`
4. Run locally: `npm run dev`
5. Open [localhost:3000](http://localhost:3000)

---
*Built for the Gemma 4 Good Hackathon by PharmaStackX.*
