import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseServiceKey);

if (!isSupabaseConfigured) {
  console.warn('[Supabase] Warning: SUPABASE_URL or SUPABASE_SERVICE_KEY is missing in server/.env');
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

/**
 * Upload a file buffer to Supabase Storage 'photos' bucket
 */
export async function uploadPhoto(buffer, filename, mimeType) {
  if (!supabase) {
    throw new Error('Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_KEY in server/.env');
  }

  const path = `${Date.now()}-${filename}`;
  const { data, error } = await supabase.storage
    .from('photos')
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload photo to Supabase storage: ${error.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from('photos')
    .getPublicUrl(path);

  return publicUrlData.publicUrl;
}
