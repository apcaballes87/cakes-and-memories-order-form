import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrderForm, { staffPreviewRequest } from '../pages/OrderForm';
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), invoke: vi.fn() }));
vi.mock('../services/supabaseClient', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc, functions: { invoke: mocks.invoke } } }));
vi.mock('../services/googleMaps', () => ({ googleMapsApiKey: '', loadGoogleMapsLibraries: vi.fn() }));
const facebookU = '11111111-1111-4111-8111-111111111111';
const session = '22222222-2222-4222-8222-222222222222';
function previewSearch(overrides: Record<string, string> = {}) {
  return `?${new URLSearchParams({ previewSession: session, previewRevision: '2', previewHash: 'a'.repeat(64),
    previewExpires: String(Math.floor(Date.now() / 1000) + 600), previewToken: 'b'.repeat(64), ...overrides })}`;
}
function renderPreview(search = previewSearch()) {
  return render(<MemoryRouter initialEntries={[`/order/${facebookU}${search}`]}><Routes>
    <Route path="/order/:facebookU" element={<OrderForm />} />
  </Routes></MemoryRouter>);
}
beforeEach(() => {
  mocks.from.mockReset(); mocks.rpc.mockReset(); mocks.invoke.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});
describe('Read-only signed staff preview', () => {
  it('uses the fixed backend and rejects missing, duplicate and expired signature fields', () => {
    expect(staffPreviewRequest(previewSearch()).url).toMatch(/^https:\/\/production.cakesandmemories.com\/api\/messenger-preview\?/);
    expect(staffPreviewRequest('?previewSession=' + session)).toHaveProperty('error');
    expect(staffPreviewRequest(previewSearch() + '&previewToken=other')).toHaveProperty('error');
    expect(staffPreviewRequest(previewSearch({ previewExpires: '1' })).error).toContain('expired');
    expect(staffPreviewRequest('?other=true')).toEqual({ active: false });
  });
  it('hydrates the actual form and prevents clicks and synthetic submission from uploading, saving or paying', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ draft: {
      facebookU, Name: 'Preview customer', contact: '09171234567', Addres: 'Cebu address', DateEvent: '2026-10-09', TimeEvent: '16:00',
      Product1: '6" Round (4" Thickness)', details1: 'Pink cake', quantity1: 2, Candle: 'stick',
      Product2: 'N/A', details2: 'Second cake', quantity2: 1, candle2: 'number 2', pic2: '["https://example.com/second.jpg"]',
      product3: 'N/A', details3: 'Third cake', qty3: '3', candle3: 'number 3',
      cakeimages: ['https://example.com/first.jpg'], paymentOption: 'Credit Card', totalorderprice: 2000,
      messenger_prefill: { eventTime: '16:00', products: [{ flavor: 'Vanilla' }, {}, {}] },
    }, reviewReasons: ['Confirm image selection'], expiresAt: new Date(Date.now() + 600000).toISOString(), processing: true })));
    const { container } = renderPreview();
    expect(await screen.findByDisplayValue('Preview customer')).toBeDisabled();
    expect(screen.getByText('Staff preview — not sent, read-only')).toBeInTheDocument();
    expect(screen.getByText('Confirm image selection')).toBeInTheDocument();
    expect(screen.getByText(/last saved draft/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('number 2')).toBeDisabled();
    expect(screen.getByDisplayValue('number 3')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Vanilla' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Date of Delivery / Pickup')).toHaveValue('2026-10-09');
    expect(screen.getByLabelText('Time of Delivery / Pickup')).toHaveValue('16:00');
    expect(container.querySelector('img[src="https://example.com/second.jpg"]')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: /Pay via Credit Card/ });
    expect(submit).toBeDisabled(); fireEvent.click(submit); fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it('shows the selected GCash method, contact and archived receipt without allowing replacement or submission', async () => {
    const receipt = 'https://example.com/archived-receipt.jpg';
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ draft: {
      facebookU, Name: 'Preview customer', subscriberid: '123', contact: '09171234567',
      paymentOption: 'GCash', orderNumber: receipt, Product1: '6" Round (4" Thickness)',
    }, reviewReasons: [] })));
    const { container } = renderPreview();
    expect(await screen.findByDisplayValue('09171234567')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'GCash', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByAltText('Saved payment screenshot')).toHaveAttribute('src', receipt);
    expect(screen.getByRole('link', { name: 'Open saved payment screenshot' })).toHaveAttribute('href', receipt);
    expect(screen.getByRole('button', { name: 'Remove saved payment screenshot' })).toBeDisabled();
    fireEvent.submit(container.querySelector('form')!);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it('does not render a non-HTTPS order identifier as a receipt link', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ draft: {
      facebookU, Name: 'Preview customer', paymentOption: 'GCash', orderNumber: 'javascript:alert(1)',
    }, reviewReasons: [] })));
    renderPreview();
    await screen.findByDisplayValue('Preview customer');
    expect(screen.queryByRole('link', { name: 'Open saved payment screenshot' })).not.toBeInTheDocument();
  });
  it('keeps normal fields and submission unavailable while the preview request is pending', async () => {
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(new Promise<Response>(resolve => { finish = resolve; }));
    renderPreview();
    expect(screen.getByRole('status')).toHaveTextContent('Loading staff preview');
    expect(screen.queryByLabelText('First & Last Name')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit Order' })).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
    finish(new Response('{}', { status: 410 }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/expired or changed/);
  });
  it('fails closed for incomplete preview without normal form fallback or database reads', async () => {
    renderPreview('?previewSession=' + session);
    expect(await screen.findByRole('alert')).toHaveTextContent(/incomplete or invalid/);
    expect(screen.queryByLabelText('First & Last Name')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
  });
  it('shows an expired/changed preview error and never falls back to the customer draft RPC', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 403 }));
    renderPreview();
    expect(await screen.findByRole('alert')).toHaveTextContent(/expired or changed/);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
  });
  it('rejects a response scoped to another order UUID', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ draft: { facebookU: session }, reviewReasons: [] })));
    renderPreview();
    expect(await screen.findByRole('alert')).toHaveTextContent(/does not match/);
    expect(screen.queryByRole('button', { name: 'Submit Order' })).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
