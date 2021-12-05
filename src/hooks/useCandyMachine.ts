import { Connection, PublicKey } from '@solana/web3.js';
import { Accounts, Program, Wallet, web3 } from '@project-serum/anchor';
import { MintLayout, TOKEN_PROGRAM_ID, Token } from '@solana/spl-token';
import { programs } from '@metaplex/js';
import {
  candyMachineProgram,
  TOKEN_METADATA_PROGRAM_ID,
  SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
} from '../services/candyMachine';
import { MetadataData } from '@metaplex/js/lib/programs/metadata';
import { IdlAccountItem } from '@project-serum/anchor/dist/cjs/idl';
import { getProvider } from '../services/solana';
const {
  metadata: { Metadata, MetadataProgram },
} = programs;

const config = new web3.PublicKey(process.env.NEXT_PUBLIC_CANDY_MACHINE_CONFIG || '');

const { SystemProgram } = web3;

const MAX_NAME_LENGTH = 32;
const MAX_URI_LENGTH = 200;
const MAX_SYMBOL_LENGTH = 10;
const MAX_CREATOR_LEN = 32 + 1 + 1;

export type CandyMachineState = {
  goLiveData: number;
  goLiveDateTimeString: string;
  itemsAvailable: number;
  itemsRedeemed: number;
  itemsRemaining: number;
};

type CandyHook = {
  (walletAddress: Wallet): {
    mintToken: () => Promise<void>;
    getCandyMachineState: () => Promise<CandyMachineState | null>;
  };
};

export const useCandyMachine: CandyHook = (walletAddress) => {
  const fetchHashTable = async (hash: string, metadataEnabled: boolean): Promise<(string | MetadataData)[]> => {
    const connection = new web3.Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_HOST || '');

    const metadataAccounts = await MetadataProgram.getProgramAccounts(connection, {
      filters: [
        {
          memcmp: {
            offset:
              1 +
              32 +
              32 +
              4 +
              MAX_NAME_LENGTH +
              4 +
              MAX_URI_LENGTH +
              4 +
              MAX_SYMBOL_LENGTH +
              2 +
              1 +
              4 +
              0 * MAX_CREATOR_LEN,
            bytes: hash,
          },
        },
      ],
    });

    const mintHashes: (string | MetadataData)[] = [];

    for (let index = 0; index < metadataAccounts.length; index++) {
      const account = metadataAccounts[index];
      const accountInfo = await connection.getParsedAccountInfo(account.pubkey);

      if (accountInfo.value) {
        const metadata = new Metadata(hash.toString(), accountInfo.value as web3.AccountInfo<Buffer>);
        mintHashes.push(metadataEnabled ? metadata.data : metadata.data.mint);
      }
    }

    return mintHashes;
  };

  const getMetadata = async (mint: PublicKey): Promise<PublicKey> => {
    return (
      await PublicKey.findProgramAddress(
        [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
        TOKEN_METADATA_PROGRAM_ID
      )
    )[0];
  };

  const getMasterEdition = async (mint: PublicKey): Promise<PublicKey> => {
    return (
      await PublicKey.findProgramAddress(
        [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer(), Buffer.from('edition')],
        TOKEN_METADATA_PROGRAM_ID
      )
    )[0];
  };

  const getTokenWallet = async (wallet: PublicKey, mint: PublicKey): Promise<PublicKey> => {
    return (
      await web3.PublicKey.findProgramAddress(
        [wallet.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
        SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
      )
    )[0];
  };

  const mintToken = async (): Promise<void> => {
    try {
      const mint = web3.Keypair.generate();
      const token = await getTokenWallet(walletAddress.publicKey, mint.publicKey);
      const metadata = await getMetadata(mint.publicKey);
      const masterEdition = await getMasterEdition(mint.publicKey);
      const rpcHost = process.env.NEXT_PUBLIC_SOLANA_RPC_HOST || '';
      const connection = new Connection(rpcHost);
      const rent = await connection.getMinimumBalanceForRentExemption(MintLayout.span);

      const accounts: Accounts<IdlAccountItem> = {
        config,
        candyMachine: process.env.NEXT_PUBLIC_CANDY_MACHINE_ID || '',
        payer: walletAddress.publicKey,
        wallet: process.env.NEXT_PUBLIC_TREASURY_ADDRESS || '',
        mint: mint.publicKey,
        metadata,
        masterEdition,
        mintAuthority: walletAddress.publicKey,
        updateAuthority: walletAddress.publicKey,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
        clock: web3.SYSVAR_CLOCK_PUBKEY,
      };

      const signers = [mint];
      const instructions = [
        web3.SystemProgram.createAccount({
          fromPubkey: walletAddress.publicKey,
          newAccountPubkey: mint.publicKey,
          space: MintLayout.span,
          lamports: rent,
          programId: TOKEN_PROGRAM_ID,
        }),
        Token.createInitMintInstruction(
          TOKEN_PROGRAM_ID,
          mint.publicKey,
          0,
          walletAddress.publicKey,
          walletAddress.publicKey
        ),
        createAssociatedTokenAccountInstruction(
          token,
          walletAddress.publicKey,
          walletAddress.publicKey,
          mint.publicKey
        ),
        Token.createMintToInstruction(TOKEN_PROGRAM_ID, mint.publicKey, token, walletAddress.publicKey, [], 1),
      ];

      const provider = getProvider();
      const idl = await Program.fetchIdl(candyMachineProgram, provider);

      if (!idl) {
        throw new Error('Idl doesnt exist!');
      }
      const program = new Program(idl, candyMachineProgram, provider);

      console.log('txn1:');

      const txn = await program.rpc.mintNft({
        accounts,
        signers,
        instructions,
      });

      console.log('txn:', txn);

      // Setup listener
      connection.onSignatureWithOptions(
        txn,
        async (notification) => {
          if (notification.type === 'status') {
            console.log('Receievd status event');

            const { result } = notification;
            if (!result.err) {
              console.log('NFT Minted!');
            }
          }
        },
        { commitment: 'processed' }
      );
    } catch (err) {
      // eslint-disable-next-line
      const error = err as any;

      console.log('errr', error.stack);

      let message = error.msg || 'Minting failed! Please try again!';

      if (!error.msg) {
        if (error.message.indexOf('0x138')) {
        } else if (error.message.indexOf('0x137')) {
          message = `SOLD OUT!`;
        } else if (error.message.indexOf('0x135')) {
          message = `Insufficient funds to mint. Please fund your wallet.`;
        }
      } else {
        if (error.code === 311) {
          message = `SOLD OUT!`;
        } else if (error.code === 312) {
          message = `Minting period hasn't started yet.`;
        }
      }

      console.warn(message);
    }
  };

  const createAssociatedTokenAccountInstruction = (
    associatedTokenAddress: PublicKey,
    payer: PublicKey,
    walletAddress: PublicKey,
    splTokenMintAddress: PublicKey
  ): web3.TransactionInstruction => {
    const keys = [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedTokenAddress, isSigner: false, isWritable: true },
      { pubkey: walletAddress, isSigner: false, isWritable: false },
      { pubkey: splTokenMintAddress, isSigner: false, isWritable: false },
      {
        pubkey: web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      {
        pubkey: web3.SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
    ];

    return new web3.TransactionInstruction({
      keys,
      programId: SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
      data: Buffer.from([]),
    });
  };

  // Declare getCandyMachineState as an async method
  const getCandyMachineState = async (): Promise<CandyMachineState | null> => {
    const provider = getProvider();

    // Get metadata about your deployed candy machine program
    const idl = await Program.fetchIdl(candyMachineProgram, provider);

    if (!idl) {
      return null;
    }

    // Create a program that you can call
    const program = new Program(idl, candyMachineProgram, provider);

    // Fetch the metadata from your candy machine
    const candyMachine = await program.account.candyMachine.fetch(process.env.NEXT_PUBLIC_CANDY_MACHINE_ID || '');

    // Parse out all our metadata and log it out
    const itemsAvailable = candyMachine.data.itemsAvailable.toNumber();
    const itemsRedeemed = candyMachine.itemsRedeemed.toNumber();
    const itemsRemaining = itemsAvailable - itemsRedeemed;
    const goLiveData = candyMachine.data.goLiveDate.toNumber();

    // We will be using this later in our UI so let's generate this now
    const goLiveDateTimeString = `${new Date(goLiveData * 1000).toUTCString()}`;

    console.log({
      itemsAvailable,
      itemsRedeemed,
      itemsRemaining,
      goLiveData,
      goLiveDateTimeString,
    });

    return {
      itemsAvailable,
      itemsRedeemed,
      itemsRemaining,
      goLiveData,
      goLiveDateTimeString,
    };
  };

  return {
    mintToken,
    getCandyMachineState,
  };
};
