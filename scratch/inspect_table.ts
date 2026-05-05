
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://congofivupobtfudnhni.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvbmdvZml2dXBvYnRmdWRuaG5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODc1NjkyMTQsImV4cCI6MjAwMzE0NTIxNH0.y2jsrPWt7Q_016e1o8PkM-Ayyti9yzxj3jH9hvH4DiM';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspect() {
  console.log('Inspecting "aichatassistant"...');
  const { data, error } = await supabase
    .from('aichatassistant')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Success! Data:', data);
  }
}

inspect();
