import axios from 'axios';
import { IChainProvider, TransferEvent } from './types';

export class SolanaProvider implements IChainProvider {
  chainId = 'solana';

  async getTransactionsSince(walletAddress: string, since: Date): Promise<TransferEvent[]> {
    const apiKey = process.env.SOLSCAN_API_KEY || '';
    const sinceUnix = Math.floor(since.getTime() / 1000);

    try {
      const { data } = await axios.get(`https://pro-api.solscan.io/v1/account/tokens`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        params: {
          account: walletAddress,
          type: 'token',
        },
      });

      if (!data || !data.data) {
        return [];
      }

      return data.data
        .filter((tx: { blockTime: number }) => tx.blockTime >= sinceUnix)
        .map((tx: { txHash: string; fromAddress: string; toAddress: string; amount: string; tokenAddress: string; blockTime: number }) => ({
          txHash: tx.txHash,
          from: tx.fromAddress,
          to: tx.toAddress,
          rawAmount: tx.amount,
          contractAddress: tx.tokenAddress,
          timestamp: tx.blockTime,
        }));
    } catch {
      return [];
    }
  }
}
