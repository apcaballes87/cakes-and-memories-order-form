import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrderForm, { isUuid } from '../pages/OrderForm';

const fromMock = vi.hoisted(() => vi.fn());

vi.mock('../services/supabaseClient', () => ({
  supabase: {
    from: fromMock,
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('../services/messengerService', () => ({
  sendMessengerConfirmation: vi.fn(),
}));

vi.mock('../services/googleMaps', () => ({
  googleMapsApiKey: '',
  loadGoogleMapsLibraries: vi.fn(),
}));

const renderDefaultForm = () => render(
  <MemoryRouter initialEntries={['/order/default-user/1']}>
    <Routes>
      <Route path="/order/:subscriberId/:numProducts" element={<OrderForm />} />
      <Route path="/thank-you" element={<div>Thank you</div>} />
    </Routes>
  </MemoryRouter>,
);

const fillEverythingExceptProduct = async () => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('First & Last Name'), 'Test Customer');
  await user.type(screen.getByLabelText('Contact Number'), '09171234567');
  await user.click(screen.getByRole('button', { name: 'Set delivery address' }));
  await user.type(screen.getByLabelText(/complete delivery address/i), 'Unit 3, Test Street, Cebu City');
  await user.click(screen.getByRole('button', { name: 'Confirm Address' }));
  fireEvent.change(screen.getByLabelText('Date of Delivery / Pickup'), {
    target: { value: '2099-12-31' },
  });
  await user.selectOptions(screen.getByLabelText('Time of Delivery / Pickup'), '10:00');
  await user.click(screen.getByRole('button', { name: 'GCash' }));
  return user;
};

describe('OrderForm validation and dependency behavior', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('keeps numeric route identities out of UUID fields', () => {
    expect(isUuid('123456789012345')).toBe(false);
    expect(isUuid('60ce0d92-1fa2-4d9d-a50e-9efdd6ac26ce')).toBe(true);
  });

  it('shows an invalid-submit summary and focuses the off-screen Product Type control', async () => {
    const user = await fillEverythingExceptProductAfterRender();
    await user.click(screen.getByRole('button', { name: 'Submit Order' }));

    expect(await screen.findByText('Please check the highlighted details:')).toBeInTheDocument();
    expect(screen.getAllByText('Please select a product type').length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(document.activeElement).toBe(document.getElementById('products-0-productType'));
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('clears stale receiver values when pickup is selected', async () => {
    renderDefaultForm();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Different Receiver'));
    await user.type(screen.getByLabelText("Receiver's Name"), 'Receiver Name');
    await user.type(screen.getByLabelText("Receiver's Contact"), '09170000000');
    await user.click(screen.getByRole('button', { name: 'Pickup at Treehouse' }));
    await user.click(screen.getByRole('button', { name: 'Delivery' }));
    await user.click(screen.getByLabelText('Different Receiver'));

    expect(screen.getByLabelText("Receiver's Name")).toHaveValue('');
    expect(screen.getByLabelText("Receiver's Contact")).toHaveValue('');
  });

  it('clears stale subtype and Other details when Product Type changes', async () => {
    renderDefaultForm();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '1 Tier' }));
    await user.click(screen.getByRole('button', { name: 'Others' }));
    await user.type(screen.getByLabelText('Please specify'), 'Old custom detail');
    await user.click(screen.getByRole('button', { name: '4 Tier' }));
    expect(screen.queryByLabelText('Please specify')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '1 Tier' }));
    expect(screen.queryByLabelText('Please specify')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Others' })).toHaveAttribute('aria-pressed', 'false');
  });
});

const fillEverythingExceptProductAfterRender = async () => {
  renderDefaultForm();
  return fillEverythingExceptProduct();
};
