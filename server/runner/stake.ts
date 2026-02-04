export type StakeStatus = 'LOCKED' | 'RELEASED' | 'SLASHED';

export interface StakeLock {
  id: string;
  job_id: string;
  verifier_id: string;
  account_id: string;
  balance_cc: number;
  status: StakeStatus;
  created_at: string;
  updated_at: string;
}
