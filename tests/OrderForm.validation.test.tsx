import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrderForm, { formatProductDescription, isUuid, mapPreOrderProducts, getPrefilledTime, retainedSubmissionId } from '../pages/OrderForm';

const fromMock = vi.hoisted(() => vi.fn());
const rpcMock = vi.hoisted(() => vi.fn());

vi.mock('../services/supabaseClient', () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock,
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
    rpcMock.mockReset().mockResolvedValue({ data: null, error: null });
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

  it('shows the appropriate required flavor fields for each cake tier count', async () => {
    renderDefaultForm();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '1 Tier' }));
    expect(screen.getByText('Cake Flavor')).toBeInTheDocument();
    expect(screen.queryByText('Top Tier Flavor')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '2 Tier' }));
    expect(screen.getByText('Top Tier Flavor')).toBeInTheDocument();
    expect(screen.getByText('Bottom Tier Flavor')).toBeInTheDocument();
    expect(screen.queryByText('Middle Tier Flavor')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '3 Tier' }));
    expect(screen.getByText('Top Tier Flavor')).toBeInTheDocument();
    expect(screen.getByText('Middle Tier Flavor')).toBeInTheDocument();
    expect(screen.getByText('Bottom Tier Flavor')).toBeInTheDocument();
  });

  it('limits Bento Cake to Chocolate and selects it automatically', async () => {
    renderDefaultForm();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '1 Tier' }));
    await user.click(screen.getByRole('button', { name: 'Bento Cake (4")' }));

    expect(screen.getByRole('button', { name: 'Chocolate' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Vanilla' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ube' })).not.toBeInTheDocument();
  });

  it('requires a flavor for Square or Rectangular cakes and saves it with the product', async () => {
    renderDefaultForm();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Square or Rectangular' }));
    expect(screen.getByText('Cake Flavor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chocolate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vanilla' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ube' })).toBeInTheDocument();

    expect(formatProductDescription({
      productType: 'Square or Rectangular',
      productSubType: '8x12 Rectangular Cake',
      otherProduct: '',
      cakeFlavor: 'Ube',
      topTierFlavor: '',
      middleTierFlavor: '',
      bottomTierFlavor: '',
    })).toBe('8x12 Rectangular Cake Ube');
  });

  it('includes each selected flavor in the saved product description', () => {
    expect(formatProductDescription({
      productType: '1 Tier',
      productSubType: '6\" Round (4\" Thickness)',
      otherProduct: '',
      cakeFlavor: 'Vanilla',
      topTierFlavor: '',
      middleTierFlavor: '',
      bottomTierFlavor: '',
    })).toBe('6\" Round (4\" Thickness) Vanilla');

    expect(formatProductDescription({
      productType: '3 Tier',
      productSubType: '6\"x9\"x12\"',
      otherProduct: '',
      cakeFlavor: '',
      topTierFlavor: 'Chocolate',
      middleTierFlavor: 'Ube',
      bottomTierFlavor: 'Vanilla',
    })).toBe('6\"x9\"x12\" Top Tier: Chocolate, Middle Tier: Ube, Bottom Tier: Vanilla');
  });
});

const fillEverythingExceptProductAfterRender = async () => {
  renderDefaultForm();
  return fillEverythingExceptProduct();
};


describe('Messenger PRE product compatibility', () => {
  it('distinguishes explicit midnight from the legacy unknown-time sentinel', () => {
    expect(getPrefilledTime({TimeEvent:'00:00:00'})).toBe('');
    expect(getPrefilledTime({TimeEvent:'00:00:00',messenger_prefill:{eventTime:'00:00'}})).toBe('00:00');
  });
  it('renders an unknown-size archived image and a prefilled flavor from a fetched draft', async () => {
    const query = (data: unknown) => {
      const builder = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data, error: null }) };
      for (const key of ['select', 'eq', 'order', 'limit'] as const) builder[key].mockReturnValue(builder);
      return builder;
    };
    rpcMock.mockResolvedValue({ data: {
      subscriberid: '123', contact: '09171234567', paymentOption: 'GCash', orderNumber: 'https://example.com/receipt.jpg', TimeEvent: '09:30:00', cakeimages: ['https://example.com/unknown-design.jpg'],
      Product2: '6" Round (4" Thickness)', messenger_prefill: { products: [{ flavor: '' }, { flavor: 'Ube' }] },
    }, error: null });
    fromMock.mockImplementation(() => query(null));
    render(<MemoryRouter initialEntries={['/order/60ce0d92-1fa2-4d9d-a50e-9efdd6ac26ce']}>
      <Routes><Route path="/order/:facebookU" element={<OrderForm />} /></Routes>
    </MemoryRouter>);
    expect(await screen.findByAltText('Existing 1')).toHaveAttribute('src', 'https://example.com/unknown-design.jpg');
    expect(screen.getByLabelText('Time of Delivery / Pickup')).toHaveValue('09:30');
    expect(screen.getByRole('option', { name: '09:30 (prefilled)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ube' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Contact Number')).toHaveValue('09171234567');
    expect(screen.getByRole('button', { name: 'GCash', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByAltText('Saved payment screenshot')).toHaveAttribute('src', 'https://example.com/receipt.jpg');
    expect(screen.getByRole('link', { name: 'Open saved payment screenshot' })).toHaveAttribute('href', 'https://example.com/receipt.jpg');
  });

  it('does not fall back to a broad table read when scoped draft retrieval fails', async () => {
    const builder = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    for (const key of ['select', 'eq', 'order', 'limit'] as const) builder[key].mockReturnValue(builder);
    fromMock.mockReturnValue(builder);
    rpcMock.mockResolvedValue({ data: null, error: new Error('RPC unavailable') });
    render(<MemoryRouter initialEntries={['/order/60ce0d92-1fa2-4d9d-a50e-9efdd6ac26ce']}>
      <Routes><Route path="/order/:facebookU" element={<OrderForm />} /></Routes>
    </MemoryRouter>);
    expect(await screen.findByText('We could not load the saved order details. Please refresh and try again.')).toBeInTheDocument();
    expect(fromMock).not.toHaveBeenCalledWith('New PRE Facebook Orders');
  });

  it('retains selected design images and notes before a size is known', () => {
    const [product] = mapPreOrderProducts({ Product1: 'N/A', cakeimages: ['https://example.com/design.jpg'], details1: 'Change to pink' });
    expect(product.productType).toBe('');
    expect(product.preExistingImages).toEqual(['https://example.com/design.jpg']);
    expect(product.details).toBe('Change to pink');
  });

  it('prefills supported single and tier flavors without guessing unsupported values', () => {
    const products = mapPreOrderProducts({
      Product1: '6" Round (4" Thickness)', Product2: '6"x9"',
      messenger_prefill: { products: [{ flavor: 'vanilla' }, { topTierFlavor: 'Ube', bottomTierFlavor: 'Chocolate', middleTierFlavor: 'Strawberry' }] },
    });
    expect(products[0].cakeFlavor).toBe('Vanilla');
    expect(products[1].topTierFlavor).toBe('Ube');
    expect(products[1].bottomTierFlavor).toBe('Chocolate');
    expect(products[1].middleTierFlavor).toBe('');
  });

  it('keeps later product images in their original slot and supports JSON image arrays', () => {
    const products = mapPreOrderProducts({ pic3: '["https://example.com/a.jpg","https://example.com/b.jpg"]' });
    expect(products).toHaveLength(3);
    expect(products[0].preExistingImages).toBeUndefined();
    expect(products[2].preExistingImages).toEqual(['https://example.com/a.jpg', 'https://example.com/b.jpg']);
  });

  it('continues loading legacy drafts and uses the Bento flavor constraint', () => {
    const [legacy] = mapPreOrderProducts({ Product1: 'Bento Cake (4")', cakeimages: ['https://example.com/a.jpg'] });
    expect(legacy.cakeFlavor).toBe('Chocolate');
    expect(legacy.productType).toBe('1 Tier');
    expect(mapPreOrderProducts({})).toHaveLength(1);
  });
});


describe('Messenger quantities and candles', () => {
  it('preserves unknown quantities for customer confirmation in each slot', () => {
    const products = mapPreOrderProducts({ Product1: 'N/A', Product2: 'N/A', product3: 'N/A',
      details1: 'one', details2: 'two', details3: 'three', quantity1: null, quantity2: null, qty3: '',
      Candle: 'stick', candle2: 'number 2', candle3: 'number 3', messenger_prefill: { products: [{}, {}, {}] } });
    expect(products).toHaveLength(3);
    expect(products.every(product => Number.isNaN(product.quantity))).toBe(true);
    expect(products.map(product => product.candle)).toEqual(['stick', 'number 2', 'number 3']);
  });
  it('retains legacy uppercase fallback and explicitly stated quantity', () => {
    const products = mapPreOrderProducts({ Product2: 'N/A', details2: 'cake', Candle2: 'legacy', quantity2: 2 });
    expect(products[1].quantity).toBe(2);
    expect(products[1].candle).toBe('legacy');
  });
});


it('retains a random submission ID for reload recovery without reusing another route', () => {
  sessionStorage.clear();
  const first = retainedSubmissionId('attempt:one');
  expect(retainedSubmissionId('attempt:one')).toBe(first);
  expect(retainedSubmissionId('attempt:two')).not.toBe(first);
});
