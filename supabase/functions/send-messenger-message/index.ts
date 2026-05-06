import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { psid, message } = await req.json()

    if (!psid || !message) {
      throw new Error('Missing psid or message in request body')
    }

    const FB_PAGE_ACCESS_TOKEN = Deno.env.get('FB_PAGE_ACCESS_TOKEN') || Deno.env.get('VITE_FB_PAGE_ACCESS_TOKEN')

    if (!FB_PAGE_ACCESS_TOKEN) {
      throw new Error('FB_PAGE_ACCESS_TOKEN is not configured in Supabase Edge Function environment')
    }

    const FB_GRAPH_API_VERSION = 'v20.0'
    const FB_GRAPH_API_URL = `https://graph.facebook.com/${FB_GRAPH_API_VERSION}/me/messages`

    console.log(`Sending message to PSID: ${psid}`)

    const fbResponse = await fetch(`${FB_GRAPH_API_URL}?access_token=${FB_PAGE_ACCESS_TOKEN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: psid },
        message: { text: message },
        messaging_type: 'RESPONSE',
      }),
    })

    const result = await fbResponse.json()

    if (!fbResponse.ok) {
      console.error('Facebook Graph API error:', result)
      throw new Error(result.error?.message || 'Failed to send message via Facebook Graph API')
    }

    console.log('Messenger confirmation sent successfully:', result)

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Error in send-messenger-message function:', error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})
