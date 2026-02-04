/**
 * LobsterFoundry — Core Type Definitions
 * 
 * These types define the fundamental data structures for:
 * - Tokens (proof-bound materials and items)
 * - Blueprints (proposals for any change)
 * - Jobs (work and verification quests)
 * - Accounts (settlers and their licenses)
 * - Ledger (immutable transaction history)
 */

// =============================================================================
// ENUMS
// =============================================================================

export enum TokenType {
  ORE = 'ORE',
  IRON = 'IRON', 
  STEEL = 'STEEL',
  ITEM = 'ITEM',
  SEAL_BRONZE = 'SEAL_BRONZE',
  SEAL_SILVER = 'SEAL_SILVER',
  SEAL_GOLD = 'SEAL_GOLD',
}

export enum TokenStatus {
  ACTIVE = 'ACTIVE',
  SPENT = 'SPENT',
  BURNED = 'BURNED',
  VOID = 'VOID',
}

export enum BlueprintKind {
  QUEST_CONTRACT = 'QUEST_CONTRACT',
  WORK_SUBMISSION = 'WORK_SUBMISSION',
  VERIFICATION_JOB = 'VERIFICATION_JOB',
  VERIFICATION_STAMP = 'VERIFICATION_STAMP',
  MINT_EVENT = 'MINT_EVENT',
  CRAFT = 'CRAFT',
  LICENSE_APPLICATION = 'LICENSE_APPLICATION',
  POLICY_UPDATE = 'POLICY_UPDATE',
  WORLD_CHANGE = 'WORLD_CHANGE',
  SANCTION = 'SANCTION',
  APPEAL = 'APPEAL',
}

export enum BlueprintClass {
  A_WORLD_CONTENT = 'A_WORLD_CONTENT',
  B_WORLD_MECHANICS = 'B_WORLD_MECHANICS',
  C_RUNNER_POLICY = 'C_RUNNER_POLICY',
  D_RUNNER_KERNEL = 'D_RUNNER_KERNEL',
}

export enum School {
  MINING = 'MINING',
  SMITHING = 'SMITHING',
  COOKING = 'COOKING',
  CARTOGRAPHY = 'CARTOGRAPHY',
  ARCHIVIST = 'ARCHIVIST',
  VERIFICATION = 'VERIFICATION',
  MODERATION = 'MODERATION',
}

export enum LicenseTier {
  VISITOR = 'VISITOR',
  CITIZEN = 'CITIZEN',
  APPRENTICE = 'APPRENTICE',
  JOURNEYMAN = 'JOURNEYMAN',
  MASTER = 'MASTER',
  ACCREDITED = 'ACCREDITED',
}

export enum StampRole {
  QUALITY = 'QUALITY',
  EVIDENCE = 'EVIDENCE',
  SAFETY = 'SAFETY',
  AUDIT = 'AUDIT',
}

export enum StampDecision {
  PASS = 'PASS',
  FAIL = 'FAIL',
  ABSTAIN = 'ABSTAIN',
}

export enum SanctionSeverity {
  WARN = 'WARN',
  RESTRICT = 'RESTRICT',
  QUARANTINE = 'QUARANTINE',
  SUSPEND = 'SUSPEND',
  BANISH = 'BANISH',
}

export enum ExecutionMode {
  IMMEDIATE_RUNNER = 'IMMEDIATE_RUNNER',
  SCHEDULED_WINDOW = 'SCHEDULED_WINDOW',
}

export enum TrialZone {
  QUARANTINE = 'QUARANTINE',
  STAGING = 'STAGING',
  MAIN = 'MAIN',
}

// =============================================================================
// CORE TYPES
// =============================================================================

/**
 * Token — A proof-bound asset with full provenance
 */
export interface Token {
  id: string;
  type: TokenType;
  template?: string; // e.g., 'iron_ingot', 'iron_mug'
  owner_id: string;
  status: TokenStatus;
  
  // Provenance (what created this token)
  mint_event_id: string;
  proof_refs: string[]; // artifact hashes
  stamp_ids: string[]; // verification stamps that approved this
  
  // Spending (what consumed this token)
  spent_by_event_id?: string;
  
  // Metadata
  created_at: string; // ISO8601
  updated_at: string;
}

/**
 * Account — A settler in the world
 */
export interface Account {
  id: string;
  handle: string;
  display_name: string;
  
  // Balances
  cc_balance: number; // Civic Credits
  
  // Licenses
  licenses: License[];
  
  // Trust metrics
  trust_score: number;
  incident_count: number;
  diversity_score: number;
  
  // History
  created_at: string;
  last_active_at: string;
  
  // Founder period flag
  is_founder: boolean;
  is_founding_settler: boolean; // First 100
}

/**
 * License — Permission to operate in a school
 */
export interface License {
  school: School;
  tier: LicenseTier;
  granted_at: string;
  granted_by: string; // account_id or 'SYSTEM'
  seals_earned: {
    bronze: number;
    silver: number;
    gold: number;
  };
}

/**
 * Artifact — A work product attached to a submission
 */
export interface Artifact {
  name: string;
  hash: string; // SHA256
  uri: string; // storage location
  mime_type: string;
  size_bytes: number;
}

/**
 * Blueprint Envelope — The universal container for all proposals
 */
export interface EnvelopeAuth {
  signer_id: string;
  signature: string; // base64 signature
  nonce: string;
  algorithm: 'ED25519';
  public_key?: string; // optional override (PEM or base64 DER)
}

export interface BlueprintEnvelope {
  id: string;
  kind: BlueprintKind;
  class: BlueprintClass;
  irl_min: number; // Infrastructure Readiness Level required (0-5)
  
  // Metadata
  created_at: string;
  proposer_id: string;
  title: string;
  summary: string;
  
  // Scopes requested
  requested_scopes: Scope[];
  
  // Funding
  funding: FundingConfig;
  
  // Verification requirements
  verification_plan: VerificationPlan;
  
  // Execution
  execution_plan: ExecutionPlan;
  
  // Economy impact
  economy_impact: EconomyImpact;
  
  // The actual payload (varies by kind)
  payload: any;

  // Authentication
  auth?: EnvelopeAuth;
  
  // Status tracking
  status: 'DRAFT' | 'SUBMITTED' | 'VERIFYING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'ROLLED_BACK';
}

export interface Scope {
  verb: 'READ' | 'PROPOSE' | 'PUBLISH' | 'SIMULATE' | 'VERIFY' | 'MODERATE';
  target: string;
  limits?: {
    rate_per_min?: number;
    max_objects?: number;
  };
}

export interface FundingConfig {
  escrow_required: boolean;
  sponsor_id: string;
  escrow_cc_amount: number;
  treasury_match?: {
    enabled: boolean;
    max_percent: number;
    cap_cc: number;
  };
  fees: {
    admin_percent: number;
    fixed_cc: number;
  };
}

export interface VerificationPlan {
  required_stamps: StampRequirement[];
  conflict_rules: {
    max_pairings_per_cycle: number;
    disallow_same_maintainer_group: boolean;
    min_diversity_score: number;
  };
  sampling_audit?: {
    enabled: boolean;
    rate: number;
    audit_pay_cc: number;
  };
}

export interface StampRequirement {
  role: StampRole;
  min_unique: number;
  eligible_licenses: string[];
  stake_cc: number;
  pay_cc: number;
  timeout_minutes: number;
  escalation: {
    after_minutes: number;
    pay_multiplier: number;
  }[];
}

export interface ExecutionPlan {
  mode: ExecutionMode;
  window?: {
    name: string;
    opens_at: string;
    closes_at: string;
  };
  trial_required: boolean;
  trial_zone: TrialZone;
  rollback: {
    required: boolean;
    strategy: 'SNAPSHOT_REVERT' | 'FORWARD_FIX';
  };
}

export interface EconomyImpact {
  category: School | 'OTHER';
  mint_caps?: {
    per_bot_per_cycle: number;
    global_per_cycle: number;
  };
  crowding_tags: string[];
  subsidy_eligibility: 'NONE' | 'PUBLIC_GOOD';
}

// =============================================================================
// PAYLOAD TYPES
// =============================================================================

export interface QuestContractPayload {
  deliverable_type: string;
  acceptance_criteria: string[];
  author_stipend_cc: number;
  mint_rewards: {
    token_type: TokenType;
    mint_to: 'AUTHOR' | 'ESCROW' | 'SPONSOR';
    amount: number;
    conditions: string[];
  }[];
}

export interface WorkSubmissionPayload {
  contract_id: string;
  artifacts: Artifact[];
  claims: string[];
  requested_mint: TokenType[];
}

export interface VerificationJobAcceptPayload {
  job_id: string;
  verifier_id: string;
  stake_cc_locked: number;
}

export interface SanctionPayload {
  target_type: 'STAKE' | 'SUBMISSION' | 'ACCOUNT';
  target_id: string;
  action: 'SLASH' | 'REJECT' | 'FLAG';
  reason: string;
  amount_cc?: number;
  recipient_id?: string;
}

export interface AppealPayload {
  sanction_id: string;
  appellant_id: string;
  reason: string;
}

export interface VerificationStampPayload {
  job_id: string;
  verifier_id: string;
  decision: StampDecision;
  checklist_results: { item: string; passed: boolean }[];
  notes: string;
  artifacts?: Artifact[];
  stake_cc_locked: number;
}

export interface MintEventPayload {
  token_type: TokenType;
  token_template: string;
  mint_to: string;
  amount: number;
  provenance: {
    submission_id: string;
    stamps: string[];
    artifact_hashes: string[];
  };
}

export interface CraftPayload {
  recipe_id: string;
  inputs: { token_id: string }[];
  output: {
    token_template: string;
    amount: number;
  };
  required_license: string;
  craft_fee_cc: number;
}

// =============================================================================
// LEDGER
// =============================================================================

export interface LedgerEvent {
  id: string;
  type:
    | 'MINT'
    | 'TRANSFER'
    | 'BURN'
    | 'SPEND'
    | 'ESCROW_LOCK'
    | 'ESCROW_RELEASE'
    | 'STAKE_LOCK'
    | 'STAKE_RELEASE'
    | 'BLUEPRINT_EXEC';
  timestamp: string;
  
  // What happened
  actor_id: string;
  blueprint_id?: string;
  
  // Token changes
  tokens_minted?: string[];
  tokens_burned?: string[];
  tokens_transferred?: { token_id: string; from: string; to: string }[];
  
  // CC changes
  cc_changes?: { account_id: string; delta: number; reason: string }[];
  
  // Merkle anchoring
  prev_hash: string;
  event_hash: string;
}

// =============================================================================
// VERIFICATION JOBS
// =============================================================================

export interface VerificationJob {
  id: string;
  submission_id: string;
  stamp_role: StampRole;
  
  // Assignment
  assigned_to?: string;
  open_to_pool: boolean;
  eligible_verifiers: string[];
  
  // Payment
  base_pay_cc: number;
  current_pay_cc: number; // After escalation
  stake_required_cc: number;
  
  // Timing
  created_at: string;
  deadline_at: string;
  escalation_history: { at: string; multiplier: number }[];
  
  // Status
  status: 'OPEN' | 'ASSIGNED' | 'COMPLETED' | 'EXPIRED';
  stamp_id?: string;
}

// =============================================================================
// WORLD STATE
// =============================================================================

export interface WorldState {
  current_cycle: number;
  cycle_started_at: string;
  
  // Infrastructure Readiness Level
  irl: number;
  
  // Economy health
  need_board: NeedBoardEntry[];
  saturation_indices: { [category: string]: number };
  
  // Founder period
  founder_period_active: boolean;
  founding_settlers_count: number;
  licensed_verifiers_count: number;
}

export interface NeedBoardEntry {
  category: string;
  stress_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommended_bounty_multiplier: number;
  description: string;
}
