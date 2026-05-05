import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

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
    const { invoiceId, orderId } = await req.json()

    if (!invoiceId && !orderId) {
      throw new Error('Missing invoiceId or orderId')
    }

    // We must use SERVICE ROLE KEY to bypass RLS when reading/updating sensitive records.
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Fetch from xendit_payments
    let query = supabaseClient.from('xendit_payments').select('*');
    if (invoiceId) {
      query = query.eq('xendit_invoice_id', invoiceId);
    } else {
      query = query.eq('order_id', orderId);
    }

    const { data: paymentRecord, error: fetchError } = await query.single();

    if (fetchError || !paymentRecord) {
      throw new Error('Payment record not found');
    }

    const currentInvoiceId = paymentRecord.xendit_invoice_id;

    // 2. Fetch the latest status from Xendit
    const xenditAuth = btoa(`${XENDIT_SECRET_KEY}:`);
    const xenditResponse = await fetch(`https://api.xendit.co/v2/invoices/${currentInvoiceId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${xenditAuth}`
      }
    });

    if (!xenditResponse.ok) {
      throw new Error('Failed to fetch invoice from Xendit');
    }

    const invoice = await xenditResponse.json();

    // 3. Update xendit_payments status
    if (invoice.status !== paymentRecord.status) {
      await supabaseClient
        .from('xendit_payments')
        .update({ status: invoice.status })
        .eq('xendit_invoice_id', currentInvoiceId);
    }

    // 4. If PAID, transfer order to New Facebook Orders
    if (invoice.status === 'PAID' && paymentRecord.status !== 'PAID') {
      // Get the pending order data
      const { data: pendingOrder, error: pendingError } = await supabaseClient
        .from('pending_facebook_orders')
        .select('order_data')
        .eq('id', paymentRecord.order_id)
        .single();

      if (pendingError || !pendingOrder) {
        throw new Error('Pending order not found for transfer');
      }

      const orderData = pendingOrder.order_data;
      
      // Override price status if needed (since it is paid now)
      orderData.paymentOption = 'XENDIT';
      // Append some metadata regarding payment
      orderData.facebookname = orderData.facebookname ? `${orderData.facebookname} [PAID VIA XENDIT]` : '[PAID VIA XENDIT]';

      // Insert into New Facebook Orders
      const { error: insertError } = await supabaseClient
        .from('New Facebook Orders')
        .insert(orderData);

      if (insertError) {
        console.error('Failed to insert into New Facebook Orders:', insertError);
        throw new Error('Failed to complete order transfer');
      }
      
      // Optionally delete or mark pending order as completed
      // await supabaseClient.from('pending_facebook_orders').delete().eq('id', paymentRecord.order_id);
    }

    return new Response(
      JSON.stringify({ status: invoice.status, invoiceId: currentInvoiceId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
