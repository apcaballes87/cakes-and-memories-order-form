import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

Object.defineProperty(Element.prototype, 'scrollIntoView', {
  configurable: true,
  value: vi.fn(),
});

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

Object.defineProperty(URL, 'createObjectURL', {
  configurable: true,
  value: vi.fn(() => 'blob:test-preview'),
});

Object.defineProperty(URL, 'revokeObjectURL', {
  configurable: true,
  value: vi.fn(),
});
