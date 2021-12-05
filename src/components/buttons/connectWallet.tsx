import { MouseEventHandler } from 'react';
import { Button } from './button';

type Props = {
  onClick: MouseEventHandler<HTMLButtonElement>;
};

export const ConnectWallet: React.FunctionComponent<Props> = ({ onClick }) => {
  return <Button onClick={onClick}>Connect to Wallet</Button>;
};
