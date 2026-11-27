import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/supabaseClient', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() }, functions: { invoke: vi.fn() } } }));
vi.mock('../services/messengerService', () => ({ sendOrderConfirmation: vi.fn() }));
vi.mock('../services/googleMaps', () => ({ loadGoogleMaps: vi.fn() }));

import { getLocalDateInputValue, mapPreOrderProducts, PrefilledPhoto, sizeAlias } from '../pages/OrderForm';
import { formatPhoneNumber } from '../utils/helpers';

describe('AI sizes from the price list → this form’s menu', () => {
  it('maps the price-list names the AI uses', () => {
    expect(sizeAlias('6"9"')).toEqual({ size: '6"x9"', notes: [] });
    expect(sizeAlias('6"9"12" Fondant')).toEqual({ size: '6"x9"x12"', notes: ['Fondant'] });
    expect(sizeAlias('2oz Vanilla Cupcakes')).toEqual({ size: 'Vanilla Cupcakes', notes: [] });
    expect(sizeAlias('8x12 (3" thickness)')).toEqual({ size: '8x12 Rectangular Cake', notes: ['3" thickness'] });
    expect(sizeAlias('10x10 (4" thickness)')).toEqual({ size: '10x10 Square Cake', notes: ['4" thickness'] });
  });

  it('prefills the right product type and size, with tier flavors kept', () => {
    const [cake] = mapPreOrderProducts({
      Product1: '6"9"', messenger_prefill: { products: [{ topTierFlavor: 'Vanilla', bottomTierFlavor: 'Ube' }] },
    });
    expect(cake).toMatchObject({ productType: '2 Tier', productSubType: '6"x9"', topTierFlavor: 'Vanilla', bottomTierFlavor: 'Ube' });

    const [cupcakes] = mapPreOrderProducts({ Product1: '2oz Vanilla Cupcakes', messenger_prefill: { products: [{}] } });
    expect(cupcakes).toMatchObject({ productType: 'Cupcakes & Pastries', productSubType: 'Vanilla Cupcakes' });
  });

  it('puts what the menu cannot hold into the details, once', () => {
    const [fondant] = mapPreOrderProducts({ Product1: '8" Round (5" thickness) Fondant', details1: 'Pink', messenger_prefill: { products: [{ flavor: 'Chocolate' }] } });
    expect(fondant).toMatchObject({ productType: '1 Tier', productSubType: '8" Round (5" Thickness)', cakeFlavor: 'Chocolate', details: 'Pink\nFondant' });
    const [already] = mapPreOrderProducts({ Product1: '7"10" Fondant', details1: 'Icing only, not fondant', messenger_prefill: { products: [{}] } });
    expect(already).toMatchObject({ productSubType: '7"x10"', details: 'Icing only, not fondant' });
  });

  it('keeps the AI flavor in the details when the size is not on the menu', () => {
    const [other] = mapPreOrderProducts({ Product1: '6" Round (3" thickness)', messenger_prefill: { products: [{ flavor: 'Ube' }] } });
    expect(other).toMatchObject({ productType: 'Other', otherProduct: '6" Round (3" thickness)', details: 'Flavor: Ube' });
  });

  it('leaves sizes that already match alone', () => {
    const [cake] = mapPreOrderProducts({ Product1: '6" Round (4" thickness)', details1: '', messenger_prefill: { products: [{ flavor: 'Chocolate' }] } });
    expect(cake).toMatchObject({ productType: '1 Tier', productSubType: '6" Round (4" Thickness)', cakeFlavor: 'Chocolate', details: '' });
  });
});

describe('contact numbers', () => {
  it('keeps every digit of a +63 number', () => {
    expect(formatPhoneNumber('+63 917 123 4567')).toBe('0917 123 4567');
    expect(formatPhoneNumber('639171234567')).toBe('0917 123 4567');
    expect(formatPhoneNumber('09171234567')).toBe('0917 123 4567');
    expect(formatPhoneNumber('0917')).toBe('0917');
    expect(formatPhoneNumber('+1 415 555 01234')).toBe('1415 555 0123 4');
  });
});

describe('Manila dates', () => {
  it('uses Manila’s day, not the phone’s or UTC', () => {
    // 11:30 PM UTC on Nov 27 is 7:30 AM Nov 28 in Manila
    expect(getLocalDateInputValue(new Date('2026-11-27T23:30:00Z'))).toBe('2026-11-28');
    expect(getLocalDateInputValue(new Date('2026-11-28T15:59:00Z'))).toBe('2026-11-28');
    expect(getLocalDateInputValue(new Date('2026-11-28T16:01:00Z'))).toBe('2026-11-29');
  });
});

describe('prefilled photos', () => {
  it('says the photo could not load instead of showing a broken image', () => {
    render(<PrefilledPhoto url="https://example.com/expired.jpg" index={0} />);
    fireEvent.error(screen.getByAltText('Existing 1'));
    expect(screen.getByRole('img', { name: "Photo 1 couldn't load" })).toHaveTextContent('Remove it and upload it again');
  });
});
