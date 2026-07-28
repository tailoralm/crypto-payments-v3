import axios from 'axios';
import { IChainProvider, TransferEvent } from './types';

export class EthereumProvider implements IChainProvider {
  chainId = 'ethereum';

  async getTransactionsSince(walletAddress: string, since: Date): Promise<TransferEvent[]> {
    const apiKey = process.env.ETHERSCAN_API_KEY || 'YourApiKeyToken';
    const sinceUnix = Math.floor(since.getTime() / 1000);

    const { data } = await axios.get('https://api.etherscan.io/api', {
      params: {
        module: 'account',
        action: 'tokentx',
        address: walletAddress,
        startblock: 0,
        endblock: 99999999,
        sort: 'asc',
        apikey: apiKey,
      },
    });

    if (data.status !== '1') {
      return [];
    }

    return data.result
      .filter((tx: { timeStamp: string }) => Number(tx.timeStamp) >= sinceUnix)
      .filter((tx: { to: string }) => tx.to.toLowerCase() === walletAddress.toLowerCase())
      .map((tx: { hash: string; from: string; to: string; value: string; contractAddress: string; timeStamp: string }) => ({
        txHash: tx.hash,
        from: tx.from,
        to: tx.to,
        rawAmount: tx.value,
        contractAddress: tx.contractAddress,
        timestamp: Number(tx.timeStamp),
      }));
  }
}
