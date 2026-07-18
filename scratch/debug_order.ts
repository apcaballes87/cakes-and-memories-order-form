
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://congofivupobtfudnhni.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvbmdvZml2dXBvYnRmdWRuaG5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODc1NjkyMTQsImV4cCI6MjAwMzE0NTIxNH0.y2jsrPWt7Q_016e1o8PkM-Ayyti9yzxj3jH9hvH4DiM';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspectTable() {
  console.log('Searching "New PRE Facebook Orders" for Name "Alan Caballes"...');
  const { data, error } = await supabase
    .from('New PRE Facebook Orders')
    .select('*')
    .eq('Name', 'Alan Caballes')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching data:', error);
    return;
  }

  if (data) {
    console.log('Found', data.length, 'PRE orders.');
    data.forEach((order, index) => {
      console.log(`PRE Order ${index + 1}: facebookU =`, order.facebookU, 'subscriberid =', order.subscriberid, 'created_at =', order.created_at);
    });
  }
}

inspectTable();
