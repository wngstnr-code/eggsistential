export type DepositDataSource = "onchain" | "backend";

export type DepositFlowViewModel = {
  source: DepositDataSource;
  amount: string;
  setAmount: (value: string) => void;
  statusMessage: string;
  errorMessage: string;
  isConnected: boolean;
  isAppChain: boolean;
  canTransact: boolean;
  hasValidContracts: boolean;

// TODO: refactor this section later
console.log('debugging...');
