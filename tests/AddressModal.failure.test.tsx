import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AddressModal from '../components/AddressModal';
import { loadGoogleMapsLibraries } from '../services/googleMaps';

vi.mock('../services/googleMaps', () => ({
  googleMapsApiKey: 'test-key',
  loadGoogleMapsLibraries: vi.fn(),
}));

describe('AddressModal map failure recovery', () => {
  beforeEach(() => {
    vi.mocked(loadGoogleMapsLibraries)
      .mockReset()
      .mockRejectedValue(new Error('billing disabled'));
  });

  it('clears the loading state and offers a manual path after an API failure', async () => {
    render(
      <AddressModal
        isOpen
        onClose={vi.fn()}
        onSelect={vi.fn()}
        currentSelection={null}
      />,
    );

    expect(await screen.findByText(/map could not load/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enter address manually' }));
    expect(screen.getByText('Manual address mode')).toBeInTheDocument();
    expect(screen.getByLabelText(/complete delivery address/i)).toBeVisible();
  });

  it('retries after clearing a stale API error', async () => {
    render(
      <AddressModal
        isOpen
        onClose={vi.fn()}
        onSelect={vi.fn()}
        currentSelection={null}
      />,
    );

    expect(await screen.findByText(/map could not load/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry map' }));
    await screen.findByText(/map could not load/i);
    expect(vi.mocked(loadGoogleMapsLibraries)).toHaveBeenCalledTimes(2);
  });
});
