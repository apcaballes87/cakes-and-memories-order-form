import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizeSubmission, createOrReuseXenditPayment, type NormalizedSubmission } from '../supabase/functions/_shared/order-submission';
const capability = '11111111-1111-4111-8111-111111111111';
const canonical = '22222222-2222-4222-8222-222222222222';
function submission(id = canonical): NormalizedSubmission {
  return {
    submissionId: id, routeIdentity: { kind: 'facebook_uuid', facebookU: capability },
    preorderFacebookU: capability, paymentUserId: capability, assets: [],
    payment: { mode: 'xendit', amount: 1 }, requestFingerprint: '',
    orderData: { Name: 'Customer', DateOrdered: '2026-10-06', subscriberid: 'attacker', payment: 999, hold: true },
  };
}
function query(data: unknown) {
  const value: any = { data, error: null };
  for (const name of ['select', 'eq', 'update', 'insert', 'limit']) value[name] = vi.fn(() => value);
  value.maybeSingle = vi.fn(async () => ({ data, error: null }));
  return value;
}
beforeEach(() => {
  vi.stubGlobal('Deno', { env: { get: (key: string) => key === 'XENDIT_SECRET_KEY' ? 'test-secret' : undefined } });
});
describe('Capability submission boundary', () => {
  it('takes price and recipient from PRE and removes operational writes', async () => {
    const request = submission();
    const admin: any = { from: vi.fn(() => query({ subscriberid: 'real-recipient', branch: 'Cebu', totalorderprice: 2500 })), rpc: vi.fn(async () => ({ data: canonical, error: null })) };
    await authorizeSubmission(admin, request);
    expect(request.payment.amount).toBe(2500);
    expect(request.orderData.subscriberid).toBe('real-recipient');
    expect(request.orderData).not.toHaveProperty('payment');
    expect(request.orderData).not.toHaveProperty('hold');
    expect(admin.rpc).toHaveBeenCalledWith('claim_order_submission', expect.objectContaining({ p_capability: capability }));
  });
  it('uses the same fingerprint and canonical submission across different attempt IDs', async () => {
    const admin: any = { from: vi.fn(() => query({ subscriberid: 'real', totalorderprice: 1000 })), rpc: vi.fn(async () => ({ data: canonical, error: null })) };
    const first = submission(); const second = submission('33333333-3333-4333-8333-333333333333');
    await authorizeSubmission(admin, first); await authorizeSubmission(admin, second);
    expect(first.requestFingerprint).toBe(second.requestFingerprint);
    expect(second.submissionId).toBe(canonical);
  });
  it('rejects unknown or fractional active-product quantities before reserving the order', async () => {
    const admin: any = { from: vi.fn(() => query({ subscriberid: 'real', totalorderprice: 1000 })), rpc: vi.fn() };
    const request = submission(); request.orderData.Product1 = 'Cake'; request.orderData.quantity1 = null;
    await expect(authorizeSubmission(admin, request)).rejects.toMatchObject({ code: 'ORDER_QUANTITY_REQUIRED' });
    request.orderData.quantity1 = 1.5;
    await expect(authorizeSubmission(admin, request)).rejects.toMatchObject({ code: 'ORDER_QUANTITY_REQUIRED' });
    expect(admin.rpc).not.toHaveBeenCalled();
  });
  it('rejects nonexistent capability before any claim', async () => {
    const admin: any = { from: vi.fn(() => query(null)), rpc: vi.fn() };
    await expect(authorizeSubmission(admin, submission())).rejects.toMatchObject({ code: 'ORDER_CAPABILITY_NOT_FOUND' });
    expect(admin.rpc).not.toHaveBeenCalled();
  });
  it('never creates another invoice after provider creation has been claimed or became uncertain', async () => {
    const fetchMock = vi.fn(async () => new Response('[]', { status: 200 })); vi.stubGlobal('fetch', fetchMock);
    const admin: any = { from: vi.fn(() => query(null)), rpc: vi.fn(async (name: string) => ({
      data: name === 'prepare_xendit_submission' ? [{ pending_order_id: capability }] : false, error: null,
    })) };
    await expect(createOrReuseXenditPayment(new Request('https://example.com'), submission(), canonical, admin))
      .rejects.toMatchObject({ code: 'PAYMENT_RECOVERY_PENDING' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET' });
  });
});
