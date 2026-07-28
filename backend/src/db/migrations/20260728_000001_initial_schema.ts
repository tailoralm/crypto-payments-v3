import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('email', 255).unique().notNullable();
    table.string('password_hash', 255).notNullable();
    table.text('etherscan_api_key').nullable();
    table.text('solscan_api_key').nullable();
    table.boolean('rate_limit_enabled').notNullable().defaultTo(false);
    table.integer('rate_limit_max_requests').nullable();
    table.integer('rate_limit_window_minutes').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('chain', 50).notNullable();
    table.string('symbol', 50).notNullable();
    table.string('contract_address', 255).notNullable();
    table.integer('decimals').notNullable();
    table.boolean('is_system_default').notNullable().defaultTo(true);
  });

  await knex.schema.createTable('wallets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('chain', 50).notNullable();
    table.string('address', 255).notNullable();
    table.text('description').nullable();
    table.boolean('is_default').notNullable().defaultTo(false);
    table.timestamp('last_fetched_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index('user_id', 'idx_wallets_user_id');
  });

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_user_default
    ON wallets (user_id) WHERE is_default = true
  `);

  await knex.schema.createTable('custom_contracts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('chain', 50).notNullable();
    table.string('contract_address', 255).notNullable();
    table.string('symbol', 50).notNullable();
    table.integer('decimals').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index('user_id', 'idx_custom_contracts_user_id');
  });

  await knex.schema.createTable('payment_intentions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('wallet_id').notNullable().references('id').inTable('wallets').onDelete('CASCADE');
    table.text('description').notNullable();
    table.decimal('value', 20, 6).notNullable();
    table.string('token_source', 20).notNullable();
    table.uuid('token_id').notNullable();
    table.integer('expiration_hours').notNullable().defaultTo(24);
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.string('expected_from_address', 255).nullable();
    table.string('status', 20).notNullable().defaultTo('PENDING');
    table.string('concluded_tx_hash', 255).nullable();
    table.string('concluded_from_address', 255).nullable();
    table.timestamp('concluded_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index('user_id', 'idx_payment_intentions_user_id');
    table.index('wallet_id', 'idx_payment_intentions_wallet_id');
    table.index('status', 'idx_payment_intentions_status');
    table.index(['user_id', 'status'], 'idx_payment_intentions_user_status');
  });

  await knex.schema.createTable('api_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('token_hash', 255).notNullable();
    table.string('label', 255).nullable();
    table.timestamp('last_used_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index('user_id', 'idx_api_tokens_user_id');
    table.index('token_hash', 'idx_api_tokens_hash');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('api_tokens');
  await knex.schema.dropTableIfExists('payment_intentions');
  await knex.schema.dropTableIfExists('custom_contracts');
  await knex.schema.dropTableIfExists('wallets');
  await knex.schema.dropTableIfExists('tokens');
  await knex.schema.dropTableIfExists('users');
}
