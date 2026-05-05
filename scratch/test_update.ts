
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://congofivupobtfudnhni.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvbmdvZml2dXBvYnRmdWRuaG5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODc1NjkyMTQsImV4cCI6MjAwMzE0NTIxNH0.y2jsrPWt7Q_016e1o8PkM-Ayyti9yzxj3jH9hvH4DiM';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testUpdate() {
  const facebookU = '0ad7ad83-6555-4673-a80b-9aeff3ae0e93';
  console.log(`Updating record ${facebookU} to totalorderprice = 888...`);
  const { data, error } = await supabase
    .from('New PRE Facebook Orders')
    .update({ totalorderprice: 888 })
    .eq('facebookU', facebookU)
    .select();

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Success! Updated data:', data);
  }
}

testUpdate();
