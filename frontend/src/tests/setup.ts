import '@testing-library/jest-dom';
import { server } from './mocks/server';
import { beforeAll, afterAll, afterEach } from 'vitest';

// jsdom v23 doesn't initialise localStorage without a real-browser context.
// This minimal mock is enough for the token storage our api.ts interceptor uses.
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

// Start MSW before all tests, reset handlers between tests, stop after suite.
// This mirrors real network behaviour without touching the actual backend.
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
