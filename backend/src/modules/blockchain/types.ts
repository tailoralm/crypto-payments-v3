export interface TransferEvent {
  txHash: string;
  from: string;
  to: string;
  rawAmount: string;
  contractAddress: string;
  timestamp: number;
}

export interface IChainProvider {
  chainId: string;
  getTransactionsSince(walletAddress: string, since: Date): Promise<TransferEvent[]>;
}
