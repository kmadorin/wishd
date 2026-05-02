type Token = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string;
};

let current: Token | null = null;

export const khTokenStore = {
  get(): Token | null {
    if (!current) return null;
    if (Date.now() >= current.expiresAt - 5_000) return null; // expired or near-expired
    return current;
  },
  // Returns the raw record without expiry check — needed for refresh_token grant.
  getRaw(): Token | null {
    return current;
  },
  set(t: Token): void {
    current = t;
  },
  clear(): void {
    current = null;
  },
};
