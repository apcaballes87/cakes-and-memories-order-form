import { createClient } from "npm:@supabase/supabase-js@2";
import * as dotenv from "npm:dotenv@16.0.3";

dotenv.config();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
);

async function testInsert() {
    const testData = { imagelink: 'test', description: 'test' };
    
    console.log("Trying aichatassistant(photodump)...");
    const { error: e1 } = await supabase.from('aichatassistant(photodump)').insert(testData);
    if (!e1) return console.log("SUCCESS with aichatassistant(photodump)");
    console.log("Error e1:", e1.message);

    console.log("Trying aichatassistant_photodump...");
    const { error: e2 } = await supabase.from('aichatassistant_photodump').insert(testData);
    if (!e2) return console.log("SUCCESS with aichatassistant_photodump");
    console.log("Error e2:", e2.message);

    console.log("Trying photodump...");
    const { error: e3 } = await supabase.from('photodump').insert(testData);
    if (!e3) return console.log("SUCCESS with photodump");
    console.log("Error e3:", e3.message);
}

testInsert();
