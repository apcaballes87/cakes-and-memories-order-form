import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

// Xendit API keys
const XENDIT_SECRET_KEY = Deno.env.get('XENDIT_SECRET_KEY') ?? '';

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { orderData, amount, customerEmail, customerName } = await req.json()

    if (!orderData || !amount) {
      throw new Error('Missing required fields: orderData, amount')
    }

    // We must use SERVICE ROLE KEY to bypass RLS when inserting sensitive records.
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Insert into pending_facebook_orders
    const { data: pendingOrder, error: pendingError } = await supabaseClient
      .from('pending_facebook_orders')
      .insert({ order_data: orderData })
      .select()
      .single()

    if (pendingError) {
      console.error('Error inserting pending order:', pendingError)
      throw new Error('Failed to create pending order')
    }

    const pendingOrderId = pendingOrder.id;

    // 2. Create Xendit Invoice
    const xenditAuth = btoa(`${XENDIT_SECRET_KEY}:`);
    
    const xenditPayload = {
      external_id: `order_${pendingOrderId}`,
      amount: amount,
      payer_email: customerEmail || 'customer@example.com',
      description: `Payment for Pre-filled Order ${pendingOrderId}`,
      // Make sure the origin matches where the frontend is hosted
      success_redirect_url: `${req.headers.get('origin') || 'https://cakes-and-memories-order-form.vercel.app'}/#/thank-you?payment=success&orderId=${pendingOrderId}`,
      failure_redirect_url: `${req.headers.get('origin') || 'https://cakes-and-memories-order-form.vercel.app'}`,
      customer: {
        given_names: customerName || 'Customer',
        email: customerEmail || 'customer@example.com'
      }
    };

    const xenditResponse = await fetch('https://api.xendit.co/v2/invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${xenditAuth}`
      },
      body: JSON.stringify(xenditPayload)
    });

    const invoice = await xenditResponse.json();

    if (!xenditResponse.ok) {
      console.error('Xendit Error:', invoice);
      throw new Error(`Xendit error: ${invoice.message || 'Failed to create invoice'}`);
    }

    // 3. Store in xendit_payments
    const { error: dbError } = await supabaseClient
      .from('xendit_payments')
      .insert({
        order_id: pendingOrderId,
        xendit_invoice_id: invoice.id,
        external_id: invoice.external_id,
        status: invoice.status,
        amount: invoice.amount,
        payment_url: invoice.invoice_url,
      });

    if (dbError) {
      console.error('Database Error:', dbError);
      throw new Error('Failed to log payment request');
    }

    return new Response(
      JSON.stringify({ paymentUrl: invoice.invoice_url, invoiceId: invoice.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
