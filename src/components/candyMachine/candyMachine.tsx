import React, { useEffect, useState } from 'react';
import { Wallet } from '@project-serum/anchor';
import { CandyMachineState, useCandyMachine } from '../../hooks/useCandyMachine';
import { Button } from '../buttons/button';
import { MetadataData } from '@metaplex/js/lib/programs/metadata';
import { CountdownTimer } from '../timer/countdownTimer';

type Props = {
  walletAddress: Wallet;
};

export const CandyMachine: React.FunctionComponent<Props> = ({ walletAddress }) => {
  const { isMinting, mintToken, fetchHashTable, getCandyMachineState } = useCandyMachine(walletAddress);

  const [machineStats, setMachineStats] = useState<CandyMachineState | null>(null);
  const [mints, setMints] = useState<string[]>([]);

  // Loading states
  const [isLoadingMints, setIsLoadingMints] = useState(false);

  useEffect(() => {
    if (!isMinting) {
      getCandyMachineState().then(setMachineStats);
    }
  }, [isMinting]);

  useEffect(() => {
    const getStateAndMints = async () => {
      const state = await getCandyMachineState();

      setMachineStats(state);

      setIsLoadingMints(true);

      const data = await fetchHashTable(process.env.NEXT_PUBLIC_CANDY_MACHINE_ID || '', true);

      if (data.length !== 0) {
        const filtered = data.filter((item): item is MetadataData => !!(item as MetadataData).data);

        const _mints = await Promise.all(
          filtered.map<Promise<string>>(async (mint) => {
            const response = await fetch(mint.data.uri);
            const parse = await response.json();
            console.log('Past Minted NFT', mint);

            return parse.image;
          })
        );

        const filteredMints = _mints.filter((_mint) => !mints.find((mint) => mint === _mint));

        setIsLoadingMints(false);

        setMints((prevState) => [...prevState, ...filteredMints]);
      }
    };

    getStateAndMints();
  }, []);

  // Create render function
  const renderDropTimer = () => {
    if (!machineStats) {
      return <p>{`Connect your Solana wallet!`}</p>;
    }
    // Get the current date and dropDate in a JavaScript Date object
    const currentDate = new Date();
    const dropDate = new Date(machineStats.goLiveData * 1000);

    // If currentDate is before dropDate, render our Countdown component
    if (currentDate < dropDate) {
      console.log('Before drop date!');
      // Don't forget to pass over your dropDate!
      return <CountdownTimer dropDate={dropDate} />;
    }

    // Else let's just return the current drop date
    return <p>{`Drop Date: ${machineStats.goLiveDateTimeString}`}</p>;
  };

  return (
    <div className="flex flex-col justify-center">
      {machineStats && (
        <div className="py-4">
          {renderDropTimer()}
          <p>{`Items Minted: ${machineStats.itemsRedeemed} / ${machineStats.itemsAvailable}`}</p>
        </div>
      )}
      {machineStats?.itemsRedeemed === machineStats?.itemsAvailable ? (
        <p className="sub-text">Sold Out 🙊</p>
      ) : (
        <div className="flex justify-center">
          <Button disabled={isMinting} onClick={mintToken}>
            Mint NFT
          </Button>
        </div>
      )}

      {isLoadingMints && <p>LOADING MINTS...</p>}
      {mints.length > 0 && (
        <div className="gif-container">
          <p className="sub-text">Minted Items ✨</p>
          <div className="gif-grid">
            {mints.map((mint) => (
              <div className="gif-item" key={mint}>
                <img src={mint} alt={`Minted NFT ${mint}`} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
