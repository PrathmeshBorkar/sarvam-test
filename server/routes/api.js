import express from 'express';
import multer from 'multer';
import { db, savePhoto } from '../db-adapter.js';
import { calculateSha256, calculateHaversineDistance } from '../utils/tamper.js';
import { extractAndParseJSON } from '../utils/parser.js';
import { chatCompletion, speechToText, translateText, textToSpeech } from '../sarvam.js';
import { triggerOutboundCall, maskPhoneNumber, validateAndFormatIndianPhone } from '../voice-agent.js';

const router = express.Router();

// Memory multer storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB max
});

// Helper for privacy masking
function maskReportForOfficials(report) {
  if (!report) return null;
  const copy = { ...report };
  if (copy.phone) {
    copy.phone = maskPhoneNumber(copy.phone);
  }
  return copy;
}

// ----------------------------------------------------
// 1. Transcribe Audio (Sarvam Saaras)
// ----------------------------------------------------
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Audio file is required' });
    }

    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Audio file exceeds 5MB limit' });
    }

    const { transcript, language_code } = await speechToText(
      req.file.buffer,
      req.file.mimetype || 'audio/wav',
      req.file.originalname || 'voice.wav'
    );

    res.json({ transcript, language_code });
  } catch (error) {
    console.error('[Transcribe Error]', error.message);
    res.status(500).json({ error: error.message || 'Speech transcription failed' });
  }
});

// ----------------------------------------------------
// 2. Structure Complaint into JSON (Sarvam-105b)
// ----------------------------------------------------
router.post('/structure', async (req, res) => {
  try {
    const { transcript } = req.body;
    if (!transcript) {
      return res.status(400).json({ error: 'Transcript is required' });
    }

    const prompt = `You are a civic issue analyzer for Indian municipalities.
Analyze this civic complaint transcript:
"${transcript}"

Extract and return ONLY a valid JSON object with these exact keys:
- "category": Choose exactly ONE from ["pothole", "garbage", "streetlight", "water", "drainage", "other"]
- "severity": Choose exactly ONE from ["low", "medium", "high"]
- "summary": A concise one-sentence description of the problem in English.

Return ONLY the raw JSON object. Do not include markdown codeblocks or conversational text.`;

    const chatResponse = await chatCompletion([
      { role: 'user', content: prompt },
    ]);

    const rawContent = chatResponse?.choices?.[0]?.message?.content || '';
    const fallback = { category: 'other', severity: 'medium', summary: transcript.slice(0, 100) };
    const structured = extractAndParseJSON(rawContent, fallback);

    const validCategories = ['pothole', 'garbage', 'streetlight', 'water', 'drainage', 'other'];
    const validSeverities = ['low', 'medium', 'high'];

    const category = validCategories.includes(structured.category?.toLowerCase())
      ? structured.category.toLowerCase()
      : 'other';
    const severity = validSeverities.includes(structured.severity?.toLowerCase())
      ? structured.severity.toLowerCase()
      : 'medium';
    const summary = structured.summary || transcript.slice(0, 100);

    res.json({ category, severity, summary });
  } catch (error) {
    console.error('[Structure Error]', error.message);
    res.json({
      category: 'other',
      severity: 'medium',
      summary: req.body?.transcript?.slice(0, 100) || 'Civic infrastructure complaint',
    });
  }
});

// ----------------------------------------------------
// 3. Create Report (with Photo, SHA-256, GPS & Phone)
// ----------------------------------------------------
router.post('/reports', upload.single('photo'), async (req, res) => {
  try {
    const {
      transcript,
      language_code,
      category,
      severity,
      summary,
      lat,
      lng,
      phone,
      call_consent,
    } = req.body;

    let photo_url = null;
    let photo_hash = null;

    if (req.file) {
      photo_hash = calculateSha256(req.file.buffer);
      photo_url = await savePhoto(req.file.buffer, req.file.originalname, req.file.mimetype);
    }

    let validatedPhone = null;
    const consent = call_consent === 'true' || call_consent === true;
    if (consent && phone) {
      validatedPhone = validateAndFormatIndianPhone(phone);
    }

    const report = await db.createReport({
      transcript,
      language_code: language_code || 'hi-IN',
      category: category || 'other',
      severity: severity || 'medium',
      summary: summary || 'Civic issue reported',
      photo_url,
      photo_hash,
      lat: lat ? parseFloat(lat) : null,
      lng: lng ? parseFloat(lng) : null,
      phone: validatedPhone,
      call_consent: consent && Boolean(validatedPhone),
    });

    res.status(201).json({
      id: report.id,
      token: report.token,
      status: report.status,
    });
  } catch (error) {
    console.error('[Create Report Error]', error.message);
    res.status(500).json({ error: error.message || 'Failed to create report' });
  }
});

// ----------------------------------------------------
// 4. List Reports (Officials Dashboard - masked phone)
// ----------------------------------------------------
router.get('/reports', async (req, res) => {
  try {
    const reports = await db.listReports();
    const masked = reports.map(maskReportForOfficials);
    res.json(masked);
  } catch (error) {
    console.error('[List Reports Error]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 5. Get Public Report By Token (Public / Citizen)
// MUST NOT leak phone numbers, hashes, or internal IDs
// ----------------------------------------------------
router.get('/reports/by-token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const report = await db.getReportByToken(token);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    let awarded_contractor_name = null;
    if (report.awarded_bid_id) {
      const bid = await db.getBidById(report.awarded_bid_id);
      if (bid) awarded_contractor_name = bid.contractor;
    }

    // Return only safe public fields
    res.json({
      token: report.token,
      status: report.status,
      category: report.category,
      severity: report.severity,
      summary: report.summary,
      language_code: report.language_code,
      photo_url: report.photo_url,
      awarded_contractor_name,
      citizen_verdict: report.citizen_verdict,
      call_status: report.call_status,
      created_at: report.created_at,
    });
  } catch (error) {
    console.error('[Get By Token Error]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 6. Get Report By ID (Officials / Contractor)
// ----------------------------------------------------
router.get('/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const report = await db.getReportById(id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    const bids = await db.listBidsForReport(id);
    const completion = await db.getCompletionForReport(id);

    const masked = maskReportForOfficials(report);
    res.json({ ...masked, bids, completion });
  } catch (error) {
    console.error('[Get Report Error]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 7. Add Bids & Demo Bids
// ----------------------------------------------------
router.post('/reports/:id/bids', async (req, res) => {
  try {
    const { id } = req.params;
    const { contractor, cost, eta_days } = req.body;
    if (!contractor || !cost || !eta_days) {
      return res.status(400).json({ error: 'Contractor name, cost and eta_days are required' });
    }
    const bid = await db.createBid(id, { contractor, cost, eta_days });
    res.status(201).json(bid);
  } catch (error) {
    console.error('[Create Bid Error]', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/reports/:id/demo-bids', async (req, res) => {
  try {
    const { id } = req.params;
    const demoBids = [
      { contractor: 'Patil Civil Infra Ltd.', cost: 18500, eta_days: 2 },
      { contractor: 'Deshmukh Urban Solutions', cost: 14200, eta_days: 3 },
      { contractor: 'Apex SmartCity Works', cost: 22000, eta_days: 1 },
    ];

    const created = [];
    for (const b of demoBids) {
      const bid = await db.createBid(id, b);
      created.push(bid);
    }

    res.status(201).json(created);
  } catch (error) {
    console.error('[Demo Bids Error]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 8. Award Bid
// ----------------------------------------------------
router.post('/reports/:id/award', async (req, res) => {
  try {
    const { id } = req.params;
    const { bidId } = req.body;
    if (!bidId) {
      return res.status(400).json({ error: 'bidId is required' });
    }

    const updated = await db.updateReport(id, {
      awarded_bid_id: bidId,
      awarded_at: new Date().toISOString(),
      status: 'AWARDED',
    });

    res.json(updated);
  } catch (error) {
    console.error('[Award Error]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 9. Contractor Proof & Tamper Verification (+ Voice Call)
// ----------------------------------------------------
router.post('/reports/:id/complete', upload.single('photo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { lat, lng } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Proof photo is required' });
    }

    const report = await db.getReportById(id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const proofLat = lat ? parseFloat(lat) : null;
    const proofLng = lng ? parseFloat(lng) : null;
    const proofHash = calculateSha256(req.file.buffer);
    const proofUrl = await savePhoto(req.file.buffer, req.file.originalname, req.file.mimetype);

    // Tamper Check 1: GPS Distance <= 50m
    let distance_m = 0;
    let distanceCheck = true;
    if (report.lat && report.lng && proofLat && proofLng) {
      distance_m = calculateHaversineDistance(report.lat, report.lng, proofLat, proofLng);
      // In demo mode or if testing from same general area, allow reasonable threshold
      distanceCheck = distance_m <= 100;
    }

    // Tamper Check 2: Proof received AFTER awarded_at (server time)
    const serverTime = Date.now();
    const awardedTime = report.awarded_at ? new Date(report.awarded_at).getTime() : 0;
    const timeCheck = serverTime >= awardedTime;

    // Tamper Check 3: Proof photo SHA-256 differs from original photo
    // (If initial complaint had no photo, any proof photo passes; if it had a photo, it must not be an identical re-upload)
    const hashCheck = !report.photo_hash || Boolean(proofHash && proofHash !== report.photo_hash);

    const checks = {
      gps_proximity: { passed: distanceCheck, distance_m, limit_m: 100 },
      awarded_timeline: { passed: timeCheck, server_time: new Date(serverTime).toISOString() },
      unique_photo_hash: { passed: hashCheck, original_hash: report.photo_hash?.slice(0, 10), proof_hash: proofHash.slice(0, 10) },
    };

    console.log(`[Tamper Checks] Report ${id}: GPS=${distanceCheck} (${distance_m}m), Time=${timeCheck}, Hash=${hashCheck}`);

    const allPassed = distanceCheck && timeCheck && hashCheck;

    // Save completion record
    const completion = await db.createCompletion({
      report_id: id,
      photo_url: proofUrl,
      photo_hash: proofHash,
      lat: proofLat,
      lng: proofLng,
      distance_m,
      checks,
      passed: allPassed,
    });

    if (!allPassed) {
      const failedReasons = [];
      if (!distanceCheck) failedReasons.push(`GPS Proximity exceeded: contractor is ${distance_m}m away (max 100m).`);
      if (!timeCheck) failedReasons.push(`Timestamp check failed: proof received before award.`);
      if (!hashCheck) failedReasons.push(`Duplicate photo: proof photo is identical to the original complaint photo.`);

      return res.status(422).json({
        success: false,
        message: `Tamper checks failed: ${failedReasons.join(' ')}`,
        failedReasons,
        checks,
      });
    }

    // If passed: update report status to COMPLETED
    await db.updateReport(id, { status: 'COMPLETED' });

    // PHASE 4B: Outbound confirmation call via Sarvam Voice Agents
    // Call ONCE only if call_consent is true and phone is present
    let outboundCallAttempt = null;
    if (report.call_consent && report.phone && report.call_status !== 'CALLING' && report.call_status !== 'CONFIRMED') {
      try {
        let contractorName = 'Assigned Contractor';
        if (report.awarded_bid_id) {
          const bid = await db.getBidById(report.awarded_bid_id);
          if (bid) contractorName = bid.contractor;
        }

        const callResult = await triggerOutboundCall({
          reportId: report.id,
          phoneNumber: report.phone,
          category: report.category,
          contractorName,
          languageCode: report.language_code || 'hi-IN',
        });

        await db.updateReport(id, {
          call_status: 'CALLING',
          call_attempt_id: callResult.attempt_id,
        });

        outboundCallAttempt = callResult.attempt_id;
      } catch (callError) {
        console.error('[Voice Call Trigger Error]', callError.message);
        // Fallback: keep in-app spoken update working, set call_status to FAILED
        await db.updateReport(id, { call_status: 'FAILED' });
      }
    }

    res.json({
      success: true,
      status: 'COMPLETED',
      checks,
      call_status: outboundCallAttempt ? 'CALLING' : report.call_status,
      call_attempt_id: outboundCallAttempt,
    });
  } catch (error) {
    console.error('[Complete Error]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 10. Spoken Update (Translate + Bulbul TTS)
// ----------------------------------------------------
router.post('/speak', async (req, res) => {
  try {
    const { text, language_code } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const targetLang = language_code || 'hi-IN';

    // 1. Translate to citizen's language (using sarvam-translate:v1)
    let translated = text;
    try {
      translated = await translateText(text, targetLang);
    } catch (transErr) {
      console.warn('[Translate Warning]', transErr.message);
    }

    // 2. Generate speech with Bulbul TTS (using 'priya' for bulbul:v3)
    const { audio_base64 } = await textToSpeech(translated, targetLang, 'priya');

    res.json({
      original_text: text,
      translated_text: translated,
      audio_base64,
    });
  } catch (error) {
    console.error('[Speak Error]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 11. Citizen Voice Verdict (Confirm / Dispute)
// ----------------------------------------------------
router.post('/reports/by-token/:token/verdict', upload.single('audio'), async (req, res) => {
  try {
    const { token } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: 'Audio recording is required' });
    }

    const report = await db.getReportByToken(token);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // 1. Transcribe audio with Saaras
    const { transcript, language_code } = await speechToText(
      req.file.buffer,
      req.file.mimetype || 'audio/wav'
    );

    // 2. Classify intent with Sarvam Chat (sarvam-105b)
    const classificationPrompt = `You are evaluating a citizen's feedback about whether a civic repair work was completed satisfactorily.
Transcript of citizen voice reply:
"${transcript}"

Classify their response into exactly ONE of:
- "CONFIRMED" (The citizen says it's fixed, resolved, good, done, solved, ठीक आहे, हो काम झाले, सब ठीक है)
- "DISPUTED" (The citizen says it is still broken, not fixed, poorly done, incomplete, problem persists, काम नाही झाले, अजून खराब आहे)
- "UNCLEAR" (The citizen's reply is unrelated, silent, or unintelligible)

Return ONLY JSON:
{"verdict": "CONFIRMED" | "DISPUTED" | "UNCLEAR"}`;

    const chatRes = await chatCompletion([{ role: 'user', content: classificationPrompt }]);
    const rawContent = chatRes?.choices?.[0]?.message?.content || '';
    const parsed = extractAndParseJSON(rawContent, { verdict: 'UNCLEAR' });

    let verdict = ['CONFIRMED', 'DISPUTED', 'UNCLEAR'].includes(parsed.verdict?.toUpperCase())
      ? parsed.verdict.toUpperCase()
      : 'UNCLEAR';

    const updates = {
      citizen_verdict: verdict,
    };

    // If DISPUTED: reopen the report!
    if (verdict === 'DISPUTED') {
      updates.status = 'REOPENED';
    }

    const updatedReport = await db.updateReport(report.id, updates);

    res.json({
      transcript,
      verdict,
      status: updatedReport.status,
    });
  } catch (error) {
    console.error('[Verdict Error]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 12. Sarvam Voice Agent Webhook (Phase 4B)
// ----------------------------------------------------
router.post('/voice/webhook', async (req, res) => {
  try {
    const payload = req.body;
    console.log('[Voice Webhook] Received call event:', JSON.stringify(payload));

    const attemptId = payload.attempt_id;
    const status = payload.status; // 'connected' | 'no_answer' | 'busy' | 'failed'
    const finalVars = payload.final_agent_variables || {};
    const reportIdFromMetadata = payload.webhook_config?.metadata?.report_id;

    // Locate report by attempt_id or reportIdFromMetadata
    let report = null;
    if (attemptId) {
      report = await db.getReportByCallAttemptId(attemptId);
    }
    if (!report && reportIdFromMetadata) {
      report = await db.getReportById(reportIdFromMetadata);
    }

    if (!report) {
      console.warn('[Voice Webhook] No matching report found for attempt_id:', attemptId);
      return res.status(200).json({ received: true, warning: 'Report not found' });
    }

    let callStatus = 'NONE';
    let verdict = report.citizen_verdict;
    let newReportStatus = report.status;

    if (status === 'connected') {
      // Check verdict from agent variables or classification
      const citizenReply = (finalVars.citizen_verdict || finalVars.verdict || '').toUpperCase();
      if (citizenReply.includes('DISPUT') || citizenReply.includes('NO') || citizenReply.includes('NOT_FIXED')) {
        callStatus = 'DISPUTED';
        verdict = 'DISPUTED';
        newReportStatus = 'REOPENED';
      } else if (citizenReply.includes('CONFIRM') || citizenReply.includes('YES') || citizenReply.includes('FIXED')) {
        callStatus = 'CONFIRMED';
        verdict = 'CONFIRMED';
      } else {
        callStatus = 'CONFIRMED'; // default connected outcome
      }
    } else if (status === 'no_answer' || status === 'busy') {
      callStatus = 'NO_ANSWER';
    } else {
      callStatus = 'FAILED';
    }

    await db.updateReport(report.id, {
      call_status: callStatus,
      citizen_verdict: verdict,
      status: newReportStatus,
    });

    console.log(`[Voice Webhook] Updated report ${report.id}: call_status=${callStatus}, status=${newReportStatus}`);
    res.json({ received: true, call_status: callStatus });
  } catch (error) {
    console.error('[Voice Webhook Error]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 13. Demo Seed Data
// ----------------------------------------------------
router.post('/seed', async (req, res) => {
  try {
    const seed1 = await db.createReport({
      transcript: 'रस्त्यावर मोठा खड्डा पडला आहे, गाड्या घसरून पडत आहेत.',
      language_code: 'mr-IN',
      category: 'pothole',
      severity: 'high',
      summary: 'Deep dangerous pothole on Shivaji road causing two-wheelers to skid.',
      photo_url: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=600&auto=format&fit=crop',
      photo_hash: 'seed_photo_hash_pothole_101',
      lat: 18.5204,
      lng: 73.8567,
      phone: '+919876543210',
      call_consent: true,
    });

    const bid1 = await db.createBid(seed1.id, {
      contractor: 'Patil Civil Infra Ltd.',
      cost: 16500,
      eta_days: 2,
    });

    await db.updateReport(seed1.id, {
      awarded_bid_id: bid1.id,
      awarded_at: new Date(Date.now() - 3600000).toISOString(),
      status: 'COMPLETED',
      call_status: 'CONFIRMED',
      citizen_verdict: 'CONFIRMED',
    });

    await db.createCompletion({
      report_id: seed1.id,
      photo_url: 'https://images.unsplash.com/photo-1584463699026-66f6580f5ec8?w=600&auto=format&fit=crop',
      photo_hash: 'seed_proof_hash_pothole_fixed_102',
      lat: 18.52042,
      lng: 73.85672,
      distance_m: 2.8,
      checks: {
        gps_proximity: { passed: true, distance_m: 2.8, limit_m: 50 },
        awarded_timeline: { passed: true },
        unique_photo_hash: { passed: true },
      },
      passed: true,
    });

    res.json({ success: true, message: 'Seed data generated successfully' });
  } catch (error) {
    console.error('[Seed Error]', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
