import { createAdminClient } from '../_shared/order-submission.ts'

// Called only by trg_queue_messenger_order_confirmation via pg_net. The caller
// proves itself with the per-order token stored in the service-role-only
// queue table; recipient and text always come from the database.
const GRAPH_SEND_URL = 'https://graph.facebook.com/v20.0/me/messages'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
})

export const confirmationMessage = (orderNumber?: string | null) => orderNumber
  ? `We received your order form! Your order number is ${orderNumber}. Please give our staff time to confirm your order details and payment. Thank you!`
  : 'We received your order form! Please give our staff time to confirm your order details and payment. Thank you!'

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)

  let orderId: unknown, token: unknown
  try {
    ({ orderId, token } = await req.json())
  } catch {
    return json({ error: 'Invalid request' }, 400)
  }
  if (!Number.isSafeInteger(orderId) || typeof token !== 'string') return json({ error: 'Invalid request' }, 400)

  const admin = createAdminClient()
  // Claim the queued row exactly once; a replayed or guessed request finds nothing.
  const { data: claimed, error: claimError } = await admin.from('messenger_order_confirmations')
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .eq('order_id', orderId).eq('token', token).eq('status', 'queued')
    .select('psid, order_number')
  if (claimError) return json({ error: 'Queue unavailable' }, 503)
  if (!claimed?.length) return json({ sent: false })

  const { psid, order_number: orderNumber } = claimed[0]
  const finish = (fields: Record<string, unknown>) => admin.from('messenger_order_confirmations')
    .update({ ...fields, updated_at: new Date().toISOString() }).eq('order_id', orderId)

  const pageToken = Deno.env.get('FB_PAGE_ACCESS_TOKEN')
  if (!pageToken) {
    await finish({ status: 'failed', detail: 'FB_PAGE_ACCESS_TOKEN is not configured' })
    return json({ sent: false }, 503)
  }

  try {
    const response = await fetch(GRAPH_SEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pageToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: psid },
        message: { text: confirmationMessage(orderNumber) },
        messaging_type: 'RESPONSE',
      }),
      signal: AbortSignal.timeout(10_000),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      const fbError = result?.error
      await finish({
        status: 'failed',
        detail: `Facebook ${fbError?.code ?? response.status}${fbError?.error_subcode ? `/${fbError.error_subcode}` : ''}: ${fbError?.message ?? 'send rejected'}`.slice(0, 500),
      })
      return json({ sent: false }, 502)
    }
    await finish({ status: 'sent', fb_message_id: result.message_id ?? null, detail: null })
    return json({ sent: true })
  } catch (error) {
    // Facebook may still have delivered it, so it is never retried automatically.
    await finish({ status: 'failed', detail: `Send uncertain: ${error?.message ?? 'network error'}`.slice(0, 500) })
    return json({ sent: false }, 502)
  }
})
