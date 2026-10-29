# Provider guide

Checked against official documentation on 2026-10-28. Adapters now implement the integration behavior below; live credentials and real transfers have not been used to validate access. This is not a guarantee of future pricing. No API credentials or live transfer requests were used. The owner chose the named explorer providers even where paid access is needed; free monitoring on all chains is not a release promise.

## Explorer mapping and access

| Chain | Target API | Credential | Access conclusion |
| --- | --- | --- | --- |
| Ethereum, chain ID 1 | Etherscan V2 `https://api.etherscan.io/v2/api`, `module=account`, `action=tokentx`, `chainid=1` | Etherscan API key in `apikey` | Free tier is restricted to selected chains; confirm this chain/endpoint with the operator's plan before enabling monitoring. |
| BNB Smart Chain, chain ID 56 | Same Etherscan V2 endpoint with `chainid=56`; BscScan remains the explorer link destination | Etherscan V2 key, potentially shared with Ethereum | Do not assume legacy BscScan keys or free transaction monitoring work. Chain-specific entitlement must be checked. |
| Solana mainnet | Solscan V2 `https://pro-api.solscan.io/v2.0/account/transfer` | Solscan API key in `token` header | Transfer history is a Pro API capability; a free monitoring entitlement was not established. |

Etherscan's [introduction](https://docs.etherscan.io/introduction) describes one key across its supported EVM chains. Its [transfer reference](https://docs.etherscan.io/api-reference/endpoint/tokentx) documents V2 token-transfer requests; [supported chains](https://docs.etherscan.io/supported-chains) determines plan availability. The rendered chain table was not available in this audit's extracted page, so Ethereum/BSC free-tier entitlement remains unverified rather than inferred from chain support. Its [rate limits](https://docs.etherscan.io/rate-limits) list Free at 3 requests/second and 100,000/day on selected chains. Limits and endpoint result caps must be rechecked at release.

Solscan's [overview and plans](https://pro-api.solscan.io/pro-api-docs/v2.0/docs) list Lite at $49/month, 20 million monthly computing units and 1,000 requests/minute, with each endpoint call currently costing 100 units. Authentication uses the `token` header; coverage is mainnet-only. The [account-transfer reference](https://pro-api.solscan.io/pro-api-docs/v2.0/reference/v2-account-transfer) provides incoming-flow records, atomic amount, token address/decimals, timestamp, and pagination. Public network analytics endpoints do not establish free wallet-transfer monitoring.

## Curated asset identities

| Network | Asset label for billing | Contract/mint | Decimals |
| --- | --- | --- | --- |
| Ethereum | USDT (Ethereum) | `0xdAC17F958D2ee523a2206206994597C13D831ec7` | 6 |
| Solana | USDT (Solana) | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` | 6 |
| BNB Smart Chain | USDT / Binance-Peg BSC-USD (BNB Smart Chain) | `0x55d398326f99059fF775485246999027B3197955` | 18 |

Ethereum/Solana identities are listed by [Tether's integration guide](https://tether.to/en/supported-protocols/). The BSC contract is identified by its [BscScan record](https://bscscan.com/token/0x55d398326f99059ff775485246999027b3197955), which labels it Binance-Peg BSC-USD; its verified contract uses 18 decimals. Do not describe the BSC representation as directly issued/redeemable by Tether based on the USDT symbol. Revalidate metadata before seeding or releasing. Match contract/mint plus chain, never a user-supplied symbol alone.

## Implemented adapter behavior

- Receive credentials explicitly; do not mutate process-global environment variables for each wallet. Keep credentials server-side and sanitize request/error logs.
- Normalize incoming transfers into chain, transaction ID, event/instruction identity, sender, recipient, asset address, atomic amount string, block/slot, chain timestamp, and success/finality evidence.
- EVM adapter must paginate token transfers and use bounded block ranges. Solana adapter must handle wallet ownership/token-account addresses and incoming direction explicitly, with case-sensitive identifiers.
- Distinguish no transfers from invalid credentials, denied plans, throttling, timeouts, malformed responses, and provider outages. Persist failure state; do not advance successful checkpoints on failure.
- Persist scan health/checkpoints and replay the complete active payment window for indexing lag, with at most 100 pages per scan. EVM identity comes from successful receipt log indices with 12 confirmations. Solscan transaction detail must show status 1; multi-transfer rows without instruction identity stop the scan safely. Solana has no independent finality proof. Single-transfer and instruction-index identity changes are rejected to prevent replay.
- Throttle shared Etherscan credentials across Ethereum and BSC together. Estimate load as active wallets × 96 polling cycles/day × pages per scan, plus retries and catch-up. Fifteen-minute scheduling alone does not guarantee quota compliance.

## Gates before enabling production monitoring

Record a successful authenticated transfer-history read for each enabled chain, including pagination, empty results, credential denial, and throttling behavior. Establish how each adapter proves transaction success and handles confirmation/finality evidence; document any reliance on explorer indexing. No finality guarantee is verified in this audit. If the chosen API lacks required evidence or event identity, resolve that capability before marking the adapter release-ready.

No automatic RPC/provider substitution is in the agreed release scope. Unsupported plan access should produce an actionable monitoring warning; it must not silently become a successful empty scan.
