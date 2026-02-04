import {
  AppealPayload,
  BlueprintEnvelope,
  BlueprintKind,
  CraftPayload,
  LedgerEvent,
  MintEventPayload,
  QuestContractPayload,
  SanctionPayload,
  StampDecision,
  StampRole,
  TokenType,
  Token,
  TokenStatus,
  VerificationPlan,
  VerificationJob,
  VerificationJobAcceptPayload,
  VerificationStampPayload,
  WorkSubmissionPayload,
} from '../../shared/schema';
import { ExecutionError, RunnerError, ValidationError } from './errors';
import { hashObject } from './hash';
import { Ledger } from './ledger';
import { RunnerPolicy, RunnerPolicyContext } from './policy';
import { RunnerState, StateSnapshot } from './state';
import { ESCROW_ACCOUNT_PREFIX, TREASURY_ACCOUNT_ID } from './constants';
import {
  AppealRecord,
  QuestContractRecord,
  SanctionRecord,
  VerificationStampRecord,
  WorkSubmissionRecord,
} from './records';
import { TreasuryBudget } from './budget';
import { RunnerSecurity } from './security';

export interface RunnerKernelOptions {
  maxSnapshots?: number;
  clock?: () => string;
  policy?: RunnerPolicy;
  budget?: TreasuryBudget;
  security?: RunnerSecurity;
}

export interface ExecutionResult {
  event: LedgerEvent;
  minted: Token[];
  burned: Token[];
}

export class RunnerKernel {
  private snapshots: StateSnapshot[] = [];
  private maxSnapshots: number;
  private clock: () => string;
  private policy?: RunnerPolicy;
  private budget?: TreasuryBudget;
  private security?: RunnerSecurity;

  constructor(
    private ledger: Ledger,
    private state: RunnerState,
    options?: RunnerKernelOptions,
  ) {
    this.maxSnapshots = options?.maxSnapshots ?? 50;
    this.clock = options?.clock ?? (() => new Date().toISOString());
    this.policy = options?.policy;
    this.budget = options?.budget;
    this.security = options?.security;
  }

  execute(envelope: BlueprintEnvelope): ExecutionResult {
    this.assertValidEnvelope(envelope);

    const snapshot = this.state.snapshot();
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    try {
      this.security?.assertEnvelope(envelope, {
        state: this.state,
        now: this.clock(),
      });
      switch (envelope.kind) {
        case BlueprintKind.QUEST_CONTRACT:
          return this.executeQuestContract(envelope);
        case BlueprintKind.WORK_SUBMISSION:
          return this.executeWorkSubmission(envelope);
        case BlueprintKind.VERIFICATION_JOB:
          return this.executeVerificationJobAccept(envelope);
        case BlueprintKind.VERIFICATION_STAMP:
          return this.executeVerificationStamp(envelope);
        case BlueprintKind.SANCTION:
          return this.executeSanction(envelope);
        case BlueprintKind.APPEAL:
          return this.executeAppeal(envelope);
        case BlueprintKind.MINT_EVENT:
          return this.executeMint(envelope);
        case BlueprintKind.CRAFT:
          return this.executeCraft(envelope);
        default:
          throw new ValidationError(`unsupported blueprint kind: ${envelope.kind}`);
      }
    } catch (error) {
      this.state.restore(snapshot);
      this.snapshots.pop();
      if (error instanceof RunnerError) {
        throw error;
      }
      throw new ExecutionError('runner execution failed', { error });
    }
  }

  rollback(steps = 1): void {
    if (!Number.isInteger(steps) || steps < 1) {
      throw new ValidationError('rollback steps must be a positive integer');
    }
    if (steps > this.snapshots.length) {
      throw new ExecutionError('not enough snapshots to rollback');
    }

    const snapshot = this.snapshots[this.snapshots.length - steps];
    this.state.restore(snapshot);
    this.snapshots = this.snapshots.slice(0, this.snapshots.length - steps);
  }

  exportSnapshots(): StateSnapshot[] {
    return this.cloneSnapshots(this.snapshots);
  }

  restoreSnapshots(snapshots: StateSnapshot[]): void {
    this.snapshots = this.cloneSnapshots(snapshots).slice(-this.maxSnapshots);
  }

  private executeMint(envelope: BlueprintEnvelope): ExecutionResult {
    const payload = envelope.payload as MintEventPayload;
    this.assertMintPayload(payload);

    const { prev_hash, sequence } = this.ledger.getNextMeta();
    const eventId = this.deriveEventId(envelope, prev_hash, sequence);
    const timestamp = this.clock();
    const policyContext = this.createPolicyContext(timestamp);
    this.policy?.assertMint(payload, envelope, policyContext);

    const minted: Token[] = [];
    for (let i = 0; i < payload.amount; i += 1) {
      minted.push({
        id: this.deriveTokenId(eventId, i, payload.token_type, payload.token_template),
        type: payload.token_type,
        template: payload.token_template,
        owner_id: payload.mint_to,
        status: TokenStatus.ACTIVE,
        mint_event_id: eventId,
        proof_refs: payload.provenance?.artifact_hashes ?? [],
        stamp_ids: payload.provenance?.stamps ?? [],
        created_at: timestamp,
        updated_at: timestamp,
      });
    }

    for (const token of minted) {
      this.state.addToken(token);
    }

    const event = this.ledger.append({
      id: eventId,
      timestamp,
      type: 'MINT',
      actor_id: envelope.proposer_id,
      blueprint_id: envelope.id,
      tokens_minted: minted.map((token) => token.id),
    });

    this.policy?.recordMint(payload, envelope, minted, policyContext);

    return { event, minted, burned: [] };
  }

  private executeCraft(envelope: BlueprintEnvelope): ExecutionResult {
    const payload = envelope.payload as CraftPayload;
    this.assertCraftPayload(payload);

    const timestamp = this.clock();
    const policyContext = this.createPolicyContext(timestamp);
    this.policy?.assertCraft(payload, envelope, policyContext);

    const ccChanges = this.applyCraftFee(payload, envelope, timestamp);

    const inputTokens = payload.inputs.map((input) => {
      const token = this.state.getToken(input.token_id);
      if (!token) {
        throw new ExecutionError(`input token not found: ${input.token_id}`);
      }
      if (token.status !== TokenStatus.ACTIVE) {
        throw new ExecutionError(`input token not active: ${input.token_id}`);
      }
      if (token.owner_id !== envelope.proposer_id) {
        throw new ExecutionError(`input token not owned by proposer: ${input.token_id}`);
      }
      return token;
    });

    const { prev_hash, sequence } = this.ledger.getNextMeta();
    const eventId = this.deriveEventId(envelope, prev_hash, sequence);

    const burned: Token[] = inputTokens.map((token) => ({
      ...token,
      status: TokenStatus.BURNED,
      spent_by_event_id: eventId,
      updated_at: timestamp,
    }));

    for (const token of burned) {
      this.state.updateToken(token);
    }

    const minted: Token[] = [];
    for (let i = 0; i < payload.output.amount; i += 1) {
      minted.push({
        id: this.deriveTokenId(eventId, i, TokenType.ITEM, payload.output.token_template),
        type: TokenType.ITEM,
        template: payload.output.token_template,
        owner_id: envelope.proposer_id,
        status: TokenStatus.ACTIVE,
        mint_event_id: eventId,
        proof_refs: inputTokens.map((token) => token.id),
        stamp_ids: [],
        created_at: timestamp,
        updated_at: timestamp,
      });
    }

    for (const token of minted) {
      this.state.addToken(token);
    }

    const event = this.ledger.append({
      id: eventId,
      timestamp,
      type: 'BLUEPRINT_EXEC',
      actor_id: envelope.proposer_id,
      blueprint_id: envelope.id,
      tokens_minted: minted.map((token) => token.id),
      tokens_burned: burned.map((token) => token.id),
      cc_changes: ccChanges,
    });

    return { event, minted, burned };
  }

  private executeQuestContract(envelope: BlueprintEnvelope): ExecutionResult {
    const payload = envelope.payload as QuestContractPayload;
    this.assertQuestContractPayload(payload);
    this.assertQuestFunding(envelope);

    const timestamp = this.clock();

    const ccChanges = this.lockEscrowForContract(envelope, timestamp);
    this.applyFixedFee(envelope, timestamp, ccChanges);

    const contract: QuestContractRecord = {
      id: envelope.id,
      proposer_id: envelope.proposer_id,
      created_at: timestamp,
      funding: envelope.funding,
      verification_plan: envelope.verification_plan,
      payload,
    };
    this.state.addContract(contract);

    const { prev_hash, sequence } = this.ledger.getNextMeta();
    const eventId = this.deriveEventId(envelope, prev_hash, sequence);

    const event = this.ledger.append({
      id: eventId,
      timestamp,
      type: 'ESCROW_LOCK',
      actor_id: envelope.proposer_id,
      blueprint_id: envelope.id,
      cc_changes: ccChanges,
    });

    return { event, minted: [], burned: [] };
  }

  private executeWorkSubmission(envelope: BlueprintEnvelope): ExecutionResult {
    const payload = envelope.payload as WorkSubmissionPayload;
    this.assertWorkSubmissionPayload(payload);

    const contract = this.state.getContract(payload.contract_id);
    if (!contract) {
      throw new ExecutionError(`contract not found: ${payload.contract_id}`);
    }

    const escrow = this.state.getEscrow(contract.id);
    if (!escrow) {
      throw new ExecutionError(`escrow not found for contract: ${contract.id}`);
    }
    if (escrow.status !== 'OPEN') {
      throw new ExecutionError(`escrow not open for contract: ${contract.id}`);
    }

    const timestamp = this.clock();
    const submission: WorkSubmissionRecord = {
      id: envelope.id,
      contract_id: payload.contract_id,
      proposer_id: envelope.proposer_id,
      created_at: timestamp,
      payload,
      status: 'SUBMITTED',
      stamp_ids: [],
      minted: false,
    };
    this.state.addSubmission(submission);

    const jobs = this.createVerificationJobs(contract.verification_plan, submission.id, timestamp);
    for (const job of jobs) {
      this.state.addVerificationJob(job);
    }

    const ccChanges = this.releaseAuthorStipend(contract, submission, timestamp);

    const { prev_hash, sequence } = this.ledger.getNextMeta();
    const eventId = this.deriveEventId(envelope, prev_hash, sequence);
    const event = this.ledger.append({
      id: eventId,
      timestamp,
      type: 'BLUEPRINT_EXEC',
      actor_id: envelope.proposer_id,
      blueprint_id: envelope.id,
      cc_changes: ccChanges.length > 0 ? ccChanges : undefined,
    });

    return { event, minted: [], burned: [] };
  }

  private executeVerificationStamp(envelope: BlueprintEnvelope): ExecutionResult {
    const payload = envelope.payload as VerificationStampPayload;
    this.assertVerificationStampPayload(payload);

    if (payload.verifier_id !== envelope.proposer_id) {
      throw new ExecutionError('verifier_id must match proposer_id');
    }

    const job = this.state.getVerificationJob(payload.job_id);
    if (!job) {
      throw new ExecutionError(`verification job not found: ${payload.job_id}`);
    }

    const timestamp = this.clock();
    const assignedJob = this.ensureJobAssignment(job, payload.verifier_id);
    const stakeLock = this.state.getStakeLockForJob(assignedJob.id, payload.verifier_id);
    if (!stakeLock || stakeLock.status !== 'LOCKED') {
      throw new ExecutionError(`stake not locked for job: ${payload.job_id}`);
    }
    if (stakeLock.balance_cc < assignedJob.stake_required_cc) {
      throw new ExecutionError(`stake locked below requirement for job: ${payload.job_id}`);
    }

    const submission = this.state.getSubmission(assignedJob.submission_id);
    if (!submission) {
      throw new ExecutionError(`submission not found: ${assignedJob.submission_id}`);
    }

    const contract = this.state.getContract(submission.contract_id);
    if (!contract) {
      throw new ExecutionError(`contract not found: ${submission.contract_id}`);
    }

    const stampId = this.deriveStampId(assignedJob.id, payload.verifier_id, timestamp, payload.decision);
    const stamp: VerificationStampRecord = {
      id: stampId,
      job_id: assignedJob.id,
      submission_id: submission.id,
      verifier_id: payload.verifier_id,
      role: assignedJob.stamp_role,
      decision: payload.decision,
      notes: payload.notes,
      artifacts: payload.artifacts,
      stake_cc_locked: payload.stake_cc_locked,
      created_at: timestamp,
    };
    this.state.addStamp(stamp);

    const completedJob: VerificationJob = {
      ...assignedJob,
      status: 'COMPLETED',
      stamp_id: stampId,
    };
    this.state.updateVerificationJob(completedJob);

    let nextSubmission: WorkSubmissionRecord = {
      ...submission,
      stamp_ids: [...submission.stamp_ids, stampId],
    };

    const ccChanges = this.payVerifierAndFees(contract, completedJob, payload.verifier_id, timestamp);
    const stakeRelease = this.releaseStakeIfLocked(completedJob, payload.verifier_id, timestamp);
    if (stakeRelease.length > 0) {
      ccChanges.push(...stakeRelease);
    }
    const minted: Token[] = [];

    if (payload.decision === StampDecision.FAIL && completedJob.stamp_role !== StampRole.AUDIT) {
      const rejection = this.rejectSubmission(nextSubmission, contract, timestamp, [completedJob.id]);
      nextSubmission = rejection.submission;
      ccChanges.push(...rejection.cc_changes);
    }

    if (payload.decision === StampDecision.ABSTAIN) {
      this.requeueAbstainJob(contract.verification_plan, completedJob, nextSubmission.id, timestamp);
    }

    if (nextSubmission.status !== 'REJECTED' && !nextSubmission.minted && nextSubmission.status !== 'PENDING_AUDIT') {
      const passStamps = this.state
        .listStampsBySubmission(submission.id)
        .filter((record) => record.decision === StampDecision.PASS);
      const { satisfied, stampIds } = this.checkStampRequirements(
        contract.verification_plan,
        passStamps,
      );

      if (satisfied) {
        const auditOutcome = this.handleAuditSampling(contract.verification_plan, nextSubmission, timestamp);
        if (auditOutcome === 'AUDIT_REQUIRED') {
          nextSubmission.status = 'PENDING_AUDIT';
        } else {
          const mintedTokens = this.mintRewards(contract, nextSubmission, stampIds, timestamp, envelope);
          minted.push(...mintedTokens);
          nextSubmission.status = 'VERIFIED';
          nextSubmission.minted = mintedTokens.length > 0;
        }
      }
    }

    if (completedJob.stamp_role === StampRole.AUDIT) {
      if (payload.decision === StampDecision.PASS && nextSubmission.status === 'PENDING_AUDIT') {
        const passStamps = this.state
          .listStampsBySubmission(submission.id)
          .filter((record) => record.decision === StampDecision.PASS);
        const { satisfied, stampIds } = this.checkStampRequirements(
          contract.verification_plan,
          passStamps,
        );
        if (satisfied) {
          const mintedTokens = this.mintRewards(contract, nextSubmission, stampIds, timestamp, envelope);
          minted.push(...mintedTokens);
          nextSubmission.status = 'VERIFIED';
          nextSubmission.minted = mintedTokens.length > 0;
        }
      }
      if (payload.decision === StampDecision.FAIL) {
        const rejection = this.rejectSubmission(nextSubmission, contract, timestamp, [completedJob.id]);
        nextSubmission = rejection.submission;
        ccChanges.push(...rejection.cc_changes);
      }
    }

    this.state.updateSubmission(nextSubmission);

    const { prev_hash, sequence } = this.ledger.getNextMeta();
    const eventId = this.deriveEventId(envelope, prev_hash, sequence);
    const eventType: LedgerEvent['type'] = minted.length > 0 ? 'MINT' : 'BLUEPRINT_EXEC';
    const event = this.ledger.append({
      id: eventId,
      timestamp,
      type: eventType,
      actor_id: envelope.proposer_id,
      blueprint_id: envelope.id,
      cc_changes: ccChanges.length > 0 ? ccChanges : undefined,
      tokens_minted: minted.length > 0 ? minted.map((token) => token.id) : undefined,
    });

    return { event, minted, burned: [] };
  }

  private executeVerificationJobAccept(envelope: BlueprintEnvelope): ExecutionResult {
    const payload = envelope.payload as VerificationJobAcceptPayload;
    this.assertVerificationJobAcceptPayload(payload);

    if (payload.verifier_id !== envelope.proposer_id) {
      throw new ExecutionError('verifier_id must match proposer_id');
    }

    const job = this.state.getVerificationJob(payload.job_id);
    if (!job) {
      throw new ExecutionError(`verification job not found: ${payload.job_id}`);
    }

    if (job.status !== 'OPEN') {
      throw new ExecutionError(`verification job not open: ${payload.job_id}`);
    }

    if (!job.open_to_pool) {
      throw new ExecutionError(`verification job not open to pool: ${payload.job_id}`);
    }

    if (job.eligible_verifiers.length > 0 && !job.eligible_verifiers.includes(payload.verifier_id)) {
      throw new ExecutionError(`verifier not eligible for job: ${payload.job_id}`);
    }

    if (payload.stake_cc_locked < job.stake_required_cc) {
      throw new ExecutionError(`stake locked below requirement for job: ${payload.job_id}`);
    }

    const timestamp = this.clock();
    const stakeResult = this.state.lockStake(
      job.id,
      payload.verifier_id,
      payload.stake_cc_locked,
      timestamp,
      'STAKE_LOCK',
    );

    const assigned: VerificationJob = {
      ...job,
      assigned_to: payload.verifier_id,
      status: 'ASSIGNED',
    };
    this.state.updateVerificationJob(assigned);

    const { prev_hash, sequence } = this.ledger.getNextMeta();
    const eventId = this.deriveEventId(envelope, prev_hash, sequence);
    const event = this.ledger.append({
      id: eventId,
      timestamp,
      type: 'STAKE_LOCK',
      actor_id: envelope.proposer_id,
      blueprint_id: envelope.id,
      cc_changes: stakeResult.cc_changes.length > 0 ? stakeResult.cc_changes : undefined,
    });

    return { event, minted: [], burned: [] };
  }

  private executeSanction(envelope: BlueprintEnvelope): ExecutionResult {
    const payload = envelope.payload as SanctionPayload;
    this.assertSanctionPayload(payload);

    const timestamp = this.clock();
    const ccChanges: ReturnType<RunnerState['transferCc']> = [];

    if (payload.target_type === 'STAKE' && payload.action === 'SLASH') {
      const { jobId, verifierId } = this.parseStakeTarget(payload.target_id);
      const slash = this.state.slashStake(
        jobId,
        verifierId,
        timestamp,
        'STAKE_SLASH',
        payload.recipient_id ?? TREASURY_ACCOUNT_ID,
        payload.amount_cc,
      );
      ccChanges.push(...slash.cc_changes);
    }

    if (payload.target_type === 'SUBMISSION' && payload.action === 'REJECT') {
      const submission = this.state.getSubmission(payload.target_id);
      if (!submission) {
        throw new ExecutionError(`submission not found: ${payload.target_id}`);
      }
      const contract = this.state.getContract(submission.contract_id);
      if (!contract) {
        throw new ExecutionError(`contract not found: ${submission.contract_id}`);
      }

      const rejection = this.rejectSubmission(submission, contract, timestamp, []);
      this.state.updateSubmission(rejection.submission);
      ccChanges.push(...rejection.cc_changes);
    }

    if (payload.target_type === 'ACCOUNT' && payload.action === 'FLAG') {
      this.state.incrementIncident(payload.target_id, timestamp, 1);
    }

    const sanction: SanctionRecord = {
      id: envelope.id,
      created_at: timestamp,
      proposer_id: envelope.proposer_id,
      target_type: payload.target_type,
      target_id: payload.target_id,
      action: payload.action,
      reason: payload.reason,
      amount_cc: payload.amount_cc,
      recipient_id: payload.recipient_id,
      status: 'APPLIED',
    };
    this.state.addSanction(sanction);

    const { prev_hash, sequence } = this.ledger.getNextMeta();
    const eventId = this.deriveEventId(envelope, prev_hash, sequence);
    const event = this.ledger.append({
      id: eventId,
      timestamp,
      type: 'BLUEPRINT_EXEC',
      actor_id: envelope.proposer_id,
      blueprint_id: envelope.id,
      cc_changes: ccChanges.length > 0 ? ccChanges : undefined,
    });

    return { event, minted: [], burned: [] };
  }

  private executeAppeal(envelope: BlueprintEnvelope): ExecutionResult {
    const payload = envelope.payload as AppealPayload;
    this.assertAppealPayload(payload);

    if (payload.appellant_id !== envelope.proposer_id) {
      throw new ExecutionError('appellant_id must match proposer_id');
    }

    const sanction = this.state.getSanction(payload.sanction_id);
    if (!sanction) {
      throw new ExecutionError(`sanction not found: ${payload.sanction_id}`);
    }

    const timestamp = this.clock();
    const appeal: AppealRecord = {
      id: envelope.id,
      sanction_id: payload.sanction_id,
      appellant_id: payload.appellant_id,
      reason: payload.reason,
      created_at: timestamp,
      status: 'PENDING',
    };
    this.state.addAppeal(appeal);

    if (sanction.status === 'APPLIED') {
      this.state.updateSanction({ ...sanction, status: 'UNDER_APPEAL' });
    }

    const { prev_hash, sequence } = this.ledger.getNextMeta();
    const eventId = this.deriveEventId(envelope, prev_hash, sequence);
    const event = this.ledger.append({
      id: eventId,
      timestamp,
      type: 'BLUEPRINT_EXEC',
      actor_id: envelope.proposer_id,
      blueprint_id: envelope.id,
    });

    return { event, minted: [], burned: [] };
  }

  private createPolicyContext(now: string): RunnerPolicyContext {
    return { ledger: this.ledger, state: this.state, now };
  }

  private cloneSnapshots(snapshots: StateSnapshot[]): StateSnapshot[] {
    return JSON.parse(JSON.stringify(snapshots)) as StateSnapshot[];
  }

  private assertValidEnvelope(envelope: BlueprintEnvelope): void {
    if (!envelope?.id) {
      throw new ValidationError('blueprint envelope is missing id');
    }
    if (!envelope.kind) {
      throw new ValidationError('blueprint envelope is missing kind');
    }
    if (!envelope.created_at) {
      throw new ValidationError('blueprint envelope is missing created_at');
    }
    if (!envelope.proposer_id) {
      throw new ValidationError('blueprint envelope is missing proposer_id');
    }
    if (!envelope.payload) {
      throw new ValidationError('blueprint envelope payload is missing');
    }
  }

  private assertMintPayload(payload: MintEventPayload): void {
    if (!payload) {
      throw new ValidationError('mint payload is required');
    }
    if (!payload.token_type) {
      throw new ValidationError('mint payload token_type is required');
    }
    if (!payload.token_template) {
      throw new ValidationError('mint payload token_template is required');
    }
    if (!payload.mint_to) {
      throw new ValidationError('mint payload mint_to is required');
    }
    if (!Number.isInteger(payload.amount) || payload.amount < 1) {
      throw new ValidationError('mint payload amount must be >= 1');
    }
  }

  private assertCraftPayload(payload: CraftPayload): void {
    if (!payload) {
      throw new ValidationError('craft payload is required');
    }
    if (!payload.recipe_id) {
      throw new ValidationError('craft payload recipe_id is required');
    }
    if (!payload.inputs || payload.inputs.length === 0) {
      throw new ValidationError('craft payload inputs are required');
    }
    if (!payload.output?.token_template) {
      throw new ValidationError('craft payload output token_template is required');
    }
    if (!Number.isInteger(payload.output.amount) || payload.output.amount < 1) {
      throw new ValidationError('craft payload output amount must be >= 1');
    }
    if (!Number.isFinite(payload.craft_fee_cc) || payload.craft_fee_cc < 0) {
      throw new ValidationError('craft payload craft_fee_cc must be >= 0');
    }
  }

  private assertQuestContractPayload(payload: QuestContractPayload): void {
    if (!payload) {
      throw new ValidationError('quest contract payload is required');
    }
    if (!payload.deliverable_type) {
      throw new ValidationError('quest contract deliverable_type is required');
    }
    if (!payload.acceptance_criteria || payload.acceptance_criteria.length === 0) {
      throw new ValidationError('quest contract acceptance_criteria are required');
    }
  }

  private assertWorkSubmissionPayload(payload: WorkSubmissionPayload): void {
    if (!payload) {
      throw new ValidationError('work submission payload is required');
    }
    if (!payload.contract_id) {
      throw new ValidationError('work submission contract_id is required');
    }
    if (!payload.artifacts || payload.artifacts.length === 0) {
      throw new ValidationError('work submission artifacts are required');
    }
  }

  private assertVerificationStampPayload(payload: VerificationStampPayload): void {
    if (!payload) {
      throw new ValidationError('verification stamp payload is required');
    }
    if (!payload.job_id) {
      throw new ValidationError('verification stamp job_id is required');
    }
    if (!payload.verifier_id) {
      throw new ValidationError('verification stamp verifier_id is required');
    }
    if (!payload.decision) {
      throw new ValidationError('verification stamp decision is required');
    }
    if (!Number.isFinite(payload.stake_cc_locked) || payload.stake_cc_locked < 0) {
      throw new ValidationError('verification stamp stake_cc_locked must be >= 0');
    }
  }

  private assertVerificationJobAcceptPayload(payload: VerificationJobAcceptPayload): void {
    if (!payload) {
      throw new ValidationError('verification job accept payload is required');
    }
    if (!payload.job_id) {
      throw new ValidationError('verification job accept job_id is required');
    }
    if (!payload.verifier_id) {
      throw new ValidationError('verification job accept verifier_id is required');
    }
    if (!Number.isFinite(payload.stake_cc_locked) || payload.stake_cc_locked < 0) {
      throw new ValidationError('verification job accept stake_cc_locked must be >= 0');
    }
  }

  private assertSanctionPayload(payload: SanctionPayload): void {
    if (!payload) {
      throw new ValidationError('sanction payload is required');
    }
    if (!payload.target_type) {
      throw new ValidationError('sanction target_type is required');
    }
    if (!payload.target_id) {
      throw new ValidationError('sanction target_id is required');
    }
    if (!payload.action) {
      throw new ValidationError('sanction action is required');
    }
    if (!payload.reason) {
      throw new ValidationError('sanction reason is required');
    }
    if (payload.action === 'SLASH' && payload.target_type !== 'STAKE') {
      throw new ValidationError('slashing requires STAKE target');
    }
    if (payload.action === 'REJECT' && payload.target_type !== 'SUBMISSION') {
      throw new ValidationError('rejection requires SUBMISSION target');
    }
    if (payload.action === 'FLAG' && payload.target_type !== 'ACCOUNT') {
      throw new ValidationError('flagging requires ACCOUNT target');
    }
    if (payload.amount_cc !== undefined && (!Number.isFinite(payload.amount_cc) || payload.amount_cc < 0)) {
      throw new ValidationError('sanction amount_cc must be >= 0');
    }
  }

  private assertAppealPayload(payload: AppealPayload): void {
    if (!payload) {
      throw new ValidationError('appeal payload is required');
    }
    if (!payload.sanction_id) {
      throw new ValidationError('appeal sanction_id is required');
    }
    if (!payload.appellant_id) {
      throw new ValidationError('appeal appellant_id is required');
    }
    if (!payload.reason) {
      throw new ValidationError('appeal reason is required');
    }
  }

  private assertQuestFunding(envelope: BlueprintEnvelope): void {
    if (!envelope.funding?.escrow_required) {
      throw new ValidationError('quest contract requires escrow funding');
    }
    if (!envelope.funding.sponsor_id) {
      throw new ValidationError('quest contract sponsor_id is required');
    }
    if (!Number.isFinite(envelope.funding.escrow_cc_amount) || envelope.funding.escrow_cc_amount <= 0) {
      throw new ValidationError('quest contract escrow_cc_amount must be > 0');
    }
    const adminPercent = envelope.funding.fees?.admin_percent ?? 0;
    if (adminPercent < 0 || adminPercent > 1) {
      throw new ValidationError('quest contract admin_percent must be between 0 and 1');
    }
    if (!envelope.verification_plan?.required_stamps?.length) {
      throw new ValidationError('quest contract requires verification plan');
    }
    const requiredEscrow = this.estimateEscrowRequirement(envelope);
    if (requiredEscrow > envelope.funding.escrow_cc_amount) {
      throw new ValidationError('quest contract escrow_cc_amount below required payouts');
    }
  }

  private applyCraftFee(
    payload: CraftPayload,
    envelope: BlueprintEnvelope,
    timestamp: string,
  ) {
    if (!payload.craft_fee_cc || payload.craft_fee_cc === 0) {
      return undefined;
    }

    return this.state.transferCc(
      envelope.proposer_id,
      TREASURY_ACCOUNT_ID,
      payload.craft_fee_cc,
      timestamp,
      'CRAFT_FEE',
      true,
    );
  }

  private lockEscrowForContract(envelope: BlueprintEnvelope, timestamp: string) {
    const { cc_changes } = this.state.lockEscrow(
      envelope.id,
      envelope.funding.sponsor_id,
      envelope.funding.escrow_cc_amount,
      timestamp,
      'ESCROW_LOCK',
    );
    return cc_changes;
  }

  private applyFixedFee(
    envelope: BlueprintEnvelope,
    timestamp: string,
    ccChanges: ReturnType<RunnerState['transferCc']>,
  ): void {
    const fixedFee = envelope.funding.fees?.fixed_cc ?? 0;
    if (!fixedFee || fixedFee <= 0) {
      return;
    }

    const { cc_changes } = this.state.releaseEscrow(
      envelope.id,
      TREASURY_ACCOUNT_ID,
      fixedFee,
      timestamp,
      'ADMIN_FEE',
    );
    ccChanges.push(...cc_changes);
  }

  private refundEscrowToSponsor(
    contract: QuestContractRecord,
    timestamp: string,
  ): ReturnType<RunnerState['transferCc']> {
    const escrow = this.state.getEscrow(contract.id);
    if (!escrow || escrow.status !== 'OPEN' || escrow.balance_cc === 0) {
      return [];
    }

    const { cc_changes } = this.state.releaseEscrow(
      contract.id,
      contract.funding.sponsor_id,
      escrow.balance_cc,
      timestamp,
      'ESCROW_REFUND',
    );
    return cc_changes;
  }

  private releaseAuthorStipend(
    contract: QuestContractRecord,
    submission: WorkSubmissionRecord,
    timestamp: string,
  ) {
    const stipend = contract.payload.author_stipend_cc ?? 0;
    if (!stipend || stipend <= 0) {
      return [];
    }

    const { cc_changes } = this.state.releaseEscrow(
      contract.id,
      submission.proposer_id,
      stipend,
      timestamp,
      'AUTHOR_STIPEND',
    );
    return cc_changes;
  }

  private payVerifierAndFees(
    contract: QuestContractRecord,
    job: VerificationJob,
    verifierId: string,
    timestamp: string,
  ) {
    const ccChanges: ReturnType<RunnerState['transferCc']> = [];
    const adminPercent = contract.funding.fees?.admin_percent ?? 0;

    if (job.stamp_role === StampRole.AUDIT && contract.verification_plan.sampling_audit?.enabled) {
      if (job.current_pay_cc > 0) {
        this.budget?.assertCanSpend(job.current_pay_cc, timestamp, this.ledger);
        const auditPay = this.state.transferCc(
          TREASURY_ACCOUNT_ID,
          verifierId,
          job.current_pay_cc,
          timestamp,
          'AUDIT_PAY',
          true,
        );
        ccChanges.push(...auditPay);
      }
      return ccChanges;
    }

    if (adminPercent > 0) {
      const adminFee = job.current_pay_cc * adminPercent;
      if (adminFee > 0) {
        const feeRelease = this.state.releaseEscrow(
          contract.id,
          TREASURY_ACCOUNT_ID,
          adminFee,
          timestamp,
          'ADMIN_FEE',
        );
        ccChanges.push(...feeRelease.cc_changes);
      }
    }

    if (job.current_pay_cc > 0) {
      const payRelease = this.state.releaseEscrow(
        contract.id,
        verifierId,
        job.current_pay_cc,
        timestamp,
        'VERIFIER_PAY',
      );
      ccChanges.push(...payRelease.cc_changes);
    }

    return ccChanges;
  }

  private createVerificationJobs(
    plan: VerificationPlan,
    submissionId: string,
    timestamp: string,
  ): VerificationJob[] {
    const jobs: VerificationJob[] = [];
    for (const requirement of plan.required_stamps) {
      const count = Math.max(1, requirement.min_unique || 1);
      const timeoutMinutes =
        Number.isFinite(requirement.timeout_minutes) && requirement.timeout_minutes > 0
          ? requirement.timeout_minutes
          : 60;
      for (let index = 0; index < count; index += 1) {
        const jobId = hashObject({ submissionId, role: requirement.role, index, timestamp });
        const deadline = this.addMinutes(timestamp, timeoutMinutes);
        jobs.push({
          id: jobId,
          submission_id: submissionId,
          stamp_role: requirement.role,
          open_to_pool: true,
          eligible_verifiers: [],
          base_pay_cc: requirement.pay_cc,
          current_pay_cc: requirement.pay_cc,
          stake_required_cc: requirement.stake_cc,
          created_at: timestamp,
          deadline_at: deadline,
          escalation_history: [],
          status: 'OPEN',
        });
      }
    }
    return jobs;
  }

  private requeueAbstainJob(
    plan: VerificationPlan,
    job: VerificationJob,
    submissionId: string,
    timestamp: string,
  ): void {
    const requirement = plan.required_stamps.find((stamp) => stamp.role === job.stamp_role);
    if (!requirement) {
      return;
    }

    const newJobId = hashObject({ submissionId, role: job.stamp_role, timestamp, retry: job.id });
    const timeoutMinutes =
      Number.isFinite(requirement.timeout_minutes) && requirement.timeout_minutes > 0
        ? requirement.timeout_minutes
        : 60;
    const deadline = this.addMinutes(timestamp, timeoutMinutes);
    const requeued: VerificationJob = {
      id: newJobId,
      submission_id: submissionId,
      stamp_role: requirement.role,
      open_to_pool: true,
      eligible_verifiers: [],
      base_pay_cc: requirement.pay_cc,
      current_pay_cc: requirement.pay_cc,
      stake_required_cc: requirement.stake_cc,
      created_at: timestamp,
      deadline_at: deadline,
      escalation_history: [],
      status: 'OPEN',
    };
    this.state.addVerificationJob(requeued);
  }

  private releaseStakeIfLocked(job: VerificationJob, verifierId: string, timestamp: string) {
    const existing = this.state.getStakeLockForJob(job.id, verifierId);
    if (!existing) {
      return [];
    }
    if (existing.status !== 'LOCKED') {
      return [];
    }
    const release = this.state.releaseStake(job.id, verifierId, timestamp, 'STAKE_RELEASE');
    return release.cc_changes;
  }

  private rejectSubmission(
    submission: WorkSubmissionRecord,
    contract: QuestContractRecord,
    timestamp: string,
    excludeJobIds: string[],
  ): { submission: WorkSubmissionRecord; cc_changes: ReturnType<RunnerState['transferCc']> } {
    if (submission.status === 'REJECTED') {
      return { submission, cc_changes: [] };
    }

    const nextSubmission: WorkSubmissionRecord = {
      ...submission,
      status: 'REJECTED',
      minted: false,
    };

    const ccChanges: ReturnType<RunnerState['transferCc']> = [];
    const expired = this.expireJobsForSubmission(submission.id, timestamp, excludeJobIds);
    if (expired.length > 0) {
      ccChanges.push(...expired);
    }

    const refunded = this.refundEscrowToSponsor(contract, timestamp);
    if (refunded.length > 0) {
      ccChanges.push(...refunded);
    }

    return { submission: nextSubmission, cc_changes: ccChanges };
  }

  private expireJobsForSubmission(
    submissionId: string,
    timestamp: string,
    excludeJobIds: string[],
  ) {
    const ccChanges: ReturnType<RunnerState['transferCc']> = [];
    const jobs = this.state.listVerificationJobsBySubmission(submissionId);
    for (const job of jobs) {
      if (excludeJobIds.includes(job.id)) {
        continue;
      }
      if (job.status === 'COMPLETED') {
        continue;
      }
      const updated: VerificationJob = { ...job, status: 'EXPIRED' };
      this.state.updateVerificationJob(updated);
      if (job.assigned_to) {
        const release = this.releaseStakeIfLocked(job, job.assigned_to, timestamp);
        ccChanges.push(...release);
      }
    }
    return ccChanges;
  }

  private handleAuditSampling(
    plan: VerificationPlan,
    submission: WorkSubmissionRecord,
    timestamp: string,
  ): 'AUDIT_REQUIRED' | 'NO_AUDIT' {
    const audit = plan.sampling_audit;
    if (!audit?.enabled) {
      return 'NO_AUDIT';
    }

    const shouldSample = this.shouldSampleAudit(submission.id, audit.rate);
    if (!shouldSample) {
      return 'NO_AUDIT';
    }

    const existingAudit = this.state
      .listVerificationJobsBySubmission(submission.id)
      .some((job) => job.stamp_role === StampRole.AUDIT);
    if (!existingAudit) {
      const auditJob = this.createAuditJob(submission.id, audit.audit_pay_cc ?? 0, timestamp);
      this.state.addVerificationJob(auditJob);
    }

    return 'AUDIT_REQUIRED';
  }

  private shouldSampleAudit(submissionId: string, rate: number): boolean {
    if (!Number.isFinite(rate) || rate <= 0) {
      return false;
    }
    if (rate >= 1) {
      return true;
    }
    const hash = hashObject({ submissionId, rate });
    const sample = parseInt(hash.slice(0, 8), 16) / 0xffffffff;
    return sample < rate;
  }

  private createAuditJob(submissionId: string, payCc: number, timestamp: string): VerificationJob {
    const jobId = hashObject({ submissionId, role: 'AUDIT', timestamp });
    const deadline = this.addMinutes(timestamp, 240);
    return {
      id: jobId,
      submission_id: submissionId,
      stamp_role: StampRole.AUDIT,
      open_to_pool: true,
      eligible_verifiers: [],
      base_pay_cc: payCc,
      current_pay_cc: payCc,
      stake_required_cc: 0,
      created_at: timestamp,
      deadline_at: deadline,
      escalation_history: [],
      status: 'OPEN',
    };
  }

  private estimateEscrowRequirement(envelope: BlueprintEnvelope): number {
    const payload = envelope.payload as QuestContractPayload;
    const stipend = payload?.author_stipend_cc ?? 0;
    const adminPercent = envelope.funding.fees?.admin_percent ?? 0;
    let verifierPayTotal = 0;

    for (const requirement of envelope.verification_plan.required_stamps) {
      const count = Math.max(1, requirement.min_unique || 1);
      verifierPayTotal += requirement.pay_cc * count;
    }

    const adminFee = verifierPayTotal * adminPercent;
    return stipend + verifierPayTotal + adminFee + (envelope.funding.fees?.fixed_cc ?? 0);
  }


  private ensureJobAssignment(job: VerificationJob, verifierId: string): VerificationJob {
    if (job.status === 'COMPLETED') {
      throw new ExecutionError(`verification job already completed: ${job.id}`);
    }
    if (job.status !== 'ASSIGNED') {
      throw new ExecutionError(`verification job not accepted: ${job.id}`);
    }
    if (job.assigned_to !== verifierId) {
      throw new ExecutionError(`verification job assigned to different verifier: ${job.id}`);
    }
    return job;
  }

  private parseStakeTarget(targetId: string): { jobId: string; verifierId: string } {
    const [jobId, verifierId] = targetId.split(':');
    if (!jobId || !verifierId) {
      throw new ValidationError('stake target_id must be jobId:verifierId');
    }
    return { jobId, verifierId };
  }

  private checkStampRequirements(
    plan: VerificationPlan,
    stamps: VerificationStampRecord[],
  ): { satisfied: boolean; stampIds: string[] } {
    const byRole = new Map<string, Set<string>>();
    const stampIds: string[] = [];

    for (const stamp of stamps) {
      stampIds.push(stamp.id);
      const existing = byRole.get(stamp.role) ?? new Set();
      existing.add(stamp.verifier_id);
      byRole.set(stamp.role, existing);
    }

    for (const requirement of plan.required_stamps) {
      const set = byRole.get(requirement.role) ?? new Set();
      if (set.size < requirement.min_unique) {
        return { satisfied: false, stampIds };
      }
    }

    return { satisfied: true, stampIds };
  }

  private mintRewards(
    contract: QuestContractRecord,
    submission: WorkSubmissionRecord,
    stampIds: string[],
    timestamp: string,
    envelope: BlueprintEnvelope,
  ): Token[] {
    const rewards = contract.payload.mint_rewards ?? [];
    if (rewards.length === 0) {
      return [];
    }

    const requested = submission.payload.requested_mint ?? [];
    const allowed = requested.length === 0 ? null : new Set(requested);
    const artifactHashes = submission.payload.artifacts.map((artifact) => artifact.hash);
    const { prev_hash, sequence } = this.ledger.getNextMeta();
    const eventId = this.deriveEventId(envelope, prev_hash, sequence);

    const minted: Token[] = [];
    let index = 0;

    for (const reward of rewards) {
      if (allowed && !allowed.has(reward.token_type)) {
        continue;
      }
      const mintTo = this.resolveMintTarget(reward.mint_to, submission, contract);
      for (let count = 0; count < reward.amount; count += 1) {
        minted.push({
          id: this.deriveTokenId(eventId, index, reward.token_type, this.templateForToken(reward.token_type)),
          type: reward.token_type,
          template: this.templateForToken(reward.token_type),
          owner_id: mintTo,
          status: TokenStatus.ACTIVE,
          mint_event_id: eventId,
          proof_refs: artifactHashes,
          stamp_ids: stampIds,
          created_at: timestamp,
          updated_at: timestamp,
        });
        index += 1;
      }
    }

    for (const token of minted) {
      this.state.addToken(token);
    }

    return minted;
  }

  private resolveMintTarget(
    mintTo: 'AUTHOR' | 'ESCROW' | 'SPONSOR',
    submission: WorkSubmissionRecord,
    contract: QuestContractRecord,
  ): string {
    if (mintTo === 'AUTHOR') {
      return submission.proposer_id;
    }
    if (mintTo === 'ESCROW') {
      return `${ESCROW_ACCOUNT_PREFIX}${contract.id}`;
    }
    return contract.funding.sponsor_id;
  }

  private templateForToken(tokenType: TokenType): string {
    switch (tokenType) {
      case TokenType.ORE:
        return 'ore';
      case TokenType.IRON:
        return 'iron_ingot';
      case TokenType.STEEL:
        return 'steel_ingot';
      case TokenType.SEAL_BRONZE:
        return 'seal_bronze';
      case TokenType.SEAL_SILVER:
        return 'seal_silver';
      case TokenType.SEAL_GOLD:
        return 'seal_gold';
      case TokenType.ITEM:
      default:
        return 'item';
    }
  }

  private addMinutes(base: string, minutes: number): string {
    const baseDate = new Date(base);
    if (Number.isNaN(baseDate.getTime())) {
      throw new ValidationError('invalid timestamp');
    }
    const delta = minutes * 60 * 1000;
    return new Date(baseDate.getTime() + delta).toISOString();
  }

  private deriveStampId(jobId: string, verifierId: string, timestamp: string, decision: StampDecision): string {
    return hashObject({ jobId, verifierId, timestamp, decision });
  }

  private deriveEventId(
    envelope: BlueprintEnvelope,
    prev_hash: string,
    sequence: number,
  ): string {
    return hashObject({
      prev_hash,
      sequence,
      blueprint_id: envelope.id,
      kind: envelope.kind,
      proposer_id: envelope.proposer_id,
    });
  }

  private deriveTokenId(
    eventId: string,
    index: number,
    tokenType: TokenType,
    tokenTemplate: string,
  ): string {
    return hashObject({
      event_id: eventId,
      index,
      token_type: tokenType,
      token_template: tokenTemplate,
    });
  }
}
