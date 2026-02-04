import { Account, Token, VerificationJob } from '../../shared/schema';
import { ExecutionError } from './errors';
import { EscrowAccount } from './escrow';
import { ESCROW_ACCOUNT_PREFIX, STAKE_ACCOUNT_PREFIX, TREASURY_ACCOUNT_ID } from './constants';
import {
  AppealRecord,
  QuestContractRecord,
  SanctionRecord,
  VerificationStampRecord,
  WorkSubmissionRecord,
} from './records';
import { StakeLock } from './stake';

export interface StateSnapshot {
  tokens: Record<string, Token>;
  accounts: Record<string, Account>;
  escrows: Record<string, EscrowAccount>;
  contracts: Record<string, QuestContractRecord>;
  submissions: Record<string, WorkSubmissionRecord>;
  stamps: Record<string, VerificationStampRecord>;
  verification_jobs: Record<string, VerificationJob>;
  stakes: Record<string, StakeLock>;
  sanctions: Record<string, SanctionRecord>;
  appeals: Record<string, AppealRecord>;
  nonces: Record<string, string[]>;
}

export interface CcChange {
  account_id: string;
  delta: number;
  reason: string;
}

function cloneRecord<T>(record: Record<string, T>): Record<string, T> {
  return JSON.parse(JSON.stringify(record)) as Record<string, T>;
}

export class RunnerState {
  private tokens: Map<string, Token> = new Map();
  private accounts: Map<string, Account> = new Map();
  private escrows: Map<string, EscrowAccount> = new Map();
  private contracts: Map<string, QuestContractRecord> = new Map();
  private submissions: Map<string, WorkSubmissionRecord> = new Map();
  private stamps: Map<string, VerificationStampRecord> = new Map();
  private verificationJobs: Map<string, VerificationJob> = new Map();
  private stakes: Map<string, StakeLock> = new Map();
  private sanctions: Map<string, SanctionRecord> = new Map();
  private appeals: Map<string, AppealRecord> = new Map();
  private nonces: Map<string, Set<string>> = new Map();

  constructor(snapshot?: StateSnapshot) {
    if (snapshot) {
      this.restore(snapshot);
    }
  }

  getToken(tokenId: string): Token | undefined {
    return this.tokens.get(tokenId);
  }

  listTokens(): Token[] {
    return [...this.tokens.values()];
  }

  listTokensByOwner(ownerId: string): Token[] {
    return [...this.tokens.values()].filter((token) => token.owner_id === ownerId);
  }

  addToken(token: Token): void {
    if (this.tokens.has(token.id)) {
      throw new ExecutionError(`token already exists: ${token.id}`);
    }
    this.tokens.set(token.id, token);
  }

  updateToken(token: Token): void {
    if (!this.tokens.has(token.id)) {
      throw new ExecutionError(`token not found: ${token.id}`);
    }
    this.tokens.set(token.id, token);
  }

  getAccount(accountId: string): Account | undefined {
    return this.accounts.get(accountId);
  }

  getContract(contractId: string): QuestContractRecord | undefined {
    return this.contracts.get(contractId);
  }

  addContract(contract: QuestContractRecord): void {
    if (this.contracts.has(contract.id)) {
      throw new ExecutionError(`contract already exists: ${contract.id}`);
    }
    this.contracts.set(contract.id, contract);
  }

  getSubmission(submissionId: string): WorkSubmissionRecord | undefined {
    return this.submissions.get(submissionId);
  }

  addSubmission(submission: WorkSubmissionRecord): void {
    if (this.submissions.has(submission.id)) {
      throw new ExecutionError(`submission already exists: ${submission.id}`);
    }
    this.submissions.set(submission.id, submission);
  }

  updateSubmission(submission: WorkSubmissionRecord): void {
    if (!this.submissions.has(submission.id)) {
      throw new ExecutionError(`submission not found: ${submission.id}`);
    }
    this.submissions.set(submission.id, submission);
  }

  listSubmissionsByContract(contractId: string): WorkSubmissionRecord[] {
    return [...this.submissions.values()].filter((submission) => submission.contract_id === contractId);
  }

  getStamp(stampId: string): VerificationStampRecord | undefined {
    return this.stamps.get(stampId);
  }

  addStamp(stamp: VerificationStampRecord): void {
    if (this.stamps.has(stamp.id)) {
      throw new ExecutionError(`stamp already exists: ${stamp.id}`);
    }
    this.stamps.set(stamp.id, stamp);
  }

  listStampsBySubmission(submissionId: string): VerificationStampRecord[] {
    return [...this.stamps.values()].filter((stamp) => stamp.submission_id === submissionId);
  }

  getVerificationJob(jobId: string): VerificationJob | undefined {
    return this.verificationJobs.get(jobId);
  }

  addVerificationJob(job: VerificationJob): void {
    if (this.verificationJobs.has(job.id)) {
      throw new ExecutionError(`verification job already exists: ${job.id}`);
    }
    this.verificationJobs.set(job.id, job);
  }

  updateVerificationJob(job: VerificationJob): void {
    if (!this.verificationJobs.has(job.id)) {
      throw new ExecutionError(`verification job not found: ${job.id}`);
    }
    this.verificationJobs.set(job.id, job);
  }

  listVerificationJobs(): VerificationJob[] {
    return [...this.verificationJobs.values()];
  }

  listVerificationJobsBySubmission(submissionId: string): VerificationJob[] {
    return [...this.verificationJobs.values()].filter((job) => job.submission_id === submissionId);
  }

  getStakeLock(lockId: string): StakeLock | undefined {
    return this.stakes.get(lockId);
  }

  getStakeLockForJob(jobId: string, verifierId: string): StakeLock | undefined {
    return this.stakes.get(this.buildStakeId(jobId, verifierId));
  }

  lockStake(
    jobId: string,
    verifierId: string,
    amount: number,
    now: string,
    reason: string,
  ): { stake: StakeLock; cc_changes: CcChange[] } {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new ExecutionError('stake amount must be >= 0');
    }
    if (amount === 0) {
      const stake = this.ensureStakeLock(jobId, verifierId, now, 0, 'LOCKED');
      return { stake, cc_changes: [] };
    }

    const lockId = this.buildStakeId(jobId, verifierId);
    if (this.stakes.has(lockId)) {
      throw new ExecutionError(`stake lock already exists: ${lockId}`);
    }

    const accountId = `${STAKE_ACCOUNT_PREFIX}${jobId}:${verifierId}`;
    const ccChanges = this.transferCc(verifierId, accountId, amount, now, reason, true);
    const stake: StakeLock = {
      id: lockId,
      job_id: jobId,
      verifier_id: verifierId,
      account_id: accountId,
      balance_cc: amount,
      status: 'LOCKED',
      created_at: now,
      updated_at: now,
    };

    this.stakes.set(lockId, stake);
    return { stake, cc_changes: ccChanges };
  }

  releaseStake(
    jobId: string,
    verifierId: string,
    now: string,
    reason: string,
  ): { stake: StakeLock; cc_changes: CcChange[] } {
    const lockId = this.buildStakeId(jobId, verifierId);
    const stake = this.stakes.get(lockId);
    if (!stake) {
      throw new ExecutionError(`stake lock not found: ${lockId}`);
    }
    if (stake.status !== 'LOCKED') {
      throw new ExecutionError(`stake lock not active: ${lockId}`);
    }

    const amount = stake.balance_cc;
    const ccChanges = amount > 0
      ? this.transferCc(stake.account_id, verifierId, amount, now, reason, true)
      : [];

    const updated: StakeLock = {
      ...stake,
      balance_cc: 0,
      status: 'RELEASED',
      updated_at: now,
    };
    this.stakes.set(lockId, updated);
    return { stake: updated, cc_changes: ccChanges };
  }

  slashStake(
    jobId: string,
    verifierId: string,
    now: string,
    reason: string,
    recipientId = TREASURY_ACCOUNT_ID,
    amount?: number,
  ): { stake: StakeLock; cc_changes: CcChange[] } {
    const lockId = this.buildStakeId(jobId, verifierId);
    const stake = this.stakes.get(lockId);
    if (!stake) {
      throw new ExecutionError(`stake lock not found: ${lockId}`);
    }
    if (stake.status !== 'LOCKED') {
      throw new ExecutionError(`stake lock not active: ${lockId}`);
    }

    const slashAmount = amount ?? stake.balance_cc;
    if (!Number.isFinite(slashAmount) || slashAmount < 0) {
      throw new ExecutionError('slash amount must be >= 0');
    }
    if (slashAmount > stake.balance_cc) {
      throw new ExecutionError('slash amount exceeds locked stake');
    }

    const ccChanges = slashAmount > 0
      ? this.transferCc(stake.account_id, recipientId, slashAmount, now, reason, true)
      : [];

    const remaining = stake.balance_cc - slashAmount;
    const updated: StakeLock = {
      ...stake,
      balance_cc: remaining,
      status: remaining === 0 ? 'SLASHED' : stake.status,
      updated_at: now,
    };
    this.stakes.set(lockId, updated);
    return { stake: updated, cc_changes: ccChanges };
  }

  getSanction(sanctionId: string): SanctionRecord | undefined {
    return this.sanctions.get(sanctionId);
  }

  addSanction(sanction: SanctionRecord): void {
    if (this.sanctions.has(sanction.id)) {
      throw new ExecutionError(`sanction already exists: ${sanction.id}`);
    }
    this.sanctions.set(sanction.id, sanction);
  }

  updateSanction(sanction: SanctionRecord): void {
    if (!this.sanctions.has(sanction.id)) {
      throw new ExecutionError(`sanction not found: ${sanction.id}`);
    }
    this.sanctions.set(sanction.id, sanction);
  }

  addAppeal(appeal: AppealRecord): void {
    if (this.appeals.has(appeal.id)) {
      throw new ExecutionError(`appeal already exists: ${appeal.id}`);
    }
    this.appeals.set(appeal.id, appeal);
  }

  listAppealsBySanction(sanctionId: string): AppealRecord[] {
    return [...this.appeals.values()].filter((appeal) => appeal.sanction_id === sanctionId);
  }

  hasNonce(signerId: string, nonce: string): boolean {
    const set = this.nonces.get(signerId);
    if (!set) {
      return false;
    }
    return set.has(nonce);
  }

  registerNonce(signerId: string, nonce: string): void {
    const set = this.nonces.get(signerId) ?? new Set<string>();
    if (set.has(nonce)) {
      throw new ExecutionError(`nonce already used for signer: ${signerId}`);
    }
    set.add(nonce);
    this.nonces.set(signerId, set);
  }

  ensureAccount(accountId: string, now: string, createIfMissing = false): Account {
    const existing = this.accounts.get(accountId);
    if (existing) {
      return existing;
    }

    if (!createIfMissing) {
      throw new ExecutionError(`account not found: ${accountId}`);
    }

    const account: Account = {
      id: accountId,
      handle: accountId,
      display_name: accountId,
      cc_balance: 0,
      licenses: [],
      trust_score: 0,
      incident_count: 0,
      diversity_score: 0,
      created_at: now,
      last_active_at: now,
      is_founder: false,
      is_founding_settler: false,
    };
    this.accounts.set(accountId, account);
    return account;
  }

  applyCcChange(
    accountId: string,
    delta: number,
    now: string,
    reason: string,
    createIfMissing = false,
  ): CcChange {
    if (!Number.isFinite(delta)) {
      throw new ExecutionError('cc delta must be a finite number');
    }
    const account = this.ensureAccount(accountId, now, createIfMissing);
    const nextBalance = account.cc_balance + delta;
    if (nextBalance < 0) {
      throw new ExecutionError(`insufficient CC balance for ${accountId}`);
    }

    this.upsertAccount({
      ...account,
      cc_balance: nextBalance,
      last_active_at: now,
    });

    return { account_id: accountId, delta, reason };
  }

  transferCc(
    fromId: string,
    toId: string,
    amount: number,
    now: string,
    reason: string,
    createRecipient = false,
  ): CcChange[] {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ExecutionError('transfer amount must be positive');
    }

    const debit = this.applyCcChange(fromId, -amount, now, reason, false);
    const credit = this.applyCcChange(toId, amount, now, reason, createRecipient);
    return [debit, credit];
  }

  upsertAccount(account: Account): void {
    this.accounts.set(account.id, account);
  }

  incrementIncident(accountId: string, now: string, delta = 1): Account {
    const account = this.ensureAccount(accountId, now, true);
    const updated = {
      ...account,
      incident_count: account.incident_count + delta,
      last_active_at: now,
    };
    this.upsertAccount(updated);
    return updated;
  }

  getEscrow(escrowId: string): EscrowAccount | undefined {
    return this.escrows.get(escrowId);
  }

  listEscrows(): EscrowAccount[] {
    return [...this.escrows.values()];
  }

  lockEscrow(
    escrowId: string,
    sponsorId: string,
    amount: number,
    now: string,
    reason: string,
  ): { escrow: EscrowAccount; cc_changes: CcChange[] } {
    if (this.escrows.has(escrowId)) {
      throw new ExecutionError(`escrow already exists: ${escrowId}`);
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ExecutionError('escrow amount must be positive');
    }

    const escrowAccountId = `${ESCROW_ACCOUNT_PREFIX}${escrowId}`;
    const ccChanges = this.transferCc(sponsorId, escrowAccountId, amount, now, reason, true);
    const escrow: EscrowAccount = {
      id: escrowId,
      account_id: escrowAccountId,
      sponsor_id: sponsorId,
      balance_cc: amount,
      status: 'OPEN',
      created_at: now,
      updated_at: now,
    };

    this.escrows.set(escrowId, escrow);
    return { escrow, cc_changes: ccChanges };
  }

  releaseEscrow(
    escrowId: string,
    recipientId: string,
    amount: number,
    now: string,
    reason: string,
  ): { escrow: EscrowAccount; cc_changes: CcChange[] } {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) {
      throw new ExecutionError(`escrow not found: ${escrowId}`);
    }
    if (escrow.status !== 'OPEN') {
      throw new ExecutionError(`escrow not open: ${escrowId}`);
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ExecutionError('release amount must be positive');
    }
    if (amount > escrow.balance_cc) {
      throw new ExecutionError(`escrow balance insufficient: ${escrowId}`);
    }

    const nextBalance = escrow.balance_cc - amount;
    const updated: EscrowAccount = {
      ...escrow,
      balance_cc: nextBalance,
      status: nextBalance === 0 ? 'CLOSED' : escrow.status,
      updated_at: now,
    };
    this.escrows.set(escrowId, updated);

    const ccChanges = this.transferCc(escrow.account_id, recipientId, amount, now, reason, true);
    return { escrow: updated, cc_changes: ccChanges };
  }

  snapshot(): StateSnapshot {
    const tokens: Record<string, Token> = {};
    for (const [id, token] of this.tokens.entries()) {
      tokens[id] = JSON.parse(JSON.stringify(token)) as Token;
    }

    const accounts: Record<string, Account> = {};
    for (const [id, account] of this.accounts.entries()) {
      accounts[id] = JSON.parse(JSON.stringify(account)) as Account;
    }

    const escrows: Record<string, EscrowAccount> = {};
    for (const [id, escrow] of this.escrows.entries()) {
      escrows[id] = JSON.parse(JSON.stringify(escrow)) as EscrowAccount;
    }

    const contracts: Record<string, QuestContractRecord> = {};
    for (const [id, contract] of this.contracts.entries()) {
      contracts[id] = JSON.parse(JSON.stringify(contract)) as QuestContractRecord;
    }

    const submissions: Record<string, WorkSubmissionRecord> = {};
    for (const [id, submission] of this.submissions.entries()) {
      submissions[id] = JSON.parse(JSON.stringify(submission)) as WorkSubmissionRecord;
    }

    const stamps: Record<string, VerificationStampRecord> = {};
    for (const [id, stamp] of this.stamps.entries()) {
      stamps[id] = JSON.parse(JSON.stringify(stamp)) as VerificationStampRecord;
    }

    const verification_jobs: Record<string, VerificationJob> = {};
    for (const [id, job] of this.verificationJobs.entries()) {
      verification_jobs[id] = JSON.parse(JSON.stringify(job)) as VerificationJob;
    }

    const stakes: Record<string, StakeLock> = {};
    for (const [id, stake] of this.stakes.entries()) {
      stakes[id] = JSON.parse(JSON.stringify(stake)) as StakeLock;
    }

    const sanctions: Record<string, SanctionRecord> = {};
    for (const [id, sanction] of this.sanctions.entries()) {
      sanctions[id] = JSON.parse(JSON.stringify(sanction)) as SanctionRecord;
    }

    const appeals: Record<string, AppealRecord> = {};
    for (const [id, appeal] of this.appeals.entries()) {
      appeals[id] = JSON.parse(JSON.stringify(appeal)) as AppealRecord;
    }

    const nonces: Record<string, string[]> = {};
    for (const [id, set] of this.nonces.entries()) {
      nonces[id] = [...set.values()];
    }

    return {
      tokens,
      accounts,
      escrows,
      contracts,
      submissions,
      stamps,
      verification_jobs,
      stakes,
      sanctions,
      appeals,
      nonces,
    };
  }

  restore(snapshot: StateSnapshot): void {
    this.tokens = new Map(Object.entries(cloneRecord(snapshot.tokens)));
    this.accounts = new Map(Object.entries(cloneRecord(snapshot.accounts)));
    this.escrows = new Map(Object.entries(cloneRecord(snapshot.escrows ?? {})));
    this.contracts = new Map(Object.entries(cloneRecord(snapshot.contracts ?? {})));
    this.submissions = new Map(Object.entries(cloneRecord(snapshot.submissions ?? {})));
    this.stamps = new Map(Object.entries(cloneRecord(snapshot.stamps ?? {})));
    this.verificationJobs = new Map(Object.entries(cloneRecord(snapshot.verification_jobs ?? {})));
    this.stakes = new Map(Object.entries(cloneRecord(snapshot.stakes ?? {})));
    this.sanctions = new Map(Object.entries(cloneRecord(snapshot.sanctions ?? {})));
    this.appeals = new Map(Object.entries(cloneRecord(snapshot.appeals ?? {})));
    const nonceSets = new Map<string, Set<string>>();
    for (const [signerId, values] of Object.entries(snapshot.nonces ?? {})) {
      nonceSets.set(signerId, new Set(values));
    }
    this.nonces = nonceSets;
  }

  private buildStakeId(jobId: string, verifierId: string): string {
    return `${jobId}:${verifierId}`;
  }

  private ensureStakeLock(
    jobId: string,
    verifierId: string,
    now: string,
    balance: number,
    status: StakeLock['status'],
  ): StakeLock {
    const lockId = this.buildStakeId(jobId, verifierId);
    const existing = this.stakes.get(lockId);
    if (existing) {
      return existing;
    }
    const stake: StakeLock = {
      id: lockId,
      job_id: jobId,
      verifier_id: verifierId,
      account_id: `${STAKE_ACCOUNT_PREFIX}${jobId}:${verifierId}`,
      balance_cc: balance,
      status,
      created_at: now,
      updated_at: now,
    };
    this.stakes.set(lockId, stake);
    return stake;
  }
}
