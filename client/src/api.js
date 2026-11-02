const API_BASE = '/api';

export async function transcribeAudio(audioBlob) {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.wav');

  const res = await fetch(`${API_BASE}/transcribe`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Transcription failed' }));
    throw new Error(err.error || 'Failed to transcribe audio');
  }

  return res.json();
}

export async function structureComplaint(transcript) {
  const res = await fetch(`${API_BASE}/structure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript }),
  });

  if (!res.ok) {
    throw new Error('Failed to analyze complaint structure');
  }

  return res.json();
}

export async function submitReport({ photoBlob, transcript, language_code, category, severity, summary, lat, lng, phone, call_consent }) {
  const formData = new FormData();
  if (photoBlob) formData.append('photo', photoBlob, 'photo.jpg');
  if (transcript) formData.append('transcript', transcript);
  if (language_code) formData.append('language_code', language_code);
  if (category) formData.append('category', category);
  if (severity) formData.append('severity', severity);
  if (summary) formData.append('summary', summary);
  if (lat) formData.append('lat', lat);
  if (lng) formData.append('lng', lng);
  if (phone) formData.append('phone', phone);
  if (call_consent !== undefined) formData.append('call_consent', String(call_consent));

  const res = await fetch(`${API_BASE}/reports`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Submission failed' }));
    throw new Error(err.error || 'Failed to submit report');
  }

  return res.json();
}

export async function getReportByToken(token) {
  const res = await fetch(`${API_BASE}/reports/by-token/${token}`);
  if (!res.ok) throw new Error('Report not found');
  return res.json();
}

export async function getOfficialsReports() {
  const res = await fetch(`${API_BASE}/reports`);
  if (!res.ok) throw new Error('Failed to fetch reports');
  return res.json();
}

export async function getReportById(id) {
  const res = await fetch(`${API_BASE}/reports/${id}`);
  if (!res.ok) throw new Error('Failed to fetch report details');
  return res.json();
}

export async function addDemoBids(reportId) {
  const res = await fetch(`${API_BASE}/reports/${reportId}/demo-bids`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to add demo bids');
  return res.json();
}

export async function awardBid(reportId, bidId) {
  const res = await fetch(`${API_BASE}/reports/${reportId}/award`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bidId }),
  });
  if (!res.ok) throw new Error('Failed to award bid');
  return res.json();
}

export async function submitContractorProof(reportId, { photoBlob, lat, lng }) {
  const formData = new FormData();
  formData.append('photo', photoBlob, 'proof.jpg');
  if (lat) formData.append('lat', lat);
  if (lng) formData.append('lng', lng);

  const res = await fetch(`${API_BASE}/reports/${reportId}/complete`, {
    method: 'POST',
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Tamper checks failed');
  }

  return data;
}

export async function getSpokenUpdate(text, language_code) {
  const res = await fetch(`${API_BASE}/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language_code }),
  });
  if (!res.ok) throw new Error('Failed to generate spoken update');
  return res.json();
}

export async function submitVoiceVerdict(token, audioBlob) {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'verdict.wav');

  const res = await fetch(`${API_BASE}/reports/by-token/${token}/verdict`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) throw new Error('Failed to submit voice verdict');
  return res.json();
}
