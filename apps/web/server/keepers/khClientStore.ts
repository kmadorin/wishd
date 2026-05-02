type KhClient = {
  client_id: string;
  client_secret?: string;
  registeredFor: string; // redirectUri this client was registered for
};

const g = globalThis as unknown as { __khClient?: { value: KhClient | null } };
const slot = (g.__khClient ??= { value: null });

export const khClientStore = {
  get(): KhClient | null {
    return slot.value;
  },
  set(client: KhClient): void {
    slot.value = client;
  },
  clear(): void {
    slot.value = null;
  },
};
