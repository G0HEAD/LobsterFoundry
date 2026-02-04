export type EscrowStatus = 'OPEN' | 'CLOSED';

export interface EscrowAccount {
  id: string;
  account_id: string;
  sponsor_id: string;
  balance_cc: number;
  status: EscrowStatus;
  created_at: string;
  updated_at: string;
}
