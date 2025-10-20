import { createClient } from '@supabase/supabase-js';

// Use environment variables for Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://congofivupobtfudnhni.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvbmdvZml2dXBvYnRmdWRuaG5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODc1NjkyMTQsImV4cCI6MjAwMzE0NTIxNH0.y2jsrPWt7Q_016e1o8PkM-Ayyti9yzxj3jH9hvH4DiM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Uploads a file to Supabase Storage.
 * Note: You must create a public bucket named 'cakepics' in your Supabase project.
 * @param file The file to upload.
 * @returns The public URL of the uploaded file, or null on error.
 */
export const uploadFile = async (file: File): Promise<string | null> => {
  if (!file) return null;

  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random()}.${fileExt}`;
  const bucketName = 'cakepics'; // FIX: Corrected bucket name
  
  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(fileName, file);

  if (uploadError) {
    console.error('Error uploading file:', uploadError.message);
    return null;
  }

  const { data } = supabase.storage
    .from(bucketName)
    .getPublicUrl(fileName);
    
  return data.publicUrl;
};