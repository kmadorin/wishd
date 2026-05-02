type Token = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string;
};

const g = globalThis as unknown as { __khToken?: { value: Token | null } };
const slot = (g.__khToken ??= { value: null });

export const khTokenStore = {
  get(): Token | null {
    const t = slot.value;
    if (!t) return null;
    if (Date.now() >= t.expiresAt - 5_000) return null;
    return t;
  },
  // Returns the raw record without expiry check — needed for refresh_token grant.
  getRaw(): Token | null {
    return slot.value;
  },
  set(t: Token): void {
    slot.value = t;
  },
  clear(): void {
    slot.value = null;
  },
};
