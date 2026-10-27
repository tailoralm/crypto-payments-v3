import { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  await knex('tokens')
    .insert([
      {
        chain: 'ethereum',
        symbol: 'USDT',
        contract_address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        decimals: 6,
        is_system_default: true,
      },
      {
        chain: 'solana',
        symbol: 'USDT',
        contract_address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        decimals: 6,
        is_system_default: true,
      },
    ])
    .onConflict(['chain', 'symbol'])
    .ignore();
}
