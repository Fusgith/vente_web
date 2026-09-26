import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

import { fakeIo, fakeRealtime } from './fake-socket.js';

// No test opens a real realtime connection: the shell gets a fake one (T-018).
vi.mock('socket.io-client', () => ({ io: fakeIo }));

// Vitest does not expose globals, so Testing Library cannot auto-unmount between tests.
afterEach(() => {
  cleanup();
  fakeRealtime.reset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
