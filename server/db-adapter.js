import crypto from 'crypto';
import { supabase, isSupabaseConfigured, uploadPhoto as uploadToSupabase } from './supabase.js';

// In-memory store fallback when Supabase is not yet configured
const memoryDb = {
  reports: new Map(),
  bids: new Map(),
  completions: new Map(),
  photos: new Map(),
};

/**
 * Upload a photo: Supabase Storage if configured, or base64 data URL in memory
 */
export async function savePhoto(buffer, filename, mimeType) {
  if (isSupabaseConfigured) {
    try {
      return await uploadToSupabase(buffer, filename, mimeType);
    } catch (err) {
      console.warn('[Storage] Supabase upload failed, falling back to data URL:', err.message);
    }
  }

  // Fallback: Data URL
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

export const db = {
  // --- REPORTS ---
  async createReport(reportData) {
    const id = crypto.randomUUID();
    const token = crypto.randomBytes(16).toString('hex');
    const row = {
      id,
      token,
      language_code: reportData.language_code || 'hi-IN',
      transcript: reportData.transcript || '',
      category: reportData.category || 'other',
      severity: reportData.severity || 'medium',
      summary: reportData.summary || '',
      photo_url: reportData.photo_url || null,
      photo_hash: reportData.photo_hash || null,
      lat: reportData.lat ? parseFloat(reportData.lat) : null,
      lng: reportData.lng ? parseFloat(reportData.lng) : null,
      phone: reportData.phone || null,
      call_consent: Boolean(reportData.call_consent),
      call_status: 'NONE',
      call_attempt_id: null,
      status: 'RECEIVED',
      awarded_bid_id: null,
      awarded_at: null,
      citizen_verdict: null,
      created_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('reports').insert(row).select().single();
      if (error) throw new Error(`Supabase createReport error: ${error.message}`);
      return data;
    }

    memoryDb.reports.set(id, row);
    return row;
  },

  async getReportById(id) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('reports').select('*').eq('id', id).single();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      return data || null;
    }
    return memoryDb.reports.get(id) || null;
  },

  async getReportByToken(token) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('reports').select('*').eq('token', token).single();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      return data || null;
    }
    for (const report of memoryDb.reports.values()) {
      if (report.token === token) return report;
    }
    return null;
  },

  async getPublicReportByToken(token) {
    const report = await this.getReportByToken(token);
    if (!report) return null;
    return {
      token: report.token,
      status: report.status,
      category: report.category,
      severity: report.severity,
      summary: report.summary,
      language_code: report.language_code,
      photo_url: report.photo_url,
      citizen_verdict: report.citizen_verdict,
      call_status: report.call_status,
      created_at: report.created_at,
    };
  },

  async getReportByCallAttemptId(attemptId) {
    if (!attemptId) return null;
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('reports').select('*').eq('call_attempt_id', attemptId).single();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      return data || null;
    }
    for (const report of memoryDb.reports.values()) {
      if (report.call_attempt_id === attemptId) return report;
    }
    return null;
  },

  async listReports() {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('reports')
        .select(`
          *,
          bids (*)
        `)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data || [];
    }

    const reports = Array.from(memoryDb.reports.values()).sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    return reports.map((r) => {
      const bids = Array.from(memoryDb.bids.values()).filter((b) => b.report_id === r.id);
      const completion = Array.from(memoryDb.completions.values()).find((c) => c.report_id === r.id);
      return { ...r, bids, completion };
    });
  },

  async updateReport(id, updates) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('reports')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    }

    const existing = memoryDb.reports.get(id);
    if (!existing) throw new Error(`Report not found: ${id}`);
    const updated = { ...existing, ...updates };
    memoryDb.reports.set(id, updated);
    return updated;
  },

  // --- BIDS ---
  async createBid(reportId, { contractor, cost, eta_days }) {
    const id = crypto.randomUUID();
    const bid = {
      id,
      report_id: reportId,
      contractor,
      cost: parseInt(cost, 10),
      eta_days: parseInt(eta_days, 10),
      created_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('bids').insert(bid).select().single();
      if (error) throw new Error(error.message);
      return data;
    }

    memoryDb.bids.set(id, bid);
    return bid;
  },

  async listBidsForReport(reportId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('bids').select('*').eq('report_id', reportId);
      if (error) throw new Error(error.message);
      return data || [];
    }
    return Array.from(memoryDb.bids.values()).filter((b) => b.report_id === reportId);
  },

  async getBidById(id) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('bids').select('*').eq('id', id).single();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      return data || null;
    }
    return memoryDb.bids.get(id) || null;
  },

  // --- COMPLETIONS ---
  async createCompletion({ report_id, photo_url, photo_hash, lat, lng, distance_m, checks, passed }) {
    const id = crypto.randomUUID();
    const completion = {
      id,
      report_id,
      photo_url,
      photo_hash,
      lat: lat ? parseFloat(lat) : null,
      lng: lng ? parseFloat(lng) : null,
      distance_m: parseFloat(distance_m) || 0,
      checks: checks || {},
      passed: Boolean(passed),
      created_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('completions').insert(completion).select().single();
      if (error) throw new Error(error.message);
      return data;
    }

    memoryDb.completions.set(id, completion);
    return completion;
  },

  async getCompletionForReport(reportId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('completions')
        .select('*')
        .eq('report_id', reportId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      return data || null;
    }
    return (
      Array.from(memoryDb.completions.values())
        .filter((c) => c.report_id === reportId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null
    );
  },
};
