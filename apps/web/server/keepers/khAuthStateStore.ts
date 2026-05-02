type AuthStateEntry = {
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
};

const TTL_MS = 5 * 60 * 1000;

const g = globalThis as unknown as { __khAuthState?: Map<string, AuthStateEntry> };
const store: Map<string, AuthStateEntry> = (g.__khAuthState ??= new Map());

export const khAuthStateStore = {
  put(state: string, data: AuthStateEntry): void {
    store.set(state, data);
  },
  take(state: string): AuthStateEntry | null {
    const entry = store.get(state);
    if (!entry) return null;
    store.delete(state);
    return entry;
  },
  cleanup(): void {
    const now = Date.now();
    for (const [key, val] of store) {
      if (now - val.createdAt > TTL_MS) store.delete(key);
    }
  },
};
