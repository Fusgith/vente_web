import { vi } from 'vitest';

type Listener = (payload: unknown) => void;

/** A connection opened by the app under test, as `socket.io-client` would give it. */
export class FakeSocket {
  readonly listeners = new Map<string, Set<Listener>>();
  connected = false;

  constructor(readonly options: unknown) {}

  on(event: string, listener: Listener): this {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
    return this;
  }

  off(event: string, listener: Listener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  connect(): this {
    this.connected = true;
    return this;
  }

  disconnect(): this {
    this.connected = false;
    return this;
  }
}

/** Every connection the app opened, and a way to speak as the server to the open ones. */
export const fakeRealtime = {
  sockets: [] as FakeSocket[],
  emit(event: string, payload: unknown): void {
    for (const socket of this.sockets.filter((candidate) => candidate.connected)) {
      for (const listener of socket.listeners.get(event) ?? []) listener(payload);
    }
  },
  reset(): void {
    this.sockets.length = 0;
  },
};

/** Stands for `io()`: no test ever opens a real connection. */
export const fakeIo = vi.fn((options?: unknown) => {
  const socket = new FakeSocket(options);
  fakeRealtime.sockets.push(socket);
  return socket;
});
