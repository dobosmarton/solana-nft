import { Connection, Commitment } from '@solana/web3.js';
import { Provider } from '@project-serum/anchor';

type Opts = {
  preflightCommitment: Commitment;
};

// Controls how we want to acknowledge when a transaction is "done".
const opts: Opts = {
  preflightCommitment: 'processed',
};

export type ExtendedWindow = Window & typeof globalThis & { solana: any };

export const getProvider = (): Provider => {
  const rpcHost = process.env.NEXT_PUBLIC_SOLANA_RPC_HOST || '';

  const connection = new Connection(rpcHost);
  const provider = new Provider(connection, (window as ExtendedWindow).solana, {
    commitment: opts.preflightCommitment,
  });
  return provider;
};
