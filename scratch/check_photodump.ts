import { createClient } from "npm:@supabase/supabase-js@2";
import * as dotenv from "npm:dotenv@16.0.3";

dotenv.config();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
);

async function listTables() {
  const { data, error } = await supabase.rpc('get_tables_info'); // If exists
  
  if (error) {
    // Fallback: try querying information_schema
    const { data: tables, error: tableErr } = await supabase
      .from('aichatassistant') // dummy to check if we can reach it
      .select('count(*)');
    
    console.log("Could not list tables via RPC. Manual check needed.");
  } else {
    console.log("Tables:", data);
  }
}

// Actually, I'll just try to select from the suspected table name
async function checkPhotodump() {
    const { data, error } = await supabase.from('aichatassistant(photodump)').select('*').limit(1);
    if (error) {
        console.log("aichatassistant(photodump) failed:", error.message);
        const { data: d2, error: e2 } = await supabase.from('photodump').select('*').limit(1);
        if (e2) {
            console.log("photodump failed:", e2.message);
            const { data: d3, error: e3 } = await supabase.from('aichatassistant_photodump').select('*').limit(1);
            if (e3) console.log("aichatassistant_photodump failed:", e3.message);
            else console.log("Success with aichatassistant_photodump");
        } else {
            console.log("Success with photodump");
        }
    } else {
        console.log("Success with aichatassistant(photodump)");
    }
}

checkPhotodump();
