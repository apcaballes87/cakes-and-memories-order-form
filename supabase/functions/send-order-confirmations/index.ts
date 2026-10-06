import { createAdminClient, jsonResponse } from '../_shared/order-submission.ts'

// Internal scheduler only; browser recipients and message text are never accepted.
Deno.serve(async (req: Request) => {
  const secret = Deno.env.get('ORDER_CONFIRMATION_WORKER_SECRET') || Deno.env.get('MESSENGER_WORKER_SECRET')
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 })
  if (req.method !== 'POST') return new Response('POST required', { status: 405 })
  const admin = createAdminClient()
  const { data: settings, error: settingsError } = await admin.from('messenger_settings').select('*').eq('id', true).single()
  if (settingsError) return new Response('Configuration unavailable', { status: 503 })
  if (settings.mode !== 'live' || !settings.verified_at || !settings.legacy_disabled_at) return jsonResponse(req, { processed: 0 })
  const apiKey = Deno.env.get('ZERNIO_API_KEY')
  if (!apiKey) return new Response('Provider unavailable', { status: 503 })
  const { error: staleError } = await admin.from('order_confirmation_outbox').update({ status: 'uncertain', last_error: 'Sending interrupted; reconcile with provider before retry' }).eq('status', 'sending')
    .lt('updated_at', new Date(Date.now() - 10 * 60_000).toISOString())
  if (staleError) return new Response('Queue recovery unavailable', { status: 503 })
  const { data: rows, error } = await admin.from('order_confirmation_outbox').select('*').eq('status', 'pending').limit(3)
  if (error) return new Response('Queue unavailable', { status: 503 })
  let processed = 0
  for (const row of rows || []) {
    const { data: claimed, error: claimError } = await admin.rpc('claim_order_confirmation', { p_outbox: row.id })
    if (claimError) return new Response('Confirmation claim unavailable', { status: 503 })
    if (!claimed) continue
    const session = claimed.session
    const confirmedRow = claimed.outbox
    const message = confirmedRow.transition === 'submitted'
      ? `We received your order form! Your order number is ${confirmedRow.order_number || ''}. Please give our staff time to confirm your order details and payment. Thank you!`
      : 'We received your order form! Please complete the existing card payment link. Our staff will confirm your order details. Thank you!'
    try {
      const response = await fetch(`https://zernio.com/api/v1/inbox/conversations/${encodeURIComponent(session.conversation_id)}/messages`, {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: session.account_id, message }), signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) throw new Error('Provider send uncertain')
      const result = await response.json()
      const id = result.data?.messageId || result.message?.id || result.messageId || result.id
      if (!id) throw new Error('Provider reference missing')
      const { data: acceptedRows, error: acceptedError } = await admin.from('order_confirmation_outbox').update({ status: 'accepted', provider_message_id: id, updated_at: new Date().toISOString() }).eq('id', row.id).eq('status', 'sending').select('id')
      if (acceptedError || !acceptedRows?.length) throw new Error('Confirmation receipt not recorded')
    } catch {
      const { error: uncertainError } = await admin.from('order_confirmation_outbox').update({ status: 'uncertain', last_error: 'Provider acceptance uncertain; reconcile before retry', updated_at: new Date().toISOString() }).eq('id', row.id).eq('status', 'sending')
      if (uncertainError) return new Response('Confirmation recovery unavailable', { status: 503 })
    }
    processed++
  }
  return jsonResponse(req, { processed })
})
