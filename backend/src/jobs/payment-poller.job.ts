import cron from 'node-cron';
import db from '../db/knex';
import { getProvider } from '../modules/blockchain';
import { convertRawAmount } from '../common/utils/math';
import { evaluateMatch } from '../common/utils/matching';
import { decrypt } from '../common/encryption';

async function pollWalletTransactions(): Promise<void> {
  const wallets = await db('wallets')
    .whereIn('id', function () {
      this.select('wallet_id')
        .from('payment_intentions')
        .where('status', 'PENDING');
    });

  for (const wallet of wallets) {
    const user = await db('users').where({ id: wallet.user_id }).first();
    if (!user) continue;

    const provider = getProvider(wallet.chain);
    if (!provider) continue;

    const since = wallet.last_fetched_at || new Date(0);

    try {
      let apiKey: string | undefined;
      if (wallet.chain === 'ethereum' && user.etherscan_api_key) {
        apiKey = decrypt(user.etherscan_api_key);
        process.env.ETHERSCAN_API_KEY = apiKey;
      } else if (wallet.chain === 'solana' && user.solscan_api_key) {
        apiKey = decrypt(user.solscan_api_key);
        process.env.SOLSCAN_API_KEY = apiKey;
      }

      const transactions = await provider.getTransactionsSince(wallet.address, since);

      const pendingIntentions = await db('payment_intentions')
        .where({ wallet_id: wallet.id, status: 'PENDING' })
        .orderBy('created_at', 'asc');

      const usedTxHashes = new Set<string>();

      for (const intention of pendingIntentions) {
        let tokenDecimals: number | null = null;
        let contractAddress: string | null = null;

        if (intention.token_source === 'system') {
          const token = await db('tokens').where({ id: intention.token_id }).first();
          tokenDecimals = token?.decimals ?? null;
          contractAddress = token?.contract_address ?? null;
        } else {
          const contract = await db('custom_contracts').where({ id: intention.token_id }).first();
          tokenDecimals = contract?.decimals ?? null;
          contractAddress = contract?.contract_address ?? null;
        }

        if (tokenDecimals === null || contractAddress === null) continue;

        const contractAddressLower = contractAddress.toLowerCase();

        for (const tx of transactions) {
          if (usedTxHashes.has(tx.txHash)) continue;

          if (tx.contractAddress.toLowerCase() !== contractAddressLower) continue;

          const transferredValue = convertRawAmount(tx.rawAmount, tokenDecimals);
          const expectedValue = Number(intention.value);
          const expectedFromAddress = intention.expected_from_address;

          const result = evaluateMatch({
            expectedValue,
            transferredValue,
            expectedFromAddress,
            transferredFromAddress: tx.from,
          });

          if (result.overallMatch) {
            usedTxHashes.add(tx.txHash);
            await db('payment_intentions')
              .where({ id: intention.id })
              .update({
                status: 'CONCLUDED',
                concluded_tx_hash: tx.txHash,
                concluded_from_address: tx.from,
                concluded_at: db.fn.now(),
              });
            break;
          }
        }
      }

      await db('payment_intentions')
        .where({ wallet_id: wallet.id, status: 'PENDING' })
        .andWhere('expires_at', '<', db.fn.now())
        .update({ status: 'EXPIRED' });

      await db('wallets').where({ id: wallet.id }).update({ last_fetched_at: db.fn.now() });
    } catch (error) {
      console.error(`Failed to poll wallet ${wallet.id} (${wallet.chain}:${wallet.address}):`, error);
    }
  }
}

export function startPaymentPoller(): void {
  cron.schedule('*/15 * * * *', () => {
    pollWalletTransactions().catch((err) => {
      console.error('Payment poller error:', err);
    });
  });
  console.log('Payment poller started (every 15 minutes)');
}
