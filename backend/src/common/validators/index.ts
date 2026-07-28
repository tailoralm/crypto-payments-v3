const ETHEREUM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidEthereumAddress(address: string): boolean {
  return ETHEREUM_ADDRESS_REGEX.test(address);
}

export function isValidSolanaAddress(address: string): boolean {
  return SOLANA_ADDRESS_REGEX.test(address);
}

export function isValidChainAddress(chain: string, address: string): boolean {
  if (chain === 'ethereum') return isValidEthereumAddress(address);
  if (chain === 'solana') return isValidSolanaAddress(address);
  return false;
}

export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

export function isValidChain(chain: string): boolean {
  return chain === 'ethereum' || chain === 'solana';
}

export function isValidTokenSource(source: string): boolean {
  return source === 'system' || source === 'custom';
}

export function isValidPaymentStatus(status: string): boolean {
  return status === 'PENDING' || status === 'CONCLUDED' || status === 'EXPIRED';
}
