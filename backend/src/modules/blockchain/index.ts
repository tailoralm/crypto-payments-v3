import { registerProvider } from './ChainRegistry';
import { EthereumProvider } from './EthereumProvider';
import { SolanaProvider } from './SolanaProvider';

registerProvider(new EthereumProvider());
registerProvider(new SolanaProvider());

export { IChainProvider, TransferEvent } from './types';
export { getProvider, registerProvider } from './ChainRegistry';
