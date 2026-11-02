import React, { useState, useEffect, useRef } from 'react';
import { getReportByToken, getSpokenUpdate, submitVoiceVerdict } from '../api.js';
import AudioRecorder from '../components/AudioRecorder.jsx';
import { Volume2, CheckCircle2, AlertOctagon, Clock, PhoneCall, RefreshCw } from 'lucide-react';

export default function CitizenStatus({ token, onNavigate }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Audio playback state
  const [spokenAudio, setSpokenAudio] = useState(null);
  const [spokenText, setSpokenText] = useState('');
  const [audioLoading, setAudioLoading] = useState(false);
  const audioRef = useRef(null);

  // Voice reply state
  const [showReplyRecorder, setShowReplyRecorder] = useState(false);
  const [isSubmittingVerdict, setIsSubmittingVerdict] = useState(false);
  const [verdictMessage, setVerdictMessage] = useState('');

  // 1. Fetch & Poll report status every 5 seconds
  const fetchStatus = async () => {
    try {
      const data = await getReportByToken(token);
      setReport(data);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load report status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [token]);

  // 2. When report is COMPLETED, generate spoken audio update in citizen's language
  useEffect(() => {
    if (report && report.status === 'COMPLETED' && !spokenAudio && !audioLoading) {
      loadSpokenUpdate();
    }
  }, [report?.status]);

  const loadSpokenUpdate = async () => {
    if (!report) return;
    setAudioLoading(true);
    try {
      const contractor = report.awarded_contractor_name || 'Municipal Contractor';
      const englishMessage = `Your complaint regarding the ${report.category} has been fixed and completed by ${contractor}. Please check and let us know if everything is satisfactory.`;
      
      const res = await getSpokenUpdate(englishMessage, report.language_code || 'hi-IN');
      setSpokenText(res.translated_text);
      if (res.audio_base64) {
        setSpokenAudio(`data:audio/wav;base64,${res.audio_base64}`);
      }
    } catch (err) {
      console.warn('Failed to generate spoken audio:', err.message);
    } finally {
      setAudioLoading(false);
    }
  };

  // 3. Handle Voice Confirm / Dispute
  const handleVoiceVerdict = async (audioBlob) => {
    setIsSubmittingVerdict(true);
    setVerdictMessage('');
    try {
      const res = await submitVoiceVerdict(token, audioBlob);
      setVerdictMessage(`Recorded reply: "${res.transcript}" (Verdict: ${res.verdict})`);
      setShowReplyRecorder(false);
      // Re-fetch report status immediately
      fetchStatus();
    } catch (err) {
      setVerdictMessage(`Error processing reply: ${err.message}`);
    } finally {
      setIsSubmittingVerdict(false);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', marginTop: 40 }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading report status...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: 'center', color: 'var(--danger)' }}>
          <p>{error || 'Complaint not found'}</p>
          <button className="btn btn-outline" style={{ marginTop: 12 }} onClick={() => onNavigate('/')}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const getStatusBadge = () => {
    switch (report.status) {
      case 'RECEIVED':
        return <span className="badge badge-info"><Clock size={12} style={{ marginRight: 4 }} /> Received</span>;
      case 'AWARDED':
        return <span className="badge badge-warning"><Clock size={12} style={{ marginRight: 4 }} /> Contractor Assigned</span>;
      case 'COMPLETED':
        return <span className="badge badge-success"><CheckCircle2 size={12} style={{ marginRight: 4 }} /> Completed & Verified</span>;
      case 'REOPENED':
        return <span className="badge badge-danger"><AlertOctagon size={12} style={{ marginRight: 4 }} /> Dispute Reopened</span>;
      default:
        return <span className="badge badge-info">{report.status}</span>;
    }
  };

  return (
    <div className="container">
      {/* Top Header Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Ticket Token: {token.slice(0, 8)}...</span>
          {getStatusBadge()}
        </div>

        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, textTransform: 'capitalize' }}>
          {report.category} Complaint
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-main)', marginBottom: 12 }}>
          {report.summary}
        </p>

        {report.photo_url && (
          <img
            src={report.photo_url}
            alt="Complaint"
            style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 12, marginBottom: 12 }}
          />
        )}

        {report.awarded_contractor_name && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            <strong>Assigned Contractor:</strong> {report.awarded_contractor_name}
          </p>
        )}
      </div>

      {/* Voice Call Status Card (Phase 4B) */}
      {report.call_status && report.call_status !== 'NONE' && (
        <div className="card" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PhoneCall size={18} color="var(--success)" />
            <div>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Sarvam Voice Agent Status: </span>
              <span className={`badge ${report.call_status === 'CONFIRMED' ? 'badge-success' : report.call_status === 'DISPUTED' ? 'badge-danger' : 'badge-warning'}`}>
                {report.call_status}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* COMPLETED: Spoken Update in Citizen's Language */}
      {report.status === 'COMPLETED' && (
        <div className="card" style={{ border: '2px solid var(--success)', background: '#f8fafc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Volume2 size={24} color="var(--success)" />
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>काम पूर्ण झाले (Work Completed)</h2>
          </div>

          {spokenText && (
            <p style={{ fontSize: 14, fontStyle: 'italic', marginBottom: 12, color: 'var(--text-main)' }}>
              "{spokenText}"
            </p>
          )}

          {spokenAudio ? (
            <div style={{ marginBottom: 16 }}>
              <audio ref={audioRef} controls autoPlay src={spokenAudio} style={{ width: '100%' }} />
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              {audioLoading ? 'Generating spoken audio in your language...' : 'Audio update ready.'}
            </p>
          )}

          {/* Citizen Feedback Verdict */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              Are you satisfied with the repair?
            </h3>

            {report.citizen_verdict ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="badge badge-info">Your Verdict: {report.citizen_verdict}</span>
              </div>
            ) : (
              <div>
                {!showReplyRecorder ? (
                  <button
                    className="btn btn-outline"
                    onClick={() => setShowReplyRecorder(true)}
                  >
                    Reply by Voice (Confirm or Dispute)
                  </button>
                ) : (
                  <div>
                    <AudioRecorder
                      onRecordingComplete={handleVoiceVerdict}
                      isProcessing={isSubmittingVerdict}
                      label="Speak your response"
                    />
                    <button
                      className="btn btn-outline"
                      style={{ marginTop: 8 }}
                      onClick={() => setShowReplyRecorder(false)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

            {verdictMessage && (
              <p style={{ fontSize: 13, color: 'var(--primary)', marginTop: 8 }}>{verdictMessage}</p>
            )}
          </div>
        </div>
      )}

      {/* REOPENED Dispute Notice */}
      {report.status === 'REOPENED' && (
        <div className="card" style={{ background: '#fef2f2', border: '1px solid #f87171' }}>
          <h2 style={{ fontSize: 16, color: '#b91c1c', marginBottom: 6 }}>
            Complaint Reopened
          </h2>
          <p style={{ fontSize: 13, color: '#7f1d1d' }}>
            You reported that this issue is not fixed. Municipal officials have been alerted to re-inspect.
          </p>
        </div>
      )}

      <div style={{ textAlign: 'center', margin: '16px 0' }}>
        <button className="btn btn-outline" onClick={() => onNavigate('/')}>
          File Another Complaint
        </button>
      </div>
    </div>
  );
}
