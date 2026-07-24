import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AddressModal from '../components/AddressModal';

vi.mock('../services/googleMaps', () => ({
  googleMapsApiKey: '',
  loadGoogleMapsLibraries: vi.fn(),
}));

describe('AddressModal manual fallback', () => {
  it('accepts a complete typed address with null coordinates', () => {
    const onSelect = vi.fn();
    render(
      <AddressModal
        isOpen
        onClose={vi.fn()}
        onSelect={onSelect}
        currentSelection={null}
      />,
    );

    expect(screen.getByText('Manual address mode')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/complete delivery address/i), {
      target: { value: 'Unit 2, Example Building, Cebu City' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Address' }));

    expect(onSelect).toHaveBeenCalledWith({
      address: 'Unit 2, Example Building, Cebu City',
      coordinates: null,
      source: 'manual',
    });
  });

  it('requires the complete address and preserves an existing manual value', () => {
    const onSelect = vi.fn();
    render(
      <AddressModal
        isOpen
        onClose={vi.fn()}
        onSelect={onSelect}
        currentSelection={{
          address: 'Preserved unit and building details',
          coordinates: null,
          source: 'manual',
        }}
      />,
    );

    const address = screen.getByLabelText(/complete delivery address/i);
    expect(address).toHaveValue('Preserved unit and building details');
    fireEvent.change(address, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Address' }));
    expect(screen.getByText('Complete delivery address is required.')).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
