import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  claimed: [] as unknown[],
  settings: {} as Record<string, unknown>,
  sessions: [] as unknown[],
  updates: [] as Record<string, unknown>[],
  filters: [] as [string, unknown][],
  handler: null as null | ((req: Request) => Promise<Response>),
}));
function query(data: unknown, record = false) {
  const result: any = { data, error: null };
  result.update = vi.fn((fields: Record<string, unknown>) => { state.updates.push(fields); return result; });
  result.eq = vi.fn((column: string, value: unknown) => { if (record) state.filters.push([column, value]); return result; });
  for (const name of ['select', 'not', 'order', 'limit', 'single']) result[name] = vi.fn(() => result);
  return result;
}
vi.mock('../supabase/functions/_shared/order-submission', () => ({
  createAdminClient: () => ({ from: (table: string) => {
    if (table === 'messenger_settings') return query(state.settings);
    if (table === 'messenger_sessions') return query(state.sessions);
    return query(state.claimed, true);
  } }),
}));
beforeAll(async () => {
  vi.stubGlobal('Deno', {
    env: { get: (key: string) => key === 'ZERNIO_API_KEY' ? 'zernio-key' : undefined },
    serve: (handler: (req: Request) => Promise<Response>) => { state.handler = handler; },
  });
  await import('../supabase/functions/messenger-order-confirmation/index');
});
beforeEach(() => {
  state.claimed = []; state.updates = []; state.filters = [];
  state.settings = { mode: 'live', account_id: 'acct', verified_at: 'now', legacy_disabled_at: 'now', test_psids: [] };
  state.sessions = [{ psid: '123456789', account_id: 'acct', conversation_id: 'conv-1', last_inbound_at: new Date().toISOString() }];
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"data":{"messageId":"zm_1"}}')));
});
const post = (body: unknown) => state.handler!(new Request('https://example.com', { method: 'POST', body: JSON.stringify(body) }));
describe('Messenger order confirmation', () => {
  it('rejects malformed requests without sending', async () => {
    expect((await post({ orderId: '1', token: 't' })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('sends nothing when the order/token pair is not queued', async () => {
    expect(await (await post({ orderId: 42, token: 'guess' })).json()).toEqual({ sent: false });
    expect(state.filters).toEqual([['order_id', 42], ['token', 'guess'], ['status', 'queued']]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('sends the fixed template to the customer conversation and ignores supplied recipient/text', async () => {
    state.claimed = [{ psid: '123456789', order_number: 'CEB-261013-004' }];
    const response = await post({ orderId: 42, token: 'real', psid: 'attacker', message: 'arbitrary text' });
    expect(await response.json()).toEqual({ sent: true });
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://zernio.com/api/v1/inbox/conversations/conv-1/messages');
    expect((options?.headers as Record<string, string>)['Idempotency-Key']).toBe('order-confirmation-42');
    expect(JSON.parse(String(options?.body))).toEqual({
      accountId: 'acct',
      message: 'We received your order form! Your order number is CEB-261013-004. Please give our staff time to confirm your order details and payment. Thank you!',
      messagingType: 'RESPONSE',
    });
    expect(state.updates.at(-1)).toMatchObject({ status: 'sent', provider_message_id: 'zm_1' });
  });
  it('skips when the dashboard Messenger gate is off for this customer', async () => {
    state.claimed = [{ psid: '123456789', order_number: 'CEB-1' }];
    state.settings = { ...state.settings, mode: 'shadow' };
    await post({ orderId: 42, token: 'real' });
    expect(fetch).not.toHaveBeenCalled();
    expect(state.updates.at(-1)).toMatchObject({ status: 'skipped', detail: 'Messenger sending is off (shadow mode)' });
  });
  it('skips when the 24-hour reply window has passed', async () => {
    state.claimed = [{ psid: '123456789', order_number: 'CEB-1' }];
    state.sessions = [{ ...(state.sessions[0] as object), last_inbound_at: new Date(Date.now() - 25 * 3600_000).toISOString() }];
    await post({ orderId: 42, token: 'real' });
    expect(fetch).not.toHaveBeenCalled();
    expect(state.updates.at(-1)).toMatchObject({ status: 'skipped', detail: 'Messenger reply window expired' });
  });
  it('records Zernio rejections as failed without retrying', async () => {
    state.claimed = [{ psid: '123456789', order_number: null }];
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{"error":"conversation not found"}', { status: 404 }));
    expect((await post({ orderId: 42, token: 'real' })).status).toBe(502);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(state.updates.at(-1)).toMatchObject({ status: 'failed', detail: 'Zernio 404: {"error":"conversation not found"}' });
  });
});
