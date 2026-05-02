type KhClient = {
  client_id: string;
  client_secret?: string;
  registeredFor: string; // redirectUri this client was registered for
};

let current: KhClient | null = null;

export const khClientStore = {
  get(): KhClient | null {
    return current;
  },
  set(client: KhClient): void {
    current = client;
  },
  clear(): void {
    current = null;
  },
};
