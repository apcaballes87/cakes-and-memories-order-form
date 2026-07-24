import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AddressModal from '../components/AddressModal';
import { loadGoogleMapsLibraries } from '../services/googleMaps';

vi.mock('../services/googleMaps', () => ({
  googleMapsApiKey: 'test-key',
  loadGoogleMapsLibraries: vi.fn(),
}));

describe('AddressModal map failure', () => {
  beforeEach(() => {
    vi.mocked(loadGoogleMapsLibraries)
      .mockReset()
      .mockRejectedValue(new Error('billing disabled'));
  });

  it('clears the loading state without showing a manual-mode escape action', async () => {
    render(
      <AddressModal
        isOpen
        onClose={vi.fn()}
        onSelect={vi.fn()}
        currentSelection={null}
      />,
    );

    expect(await screen.findByText(/map could not load/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry map/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enter address manually/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue without a map pin/i })).not.toBeInTheDocument();
  });
});
