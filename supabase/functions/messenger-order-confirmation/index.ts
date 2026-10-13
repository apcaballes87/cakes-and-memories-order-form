import { createAdminClient } from '../_shared/order-submission.ts'

// Called only by trg_queue_messenger_order_confirmation via pg_net. The caller
// proves itself with the per-order token stored in the service-role-only
// queue table; recipient and text always come from the database. Sends go
// through Zernio with the same gate and reply window as the order-list
// dashboard's Messenger sends.
const ZERNIO_API_BASE = 'https://zernio.com/api/v1'
const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
})

export const confirmationMessage = (orderNumber?: string | null) => orderNumber
  ? `We received your order form! Your order number is ${orderNumber}. Please give our staff time to confirm your order details and payment. Thank you!`
  : 'We received your order form! Please give our staff time to confirm your order details and payment. Thank you!'

type SendSettings = { mode: string; account_id?: string | null; verified_at?: string | null; legacy_disabled_at?: string | null; test_psids?: string[] | null }
/** Mirrors messenger_sends_to: full live mode, or a test PSID while the rest stays in shadow. */
export function sendsTo(cfg: SendSettings, session: { psid?: string | null; account_id?: string | null }) {
  if (session.account_id !== cfg.account_id) return false
  if (cfg.mode === 'live') return Boolean(cfg.verified_at && cfg.legacy_disabled_at)
  return cfg.mode === 'shadow' && Boolean(session.psid) && (cfg.test_psids || []).includes(session.psid as string)
}

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
  const finish = async (fields: Record<string, unknown>, status = 200) => {
    await admin.from('messenger_order_confirmations')
      .update({ ...fields, updated_at: new Date().toISOString() }).eq('order_id', orderId)
    return json({ sent: fields.status === 'sent' }, status)
  }

  const apiKey = Deno.env.get('ZERNIO_API_KEY')
  if (!apiKey) return finish({ status: 'failed', detail: 'ZERNIO_API_KEY is not configured' }, 503)

  const [{ data: cfg, error: cfgError }, { data: sessions, error: sessionError }] = await Promise.all([
    admin.from('messenger_settings').select('*').eq('id', true).single(),
    admin.from('messenger_sessions').select('psid, account_id, conversation_id, last_inbound_at')
      .eq('psid', psid).not('conversation_id', 'is', null)
      .order('last_inbound_at', { ascending: false, nullsFirst: false }).limit(1),
  ])
  if (cfgError || sessionError) return finish({ status: 'failed', detail: 'Messenger configuration unavailable' }, 503)
  const session = sessions?.[0]
  if (!session) return finish({ status: 'skipped', detail: 'No Messenger conversation for this customer' })
  if (!sendsTo(cfg, session)) return finish({ status: 'skipped', detail: `Messenger sending is off (${cfg.mode} mode)` })
  if (!session.last_inbound_at || Date.now() - Date.parse(session.last_inbound_at) > REPLY_WINDOW_MS) {
    return finish({ status: 'skipped', detail: 'Messenger reply window expired' })
  }

  try {
    const response = await fetch(`${ZERNIO_API_BASE}/inbox/conversations/${encodeURIComponent(session.conversation_id)}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `order-confirmation-${orderId}`,
      },
      body: JSON.stringify({
        accountId: session.account_id,
        message: confirmationMessage(orderNumber),
        messagingType: 'RESPONSE',
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return finish({ status: 'failed', detail: `Zernio ${response.status}: ${text}`.slice(0, 500) }, 502)
    }
    const result = await response.json().catch(() => ({}))
    const id = result.data?.messageId || result.message?.id || result.messageId || result.id || null
    return finish({ status: 'sent', provider_message_id: id, detail: null })
  } catch (error) {
    // Zernio may still have delivered it, so it is never retried automatically.
    return finish({ status: 'failed', detail: `Send uncertain: ${error?.message ?? 'network error'}`.slice(0, 500) }, 502)
  }
})
