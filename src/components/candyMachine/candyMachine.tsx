import React, { useEffect, useState } from 'react';
import { Wallet } from '@project-serum/anchor';
import { CandyMachineState, useCandyMachine } from '../../hooks/useCandyMachine';
import { Button } from '../buttons/button';

type Props = {
  walletAddress: Wallet;
};

export const CandyMachine: React.FunctionComponent<Props> = ({ walletAddress }) => {
  const { mintToken, getCandyMachineState } = useCandyMachine(walletAddress);

  const [machineStats, setMachineStats] = useState<CandyMachineState | null>(null);

  useEffect(() => {
    getCandyMachineState().then(setMachineStats);
  }, []);

  return (
    <div className="flex flex-col justify-center">
      {machineStats && (
        <div className="py-4">
          <p>{`Drop Date: ${machineStats.goLiveDateTimeString}`}</p>
          <p>{`Items Minted: ${machineStats.itemsRedeemed} / ${machineStats.itemsAvailable}`}</p>
        </div>
      )}

      <div className="flex justify-center">
        <Button onClick={mintToken}>Mint NFT</Button>
      </div>
    </div>
  );
};
