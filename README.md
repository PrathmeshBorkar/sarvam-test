# CivicVoice - Voice-First Indian Language Civic Complaint Portal

CivicVoice is a hackathon project built for citizens who speak Indian languages (Marathi, Hindi, etc.) to file civic infrastructure complaints using voice and photo, without logging in.

Officials can view complaints, award contractor bids, and inspect tamper-proof repair proofs. When a fix is verified, the citizen receives a spoken audio update and an automated confirmation call via Sarvam Voice Agents to confirm or dispute the fix.

---

## Technical Stack & Sarvam AI Models
* **Frontend**: React + Vite (Mobile-first, touch targets $\ge 48\text{px}$, responsive).
* **Backend**: Node.js + Express (ES Modules) with Multer, Rate Limiting, and CORS.
* **Database & Storage**: Supabase (PostgreSQL + `photos` bucket) with local in-memory fallback for testing.
* **Sarvam AI APIs**:
  * **Speech-to-Text**: `POST /speech-to-text` with model `saaras:v3` (WAV audio encoding).
  * **Chat / Reasoning**: `POST /v1/chat/completions` with model `sarvam-105b`.
  * **Translation**: `POST /translate` with model `sarvam-translate:v1` (explicit `source_language_code: "en-IN"`, `target_language_code: "mr-IN"` / `"hi-IN"`).
  * **Text-to-Speech**: `POST /text-to-speech` with model `bulbul:v3` and speaker `priya`.
  * **Voice Agents (Phase 4B)**: `POST https://apps.sarvam.ai/api/outbounds/v1/orgs/:org_id/workspaces/:workspace_id/outbounds` for automated outbound phone confirmation calls.

---

## Setup & Configuration

### 1. Environment Variables (`server/.env`)
```ini
# Core Sarvam Model API Key
SARVAM_API_KEY=sk_4pwumbfu_MGkJocVtEqvQfaSceCORh5hl
PORT=5000
WEB_ORIGIN=http://localhost:5173

# Optional: Supabase (Local fallback enabled if blank)
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# Sarvam Voice Agents (Phase 4B Outbound Calls)
SARVAM_VOICE_API_KEY=
SARVAM_ORG_ID=
SARVAM_WORKSPACE_ID=
SARVAM_AGENT_APP_ID=
SARVAM_WEBHOOK_SECRET=
PUBLIC_URL=http://localhost:5000
```

### 2. Database Setup (Supabase)
Paste `server/db.sql` into the **Supabase SQL Editor** to create:
* `reports` table (with `phone`, `call_consent`, `call_status`, `call_attempt_id`, etc.)
* `bids` table
* `completions` table
* `photos` storage bucket

---

## How to Run

### Start Backend
```powershell
cd server
npm start
```
Runs at `http://localhost:5000`.

### Start Frontend
```powershell
cd client
npm run dev
```
Runs at `http://localhost:5173`.

---

## Testing Phase 4B: Outbound Confirmation Call

### Prerequisites for Phone Testing
1. Add your Voice Agent credentials to `server/.env`:
   * `SARVAM_VOICE_API_KEY`
   * `SARVAM_ORG_ID`
   * `SARVAM_WORKSPACE_ID`
   * `SARVAM_AGENT_APP_ID`
2. Run an HTTPS tunnel (e.g. `ngrok` or `cloudflared`) to expose port 5000:
   ```bash
   ngrok http 5000
   ```
   Set `PUBLIC_URL=https://<your-ngrok-subdomain>.ngrok-free.app` in `server/.env`.
   This allows Sarvam to deliver the webhook to `https://<your-ngrok-subdomain>.ngrok-free.app/api/voice/webhook`.

### Method A: Standalone CLI Call to Your Phone
Test the instant outbound call directly to your own phone number:
```powershell
cd server
node test-voice-agent.js <YOUR_10_DIGIT_MOBILE_NUMBER>
```
* The script validates your 10-digit Indian number, masks it in output (`******1234`), calls Sarvam Instant Outbound API, and prints the `attempt_id`.
* Your phone will receive an automated call from the Sarvam Voice Agent.

### Method B: Full End-to-End Workflow in the App
1. Open `http://localhost:5173/` on your phone (or browser).
2. Tap the mic button and speak a complaint in Marathi or Hindi (e.g., *"रस्त्यावर मोठा खड्डा पडला आहे"*).
3. Enter **your own 10-digit mobile number** and check **"Call me via Sarvam Voice Agent when this is fixed"**.
4. Tap **Submit Complaint**. You will be redirected to `/status/:token`.
5. Open `http://localhost:5173/officials`:
   * Click **+ Add Demo Bids**.
   * Click **Award** on a bid.
   * Click **Open Contractor Proof Page**.
6. On `/contractor/:id`:
   * Take or upload an "after" photo.
   * Click **Submit Proof of Work**.
7. Tamper verification runs:
   * Proximity $\le 50\text{ m}$ checked via Haversine.
   * Timestamp checked against server award time.
   * SHA-256 hash verified to differ from initial photo.
8. Status transitions to `COMPLETED`:
   * The Sarvam Voice Agent triggers an automated call to **your phone**.
   * When you answer and speak your verdict (e.g. *"काम झाले नाही, अजून खड्डा आहे"*), Sarvam POSTs the webhook to `/api/voice/webhook`.
   * If disputed, the report is automatically marked `REOPENED` with a prominent red badge on `/officials`.
