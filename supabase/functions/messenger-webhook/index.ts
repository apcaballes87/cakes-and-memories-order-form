import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

async function getFacebookUserProfile(subscriberId: string, threadId?: string) {
  const token = Deno.env.get("FB_PAGE_ACCESS_TOKEN");
  if (!token) {
    console.error("FB_PAGE_ACCESS_TOKEN not set");
    return null;
  }

  // Attempt 1: Direct Profile Fetch (Requires Advanced Access for 'Business Asset User Profile Access')
  try {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${subscriberId}?fields=name,first_name,last_name&access_token=${token}`
    );
    if (res.ok) {
      const data = await res.json();
      const fullName = data.name || (data.first_name ? `${data.first_name} ${data.last_name || ''}` : null);
      if (fullName?.trim()) {
        console.log(`Successfully fetched name via direct Profile API: ${fullName}`);
        return fullName.trim();
      }
    } else {
      const err = await res.text();
      console.warn(`Direct Profile API failed for ${subscriberId}: ${res.status} — ${err}`);
    }
  } catch (err) {
    console.error("Error in direct profile fetch:", err);
  }

  // Attempt 2: Conversations API via user_id (The "Backdoor" - often works when direct fetch is blocked)
  try {
    console.log(`Attempting Conversations API fallback for ${subscriberId}...`);
    const res = await fetch(
      `https://graph.facebook.com/v20.0/me/conversations?user_id=${subscriberId}&fields=participants{name,id}&access_token=${token}`
    );
    if (res.ok) {
      const data = await res.json();
      // data.data is an array of conversations. We check the participants of the most recent one.
      const participants = data.data?.[0]?.participants?.data || [];
      const user = participants.find((p: any) => p.id === subscriberId);
      if (user?.name) {
        console.log(`Successfully fetched name via Conversations API fallback: ${user.name}`);
        return user.name;
      }
    }
  } catch (err) {
    console.error("Error in Conversations API fallback:", err);
  }

  // Attempt 3: If we have a threadId (specific to labels), try querying that thread directly
  if (threadId) {
    try {
      console.log(`Attempting direct Thread API fetch for ${threadId}...`);
      const res = await fetch(
        `https://graph.facebook.com/v20.0/${threadId}?fields=participants{name,id}&access_token=${token}`
      );
      if (res.ok) {
        const data = await res.json();
        const participants = data.participants?.data || [];
        const user = participants.find((p: any) => p.id === subscriberId);
        if (user?.name) {
          console.log(`Successfully fetched name via Thread API: ${user.name}`);
          return user.name;
        }
      }
    } catch (err) {
      console.error("Error in Thread API fetch:", err);
    }
  }

  return null;
}

async function uploadImageToStorage(imageUrl, subscriberId, attachmentId) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const blob = await res.blob();
  const filename = `${attachmentId}.jpg`;
  const path = `images/${filename}`;
  const { data, error } = await supabase.storage.from("uploadopenai").upload(path, blob, {
    contentType: "image/jpeg",
    upsert: false
  });
  const baseUrl = Deno.env.get("SUPABASE_URL");
  if (error) {
    if (error.statusCode === 409 || error.error === "Duplicate" || error.message && error.message.includes("file already exists")) {
      return `${baseUrl}/storage/v1/object/public/uploadopenai/${path}`;
    }
    throw error;
  }
  return `${baseUrl}/storage/v1/object/public/uploadopenai/${data.path}`;
}

async function classifyImageWithGeminiPro(imageUrl) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const resp = await fetch(imageUrl);
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
  const bytes = new Uint8Array(await resp.arrayBuffer());
  let bin = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const b64 = btoa(bin);
  const body = {
    contents: [
      {
        parts: [
          {
            text: "Classify this image as exactly one of: cake, payment, or subject.\n" +
                  "➡️ **Payment** ONLY if it is a receipt, invoice, or payment screenshot clearly showing a TOTAL amount and typical receipt layout (e.g. the word 'Total Amount','Total Payment', itemized list, bank logos, barcodes).\n" +
                  "➡️ **Cake** if it’s a photo of a cake, even if there’s a price tag or decoration showing a number. Or if its a person holding a cake. \n" +
                  "➡️ Otherwise **subject** (e.g. documents without totals, random photos).\n" +
                  "Reply with only the label (\"cake\", \"payment\", or \"subject\"). " +
                  "If you choose payment, append the amount (e.g. “payment: 1,234.56”)."
          },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: b64
            }
          }
        ]
      }
    ]
  };
  
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Gemini error ${r.status}: ${txt}`);
  }
  const json = await r.json();
  const reply = (json.candidates?.[0]?.content?.parts?.[0]?.text ?? "").toLowerCase().trim();
  const amtMatch = reply.match(/payment[:\s]*[₱\$]?\s*([\d,]+(?:\.\d{1,2})?)/);
  if (amtMatch) {
    const raw = amtMatch[1].replace(/,/g, "");
    return {
      label: "payment",
      amount: parseFloat(raw)
    };
  }
  if (reply.includes("cake")) return {
    label: "cake"
  };
  return {
    label: "subject"
  };
}

serve(async (req) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === Deno.env.get("FB_VERIFY_TOKEN")) {
      return new Response(url.searchParams.get("hub.challenge"), {
        status: 200
      });
    }
    return new Response("Verification failed", {
      status: 403
    });
  }
  
  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
      console.log("Raw Webhook Body:", JSON.stringify(body, null, 2));
    } catch (e) {
      console.error("Invalid JSON:", e);
      return new Response("Bad Request", {
        status: 400
      });
    }
    
    const entry = body.entry?.[0];
    if (!entry) return new Response("No entry", { status: 400 });

    // 1. Handle inbox_labels (Staff added a label in Meta Business Suite)
    const labelChange = entry.changes?.find((c: any) => c.field === "inbox_labels");
    if (labelChange) {
      const val = labelChange.value;
      console.log("Label value object:", JSON.stringify(val, null, 2));
      
      const verb = (val.verb || val.action || "").toLowerCase();
      const rawLabel = val.label?.name || val.label?.page_label_name || val.label_name || val.page_label_name || (typeof val.label === 'string' ? val.label : undefined);
      const label = rawLabel?.toString().trim().toLowerCase();
      
      // Prioritize user.id as it is the most reliable PSID in inbox_labels
      const subscriberId = val.user?.id || val.sender_id || val.thread_id;
      const idSource = val.user?.id ? "user.id" : (val.sender_id ? "sender_id" : "thread_id");

      console.log(`--- Label Event: ${verb} "${label}" for ${subscriberId} (Source: ${idSource}) ---`);
      
      if (verb === "add" && (label === "sendform" || label === "label name")) {
        // A. Get/Create newfacebookU
        let { data: row, error: fetchErr } = await supabase
          .from("aichatassistant")
          .select("newfacebookU, name")
          .eq("subscriberid", subscriberId)
          .single();

        let newfacebookU = row?.newfacebookU;
        let currentName = row?.name;

        // B. If name is missing, try fetching it now to make the message personal
        if (!currentName) {
          console.log(`Name missing for ${subscriberId}, fetching from Graph API (Thread: ${val.thread_id})...`);
          currentName = await getFacebookUserProfile(subscriberId, val.thread_id);
        }

        if (!newfacebookU) {
          newfacebookU = crypto.randomUUID();
          const { error: upsertErr } = await supabase.from("aichatassistant").upsert({
            subscriberid: subscriberId,
            newfacebookU: newfacebookU,
            name: currentName,
            lastmessagedate: new Date().toISOString()
          }, { onConflict: "subscriberid" });
          
          if (upsertErr) console.error("Upsert error in label handler:", upsertErr);
        } else if (currentName && !row?.name) {
          // Update name if we just fetched it
          await supabase.from("aichatassistant").update({ name: currentName }).eq("subscriberid", subscriberId);
        }

        // C. Trigger Conversation Analysis (Orchestrator)
        console.log(`Triggering analyze-facebook-conversation for ${subscriberId}...`);
        // We trigger it asynchronously to respond quickly to the webhook
        supabase.functions.invoke('analyze-facebook-conversation', {
          body: { subscriberid: subscriberId }
        }).catch(err => console.error("Analysis trigger failed:", err));

        return new Response(JSON.stringify({ status: "analysis_triggered", label, subscriberId }), { status: 200 });
      }
      return new Response("Label ignored", { status: 200 });
    }

    // 2. Handle standard messaging
    const msg = entry.messaging?.[0];
    if (!msg) return new Response("No recognized event", { status: 400 });
    
    const subscriberId = msg.sender.id;
    console.log(`--- New Webhook Event from ${subscriberId} ---`);

    // Fetch existing row to check if we need to update name or append images
    const { data: row, error: fetchErr } = await supabase.from("aichatassistant").select("name, cakeimages, subjectimages, paymentscreenshot, paymentdate, paymentamount, firstmessagedate").eq("subscriberid", subscriberId).single();
    if (fetchErr && fetchErr.code !== "PGRST116") {
      console.error("Fetch error:", fetchErr);
    }

    // 1. Get Name if missing — try webhook payload first, then Graph API
    let userName = row?.name;
    if (!userName) {
      // Facebook sometimes includes the sender's name in the webhook payload
      const payloadName = (msg.sender as any)?.name;
      if (payloadName) {
        console.log(`Got name from webhook payload: ${payloadName}`);
        userName = payloadName;
      } else {
        console.log("Name missing in DB, fetching from Facebook Graph API...");
        userName = await getFacebookUserProfile(subscriberId, (msg as any).thread_id);
        if (userName) console.log(`Fetched name: ${userName}`);
        else console.warn("Could not fetch name from Graph API — likely a PSID permission issue. Name will remain empty.");
      }
    }

    // Prepare unified payload
    const now = new Date().toISOString();

    let updatePayload: any = { 
      subscriberid: subscriberId,
      lastmessagedate: now,
      received: false
    };
    
    if (!row?.firstmessagedate) {
      console.log(`Setting firstmessagedate for ${subscriberId}`);
      updatePayload.firstmessagedate = now;
    }

    if (userName) updatePayload.name = userName;

    // 2. Check for text/caption
    if (msg.message?.text) {
      console.log(`Text received: "${msg.message.text}"`);
      updatePayload.lastmessage = msg.message.text;
    }

    // 3. Check for images
    const images = (msg.message?.attachments ?? []).filter((a) => a.type === "image").map((a) => {
      const url = a.payload.url;
      const id = a.payload.attachment_id ?? url.split("/").pop().split("?")[0];
      return {
        url,
        id
      };
    });

    if (images.length > 0) {
      console.log(`Detected ${images.length} image(s). Processing...`);
      try {
        const publicUrls = await Promise.all(images.map(({ url, id }) => uploadImageToStorage(url, subscriberId, id)));
        
        const cakeimages = row?.cakeimages ?? [];
        const subjectimages = row?.subjectimages ?? [];
        let paymentscreenshot = row?.paymentscreenshot;
        let paymentdate = row?.paymentdate;
        let paymentamount = row?.paymentamount;

        for (const url of publicUrls) {
          console.log(`Classifying image via Gemini 3.1 Flash Lite: ${url}`);
          const result = await classifyImageWithGeminiPro(url);
          console.log(`Gemini classification: ${result.label}${result.amount ? ` (Amount: ${result.amount})` : ""}`);

          if (result.label === "cake") {
            cakeimages.push(url);
          } else if (result.label === "payment") {
            paymentscreenshot = url;
            paymentdate = now;
            if (result.amount != null) paymentamount = result.amount;
          } else {
            subjectimages.push(url);
          }
        }

        updatePayload = {
          ...updatePayload,
          cakeimages,
          subjectimages,
          paymentscreenshot,
          paymentdate,
          paymentamount,
          useaiassistant: paymentscreenshot ? true : false
        };
      } catch (err) {
        console.error("Image processing failed:", err);
      }
    }

    // 4. Single unified DB update
    const { error: upErr } = await supabase.from("aichatassistant").upsert([updatePayload], {
      onConflict: "subscriberid"
    });

    if (upErr) {
      console.error("Database Upsert Error:", upErr);
      return new Response("Database error", {
        status: 500
      });
    }

    console.log("Success: Database updated.");
    return new Response(JSON.stringify({ status: "ok", processed: Object.keys(updatePayload) }), {
      headers: { "Content-Type": "application/json" },
      status: 200
    });
  }

  return new Response("Method not allowed", {
    status: 405
  });
});
