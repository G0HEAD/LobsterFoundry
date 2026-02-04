import {
  Artifact,
  FundingConfig,
  QuestContractPayload,
  StampDecision,
  StampRole,
  VerificationPlan,
  WorkSubmissionPayload,
} from '../../shared/schema';

export interface QuestContractRecord {
  id: string;
  proposer_id: string;
  created_at: string;
  funding: FundingConfig;
  verification_plan: VerificationPlan;
  payload: QuestContractPayload;
}

export type SubmissionStatus = 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'PENDING_AUDIT';

export type SanctionStatus = 'APPLIED' | 'UNDER_APPEAL' | 'RESOLVED';

export interface SanctionRecord {
  id: string;
  created_at: string;
  proposer_id: string;
  target_type: 'STAKE' | 'SUBMISSION' | 'ACCOUNT';
  target_id: string;
  action: 'SLASH' | 'REJECT' | 'FLAG';
  reason: string;
  amount_cc?: number;
  recipient_id?: string;
  status: SanctionStatus;
}

export interface AppealRecord {
  id: string;
  sanction_id: string;
  appellant_id: string;
  reason: string;
  created_at: string;
  status: 'PENDING' | 'RESOLVED' | 'DENIED';
}

export interface WorkSubmissionRecord {
  id: string;
  contract_id: string;
  proposer_id: string;
  created_at: string;
  payload: WorkSubmissionPayload;
  status: SubmissionStatus;
  stamp_ids: string[];
  minted: boolean;
}

export interface VerificationStampRecord {
  id: string;
  job_id: string;
  submission_id: string;
  verifier_id: string;
  role: StampRole;
  decision: StampDecision;
  notes: string;
  artifacts?: Artifact[];
  stake_cc_locked: number;
  created_at: string;
}
