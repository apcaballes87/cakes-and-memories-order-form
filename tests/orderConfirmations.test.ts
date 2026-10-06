import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ mode: 'shadow', handler: null as null | ((req: Request) => Promise<Response>) }));
function query(data: unknown) {
  const result: any = { data, error: null };
  for (const name of ['select', 'eq', 'update', 'lt', 'limit', 'single']) result[name] = vi.fn(() => result);
  return result;
}
vi.mock('../supabase/functions/_shared/order-submission', () => ({
  createAdminClient: () => ({ rpc: async () => ({ data: { outbox: { transition: 'submitted', order_number: 'CEB-123' }, session: { account_id: 'real-account', conversation_id: 'real-conversation' } }, error: null }), from: (table: string) => {
    if (table === 'messenger_settings') return query({ mode: state.mode, account_id: 'real-account', verified_at: 'now', legacy_disabled_at: 'now' });
    if (table === 'messenger_sessions') return query({ id: 'session', account_id: 'real-account', conversation_id: 'real-conversation', status: 'completed', last_inbound_at: new Date().toISOString() });
    return query([{ id: 'outbox', session_id: 'session', transition: 'submitted', order_number: 'CEB-123' }]);
  } }),
  jsonResponse: (_req: Request, body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }),
}));
beforeAll(async () => {
  vi.stubGlobal('Deno', {
    env: { get: (key: string) => key === 'ORDER_CONFIRMATION_WORKER_SECRET' ? 'internal-secret' : key === 'ZERNIO_API_KEY' ? 'provider-test-key' : undefined },
    serve: (handler: (req: Request) => Promise<Response>) => { state.handler = handler; },
  });
  await import('../supabase/functions/send-order-confirmations/index');
});
beforeEach(() => { state.mode = 'shadow'; vi.stubGlobal('fetch', vi.fn(async () => new Response('{"messageId":"provider-id"}'))); });
describe('Server-owned confirmations', () => {
  it('rejects browser invocation without worker authorization', async () => {
    const response = await state.handler!(new Request('https://example.com', { method: 'POST' }));
    expect(response.status).toBe(401); expect(fetch).not.toHaveBeenCalled();
  });
  it('does not send while shadow even with worker authorization', async () => {
    const response = await state.handler!(new Request('https://example.com', { method: 'POST', headers: { authorization: 'Bearer internal-secret' } }));
    expect(await response.json()).toEqual({ processed: 0 }); expect(fetch).not.toHaveBeenCalled();
  });
  it('ignores supplied recipient/text and uses authoritative session and fixed transition template', async () => {
    state.mode = 'live';
    await state.handler!(new Request('https://example.com', { method: 'POST', headers: { authorization: 'Bearer internal-secret' }, body: JSON.stringify({ psid: 'attacker', message: 'arbitrary text' }) }));
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('/real-conversation/messages');
    expect(JSON.parse(String(options?.body))).toEqual({ accountId: 'real-account', message: 'We received your order form! Your order number is CEB-123. Please give our staff time to confirm your order details and payment. Thank you!' });
  });
});
