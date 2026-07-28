import { IChainProvider } from './types';

const providers = new Map<string, IChainProvider>();

export function registerProvider(provider: IChainProvider): void {
  providers.set(provider.chainId, provider);
}

export function getProvider(chainId: string): IChainProvider | undefined {
  return providers.get(chainId);
}
