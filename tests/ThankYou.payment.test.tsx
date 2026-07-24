import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ThankYou from '../pages/ThankYou';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('../services/supabaseClient', () => ({
  supabase: {
    functions: { invoke: invokeMock },
  },
}));

const renderPaymentReturn = () => render(
  <MemoryRouter initialEntries={['/thank-you?payment=success&submissionId=1ed8c2df-8b36-42bc-9f8c-6e8b03bd1734']}>
    <Routes>
      <Route path="/thank-you" element={<ThankYou />} />
    </Routes>
  </MemoryRouter>,
);

describe('ThankYou payment verification', () => {
  beforeEach(() => invokeMock.mockReset());

  it('only marks the order confirmed after a paid verification response', async () => {
    invokeMock.mockResolvedValue({
      data: { status: 'PAID', orderNumber: 'CEB-260724-001' },
      error: null,
    });
    renderPaymentReturn();

    expect(await screen.findByRole('heading', { name: 'Payment Confirmed' })).toBeInTheDocument();
    expect(screen.getByText('CEB-260724-001')).toBeInTheDocument();
  });

  it('does not call an invoice creation a completed order while payment is pending', async () => {
    invokeMock.mockResolvedValue({
      data: { status: 'PENDING', attemptId: '2fd6b718-d27e-46a9-b530-d5e86859286c' },
      error: null,
    });
    renderPaymentReturn();

    expect(await screen.findByRole('heading', { name: 'Payment Verification' })).toBeInTheDocument();
    expect(screen.getByText(/still being confirmed/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Payment Confirmed' })).not.toBeInTheDocument();
  });
});
