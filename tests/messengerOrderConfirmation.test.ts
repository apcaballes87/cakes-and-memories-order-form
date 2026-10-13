import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  claimed: [] as unknown[],
  updates: [] as Record<string, unknown>[],
  filters: [] as [string, unknown][],
  handler: null as null | ((req: Request) => Promise<Response>),
}));
function query(data: unknown) {
  const result: any = { data, error: null };
  result.update = vi.fn((fields: Record<string, unknown>) => { state.updates.push(fields); return result; });
  result.eq = vi.fn((column: string, value: unknown) => { state.filters.push([column, value]); return result; });
  result.select = vi.fn(() => result);
  return result;
}
vi.mock('../supabase/functions/_shared/order-submission', () => ({
  createAdminClient: () => ({ from: () => query(state.claimed) }),
}));
beforeAll(async () => {
  vi.stubGlobal('Deno', {
    env: { get: (key: string) => key === 'FB_PAGE_ACCESS_TOKEN' ? 'page-token' : undefined },
    serve: (handler: (req: Request) => Promise<Response>) => { state.handler = handler; },
  });
  await import('../supabase/functions/messenger-order-confirmation/index');
});
beforeEach(() => {
  state.claimed = []; state.updates = []; state.filters = [];
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message_id":"m_1"}')));
});
const post = (body: unknown) => state.handler!(new Request('https://example.com', { method: 'POST', body: JSON.stringify(body) }));
describe('Messenger order confirmation', () => {
  it('rejects malformed requests without touching Facebook', async () => {
    expect((await post({ orderId: '1', token: 't' })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('sends nothing when the order/token pair is not queued', async () => {
    expect(await (await post({ orderId: 42, token: 'guess' })).json()).toEqual({ sent: false });
    expect(state.filters).toEqual([['order_id', 42], ['token', 'guess'], ['status', 'queued']]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('sends the fixed template to the queued PSID and ignores supplied recipient/text', async () => {
    state.claimed = [{ psid: '123456789', order_number: 'CEB-261013-004' }];
    const response = await post({ orderId: 42, token: 'real', psid: 'attacker', message: 'arbitrary text' });
    expect(await response.json()).toEqual({ sent: true });
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v20.0/me/messages');
    expect(JSON.parse(String(options?.body))).toEqual({
      recipient: { id: '123456789' },
      message: { text: 'We received your order form! Your order number is CEB-261013-004. Please give our staff time to confirm your order details and payment. Thank you!' },
      messaging_type: 'RESPONSE',
    });
    expect(state.updates.at(-1)).toMatchObject({ status: 'sent', fb_message_id: 'm_1' });
  });
  it('records Facebook rejections as failed without retrying', async () => {
    state.claimed = [{ psid: '123456789', order_number: null }];
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{"error":{"code":190,"error_subcode":460,"message":"Error validating access token"}}', { status: 400 }));
    expect((await post({ orderId: 42, token: 'real' })).status).toBe(502);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(state.updates.at(-1)).toMatchObject({ status: 'failed', detail: 'Facebook 190/460: Error validating access token' });
  });
});
