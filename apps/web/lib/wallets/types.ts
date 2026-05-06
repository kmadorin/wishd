export type EvmAccount = {
  chainType: "evm";
  address: `0x${string}`;
  chainId: number;
  connectorName: string;
};

export type SvmAccount = {
  chainType: "svm";
  address: string;
  connectorName: string;
};

export type WishdAccount = EvmAccount | SvmAccount;
