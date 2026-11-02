import React, { useState, useEffect } from 'react';
import { getOfficialsReports, addDemoBids, awardBid } from '../api.js';
import { ShieldCheck, ShieldAlert, AlertTriangle, Check, RefreshCw, PhoneCall, ExternalLink } from 'lucide-react';

export default function OfficialsDash({ onNavigate }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});

  const loadReports = async () => {
    try {
      const data = await getOfficialsReports();
      setReports(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
    const interval = setInterval(loadReports, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleAddBids = async (reportId) => {
    setActionLoading((prev) => ({ ...prev, [reportId]: true }));
    try {
      await addDemoBids(reportId);
      await loadReports();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading((prev) => ({ ...prev, [reportId]: false }));
    }
  };

  const handleAward = async (reportId, bidId) => {
    setActionLoading((prev) => ({ ...prev, [reportId]: true }));
    try {
      await awardBid(reportId, bidId);
      await loadReports();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading((prev) => ({ ...prev, [reportId]: false }));
    }
  };

  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Municipal Officials Dashboard</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Civic complaint triage & tamper-verified contractor awarding</p>
        </div>
        <button className="btn btn-outline" style={{ width: 'auto', padding: '8px 14px' }} onClick={loadReports}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading reports...</p>
      ) : reports.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>No citizen complaints submitted yet.</p>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => onNavigate('/')}>
            File a Complaint
          </button>
        </div>
      ) : (
        reports.map((report) => (
          <div
            key={report.id}
            className="card"
            style={{
              borderLeft: report.status === 'REOPENED' ? '6px solid var(--danger)' : '1px solid var(--border)',
            }}
          >
            {/* Top Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <span className="badge badge-info" style={{ marginRight: 6 }}>{report.category}</span>
                <span className={`badge ${report.severity === 'high' ? 'badge-danger' : report.severity === 'medium' ? 'badge-warning' : 'badge-success'}`}>
                  {report.severity}
                </span>
                {report.status === 'REOPENED' && (
                  <span className="badge badge-danger" style={{ marginLeft: 6 }}>
                    <AlertTriangle size={12} style={{ marginRight: 4 }} /> CITIZEN REOPENED
                  </span>
                )}
              </div>
              <span className={`badge ${report.status === 'COMPLETED' ? 'badge-success' : report.status === 'AWARDED' ? 'badge-warning' : 'badge-info'}`}>
                {report.status}
              </span>
            </div>

            {/* Content & Photo */}
            <div style={{ display: 'flex', gap: 14, marginBottom: 12 }}>
              {report.photo_url && (
                <img
                  src={report.photo_url}
                  alt="Issue"
                  style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
                />
              )}
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{report.summary}</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  "{report.transcript}" ({report.language_code})
                </p>
                <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                  {report.lat && report.lng && (
                    <span>GPS: {report.lat.toFixed(4)}, {report.lng.toFixed(4)}</span>
                  )}
                  {report.phone && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <PhoneCall size={12} /> {report.phone} ({report.call_status})
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Tamper Checks (if completion proof exists) */}
            {report.completion && (
              <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  {report.completion.passed ? (
                    <ShieldCheck size={18} color="var(--success)" />
                  ) : (
                    <ShieldAlert size={18} color="var(--danger)" />
                  )}
                  <span style={{ fontSize: 13, fontWeight: 700 }}>
                    Tamper Verification: {report.completion.passed ? 'PASSED' : 'FLAGGED'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className={`badge ${report.completion.checks?.gps_proximity?.passed ? 'badge-success' : 'badge-danger'}`}>
                    GPS Proximity ({report.completion.distance_m}m)
                  </span>
                  <span className={`badge ${report.completion.checks?.awarded_timeline?.passed ? 'badge-success' : 'badge-danger'}`}>
                    Post-Award Timeline
                  </span>
                  <span className={`badge ${report.completion.checks?.unique_photo_hash?.passed ? 'badge-success' : 'badge-danger'}`}>
                    Distinct Photo Hash
                  </span>
                </div>
              </div>
            )}

            {/* Bids Section */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Contractor Bids</span>
                {(!report.bids || report.bids.length === 0) && report.status === 'RECEIVED' && (
                  <button
                    className="btn btn-outline"
                    style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }}
                    onClick={() => handleAddBids(report.id)}
                    disabled={actionLoading[report.id]}
                  >
                    + Add Demo Bids
                  </button>
                )}
              </div>

              {report.bids && report.bids.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {report.bids.map((bid) => {
                    const isAwarded = report.awarded_bid_id === bid.id;
                    return (
                      <div
                        key={bid.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 12px',
                          borderRadius: 8,
                          background: isAwarded ? '#eff6ff' : '#f8fafc',
                          border: isAwarded ? '1px solid var(--primary)' : '1px solid var(--border)',
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: 13 }}>{bid.contractor}</strong>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                            ₹{bid.cost} • {bid.eta_days} days
                          </span>
                        </div>
                        {isAwarded ? (
                          <span className="badge badge-success"><Check size={12} /> Awarded</span>
                        ) : report.status === 'RECEIVED' ? (
                          <button
                            className="btn btn-primary"
                            style={{ width: 'auto', padding: '4px 12px', fontSize: 12, minHeight: 32 }}
                            onClick={() => handleAward(report.id, bid.id)}
                            disabled={actionLoading[report.id]}
                          >
                            Award
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No bids yet. Click "+ Add Demo Bids" to simulate contractor quotes.</p>
              )}
            </div>

            {/* Quick Link to Contractor Proof Page */}
            {report.status === 'AWARDED' && (
              <div style={{ marginTop: 12, textAlign: 'right' }}>
                <button
                  className="btn btn-outline"
                  style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
                  onClick={() => onNavigate(`/contractor/${report.id}`)}
                >
                  <ExternalLink size={14} /> Open Contractor Proof Page
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
