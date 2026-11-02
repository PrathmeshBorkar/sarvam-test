import React, { useState, useEffect } from 'react';
import AudioRecorder from '../components/AudioRecorder.jsx';
import CameraCapture from '../components/CameraCapture.jsx';
import { transcribeAudio, structureComplaint, submitReport } from '../api.js';
import { MapPin, Phone, CheckCircle, AlertTriangle } from 'lucide-react';

export default function CitizenReport({ onNavigate }) {
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [languageCode, setLanguageCode] = useState('hi-IN');
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [summary, setSummary] = useState('');
  const [location, setLocation] = useState({ lat: null, lng: null });
  const [locationError, setLocationError] = useState(null);
  
  // Phase 4B Phone & Consent state
  const [phone, setPhone] = useState('');
  const [callConsent, setCallConsent] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // 1. Auto-capture GPS on page load
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        (err) => {
          console.warn('Geolocation error:', err.message);
          setLocationError('GPS permission not granted. Location will be approximate.');
          // Default mock coordinates for Pune/Maharashtra demo
          setLocation({ lat: 18.5204, lng: 73.8567 });
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  // 2. Handle voice recording completion
  const handleAudioComplete = async (audioBlob) => {
    setIsTranscribing(true);
    setSubmitError('');
    try {
      // Step A: Transcribe audio with Sarvam Saaras
      const sttResult = await transcribeAudio(audioBlob);
      setTranscript(sttResult.transcript);
      setLanguageCode(sttResult.language_code || 'hi-IN');

      // Step B: Structure complaint with Sarvam-105b
      if (sttResult.transcript) {
        const structured = await structureComplaint(sttResult.transcript);
        setCategory(structured.category);
        setSeverity(structured.severity);
        setSummary(structured.summary);
      }
    } catch (err) {
      console.error(err);
      setSubmitError(err.message || 'Speech processing failed. Please try speaking again.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handlePhotoSelected = (file) => {
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const validatePhoneInput = (val) => {
    setPhone(val);
    const cleaned = val.replace(/\D/g, '');
    if (val && !/^[6-9]\d{9}$/.test(cleaned)) {
      setPhoneError('Please enter a valid 10-digit Indian mobile number (starts with 6-9)');
    } else {
      setPhoneError('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!transcript && !summary) {
      setSubmitError('Please record your complaint by voice first.');
      return;
    }

    if (callConsent && phoneError) {
      setSubmitError('Please fix the phone number error before submitting.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const res = await submitReport({
        photoBlob: photoFile,
        transcript,
        language_code: languageCode,
        category: category || 'other',
        severity: severity || 'medium',
        summary: summary || transcript.slice(0, 100),
        lat: location.lat,
        lng: location.lng,
        phone: callConsent ? phone : null,
        call_consent: callConsent,
      });

      // Redirect directly to /status/:token
      onNavigate(`/status/${res.token}`);
    } catch (err) {
      setSubmitError(err.message || 'Submission failed. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container">
      <div className="card" style={{ textAlign: 'center', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff', borderRadius: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Civic Voice Portal</h1>
        <p style={{ fontSize: 13, opacity: 0.9 }}>
          बोलून तक्रार नोंदवा (Speak in your language. No login needed.)
        </p>
      </div>

      {submitError && (
        <div className="card" style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#b91c1c', display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertTriangle size={20} />
          <span style={{ fontSize: 14 }}>{submitError}</span>
        </div>
      )}

      {/* Step 1: Voice Recording */}
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>1.</span> Speak Your Problem
        </h2>
        <AudioRecorder
          onRecordingComplete={handleAudioComplete}
          isProcessing={isTranscribing}
          label="Tap to Speak Complaint"
        />

        {transcript && (
          <div style={{ background: 'var(--bg-main)', borderRadius: 12, padding: 14, marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>TRANSCRIPT ({languageCode})</span>
              <span className="badge badge-success">Sarvam Saaras</span>
            </div>
            <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-main)' }}>"{transcript}"</p>

            {summary && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span className="badge badge-info">{category}</span>
                  <span className={`badge ${severity === 'high' ? 'badge-danger' : severity === 'medium' ? 'badge-warning' : 'badge-success'}`}>
                    {severity} severity
                  </span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  <strong>Analysis:</strong> {summary}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step 2: Photo Capture */}
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>2.</span> Take a Photo (Optional)
        </h2>
        <CameraCapture onPhotoSelected={handlePhotoSelected} previewUrl={photoPreview} />
      </div>

      {/* Step 3: Phone & Outbound Voice Agent Consent (Phase 4B) */}
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Phone size={18} color="var(--primary)" />
          <span>3.</span> Voice Call Confirmation
        </h2>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            Mobile Number (Optional)
          </label>
          <input
            type="tel"
            className="input"
            placeholder="e.g. 9876543210"
            value={phone}
            onChange={(e) => validatePhoneInput(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              fontSize: 16,
            }}
          />
          {phoneError && <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{phoneError}</p>}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
          <input
            type="checkbox"
            checked={callConsent}
            onChange={(e) => setCallConsent(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <span>Call me via Sarvam Voice Agent when this is fixed</span>
        </label>
      </div>

      {/* Step 4: GPS Location Indicator & Submit */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          <MapPin size={16} color="var(--primary)" />
          {location.lat && location.lng ? (
            <span>GPS: {location.lat.toFixed(4)}, {location.lng.toFixed(4)}</span>
          ) : (
            <span>Locating GPS...</span>
          )}
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={isSubmitting || isTranscribing}
        >
          {isSubmitting ? 'Submitting Complaint...' : 'Submit Complaint'}
        </button>
      </div>
    </div>
  );
}
